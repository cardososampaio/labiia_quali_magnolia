/**
 * Runs a lexical test: prepares the corpus (or takes it from the cache) in
 * the background thread, then hands it to the test, which may call R.
 * Progress goes back to the window; Cancel stops the thread and R.
 */
import { app } from 'electron'
import { Worker } from 'worker_threads'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import workerPath from './lexical-worker?modulePath'
import { corpusKey, hasCachedCorpus } from './corpus/cache'
import type { PrepareOptions, TextUnitInput } from './corpus/prepare'
import type { WorkerMessage, WorkerRequest, PrepareResult } from './lexical-worker'
import { cancelRun } from './r-runner'
import { resolveR, type RInstallation } from './r-runtime'
import { checkPackages } from './r-packages'
import { LEXICAL_R_PACKAGES, type LexicalRunRequest, type LexicalRunResult, type LexicalRunProgress } from '../../renderer/models/lexical-api'
import { runWordcloud } from './tests/wordcloud'
import { runBigrams, runTrigrams } from './tests/ngrams'
import { runWordTree } from './tests/word-tree'
import { runYake } from './tests/yake'

/** Bundled R scripts, dictionaries and stopword lists. */
export function lexicalResourcesDir(): string {
  const packaged = join(process.resourcesPath ?? '', 'lexical')
  if (app.isPackaged && existsSync(packaged)) return packaged
  return join(app.getAppPath(), 'resources', 'lexical')
}

export function lexicalCacheDir(): string {
  return join(app.getPath('userData'), 'lexical-cache')
}

/** A worker request without its id (the engine numbers them). */
type WorkerCall = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, 'id'> : never) : never

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (done: number, total: number) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(workerPath)
  w.on('message', (m: WorkerMessage) => {
    const p = pending.get(m.id)
    if (!p) return
    if (m.type === 'progress') p.onProgress?.(m.done, m.total)
    else {
      pending.delete(m.id)
      if (m.type === 'result') p.resolve(m.value)
      else p.reject(new Error(m.message))
    }
  })
  const failAll = (err: Error): void => {
    for (const p of pending.values()) p.reject(err)
    pending.clear()
    if (worker === w) worker = null
  }
  w.on('error', failAll)
  w.on('exit', () => failAll(new Error('cancelled')))
  worker = w
  return w
}

function callWorker<T>(req: WorkerCall, onProgress?: (done: number, total: number) => void): Promise<T> {
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress })
    getWorker().postMessage({ ...req, id } as WorkerRequest)
  })
}

/** What a test receives to do its work. */
export interface TestContext {
  runId: string
  key: string
  runDir: string
  resourcesDir: string
  params: Record<string, number | string | boolean>
  language: PrepareOptions['language']
  r: RInstallation | null
  worker: <T>(req: WorkerCall) => Promise<T>
  progress: (p: Omit<LexicalRunProgress, 'runId'>) => void
  isCancelled: () => boolean
}

type TestRunner = (ctx: TestContext) => Promise<Omit<LexicalRunResult, 'ok' | 'corpus'>>

const TESTS: Record<string, { runner: TestRunner; rPackages: string[] }> = {
  wordcloud: { runner: runWordcloud, rPackages: LEXICAL_R_PACKAGES.wordcloud },
  bigrams: { runner: runBigrams, rPackages: [] },
  trigrams: { runner: runTrigrams, rPackages: [] },
  'word-tree': { runner: runWordTree, rPackages: [] },
  yake: { runner: runYake, rPackages: [] }
}

const cancelled = new Set<string>()

export function cancelLexicalRun(runId: string): void {
  cancelled.add(runId)
  cancelRun(runId)
  // Ending the thread is the only way to stop a preparation midway; a new one starts on the next run.
  if (worker) {
    void worker.terminate()
    worker = null
  }
}

export async function runLexicalTest(req: LexicalRunRequest, send: (p: LexicalRunProgress) => void): Promise<LexicalRunResult> {
  const test = TESTS[req.testId]
  if (!test) return { ok: false, error: 'not-available' }
  const units: TextUnitInput[] = req.units.filter((u) => u.text.trim())
  if (units.length === 0) return { ok: false, error: 'no-text' }

  let r: RInstallation | null = null
  if (test.rPackages.length > 0) {
    const status = await resolveR()
    if (!status.found || !status.installation) return { ok: false, error: 'r-not-found' }
    r = status.installation
    const pkgs = await checkPackages(r, test.rPackages)
    const missing = test.rPackages.filter((p) => !pkgs[p])
    if (missing.length > 0) return { ok: false, error: 'r-packages-missing', missingPackages: missing }
  }

  const resourcesDir = lexicalResourcesDir()
  const cacheDir = lexicalCacheDir()
  const options: PrepareOptions = { language: req.language, uceSize: 40 }
  const key = corpusKey(units, options)
  const progress = (p: Omit<LexicalRunProgress, 'runId'>): void => send({ runId: req.runId, ...p })

  const base = join(app.getPath('temp'), 'labiia-lexical')
  mkdirSync(base, { recursive: true })
  const runDir = mkdtempSync(join(base, `${req.testId}-`))
  try {
    const cached = hasCachedCorpus(cacheDir, key)
    progress({ stage: 'prepare', cached, done: 0, total: units.length })
    const prepared = await callWorker<PrepareResult>(
      { type: 'prepare', key, units, options, resourcesDir, cacheDir },
      (done, total) => progress({ stage: 'prepare', cached: false, done, total })
    )
    if (cancelled.has(req.runId)) return { ok: false, error: 'cancelled' }
    progress({ stage: 'compute', cached: prepared.fromCache })
    const out = await test.runner({
      runId: req.runId,
      key,
      runDir,
      resourcesDir,
      params: req.params,
      language: req.language,
      r,
      worker: (wr) => callWorker(wr),
      progress,
      isCancelled: () => cancelled.has(req.runId)
    })
    if (cancelled.has(req.runId)) return { ok: false, error: 'cancelled' }
    return { ok: !out.error, corpus: { ...prepared.stats, fromCache: prepared.fromCache }, ...out }
  } catch (err) {
    if (cancelled.has(req.runId)) return { ok: false, error: 'cancelled' }
    return { ok: false, error: 'failed', detail: err instanceof Error ? err.message : String(err) }
  } finally {
    cancelled.delete(req.runId)
    rmSync(runDir, { recursive: true, force: true })
  }
}
