// Same corpus, same results: runs the 12 lexical tests on a folder of texts
// and writes every result file, so two builds can be compared table by
// table. Skipped unless PARITY_DIR is set.
//
//   PARITY_DIR      folder of .txt/.md files (the corpus)
//   PARITY_OUT      output folder (one subfolder per test, plus _summary.json)
//   PARITY_CATALOG  lexical-catalog.ts whose default parameters are used
//   PARITY_TESTS    comma list (default: all 12)
//   PARITY_PARAMS   JSON merged over the defaults
//   PARITY_RESOURCES folder holding lexical/ (default: the repository's
//                   resources/; an installed app's own to check its files)
//   PARITY_DATA     the helper's data folder (default: a new temporary one)
//   PARITY_INSTALL  1 = first install the tests' R packages through the
//                   helper, as the R panel does (checks installing works)
//
// Two ways to run:
//   PARITY_ENGINE=<…/lexical folder>   call that engine's test runners in
//                                      this Node (e.g. the Electron build's
//                                      src/main/lexical, read in place)
//   PARITY_HELPER=<labiia-helper.cjs>  ask the bundled helper, through its
//   PARITY_NODE=<node.exe>             stdin/stdout protocol, exactly as the
//                                      app does
import { it } from 'vitest'
import { spawn } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { pathToFileURL } from 'url'

const RES = process.env.PARITY_RESOURCES || join(__dirname, '..', '..', 'resources')
const TESTS = ['wordcloud', 'bigrams', 'trigrams', 'word-tree', 'yake', 'keyword-associations', 'sentiment', 'emotions', 'similitude', 'lda', 'thematic-map', 'chd']

type Result = { ok?: boolean; files?: { name: string; data?: string }[]; summary?: unknown; error?: string; detail?: string }

async function defaults(): Promise<Record<string, Record<string, unknown>>> {
  const { LEXICAL_TESTS } = await import(pathToFileURL(process.env.PARITY_CATALOG!).href)
  return Object.fromEntries(
    (LEXICAL_TESTS as { id: string; params: { key: string; default: unknown }[] }[]).map((t) => [
      t.id,
      { ...Object.fromEntries(t.params.map((p) => [p.key, p.default])), ...JSON.parse(process.env.PARITY_PARAMS ?? '{}') }
    ])
  )
}

function save(out: string, testId: string, res: Result): void {
  const dir = join(out, testId)
  mkdirSync(dir, { recursive: true })
  for (const f of res.files ?? []) if (f.data) writeFileSync(join(dir, f.name), Buffer.from(f.data, 'base64'))
  writeFileSync(join(dir, '_summary.json'), JSON.stringify({ summary: res.summary, error: res.error, detail: res.detail }, null, 1))
}

it.skipIf(!process.env.PARITY_DIR)('parity run', async () => {
  const dir = process.env.PARITY_DIR!
  const out = process.env.PARITY_OUT!
  const units = readdirSync(dir)
    .sort()
    .map((f) => ({ id: f, name: f, text: readFileSync(join(dir, f), 'utf-8'), variables: [] as string[] }))
  const params = await defaults()
  const wanted = (process.env.PARITY_TESTS ?? TESTS.join(',')).split(',')

  if (process.env.PARITY_HELPER) {
    const data = process.env.PARITY_DATA || mkdtempSync(join(tmpdir(), 'parity-data-'))
    mkdirSync(data, { recursive: true })
    const child = spawn(process.env.PARITY_NODE ?? process.execPath, [process.env.PARITY_HELPER, '--resources', RES, '--data', data], { stdio: ['pipe', 'pipe', 'inherit'] })
    const waiting = new Map<number, (r: { ok: boolean; result?: Result; error?: string }) => void>()
    let buf = ''
    child.stdout.on('data', (d: Buffer) => {
      buf += d.toString('utf8')
      let i: number
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        const msg = JSON.parse(line)
        if (typeof msg.id === 'number') waiting.get(msg.id)?.(msg)
      }
    })
    let id = 1
    const call = (method: string, p: unknown): Promise<{ ok: boolean; result?: Result; error?: string }> =>
      new Promise((resolve) => {
        const n = id++
        waiting.set(n, resolve)
        child.stdin.write(JSON.stringify({ id: n, method, params: p }) + '\n')
      })
    if (process.env.PARITY_INSTALL === '1') {
      const { LEXICAL_R_PACKAGES } = await import('../../src/renderer/models/lexical-api')
      const packages = [...new Set(Object.values(LEXICAL_R_PACKAGES).flat())]
      const t0 = Date.now()
      const r = await call('lexical.installPackages', { packages })
      console.log('install', JSON.stringify({ ...(r.result ?? {}), log: undefined }), r.error ?? '', Date.now() - t0, 'ms')
      mkdirSync(out, { recursive: true })
      writeFileSync(join(out, '_install.json'), JSON.stringify(r, null, 1))
    }
    for (const testId of wanted) {
      const t1 = Date.now()
      const r = await call('lexical.run', { runId: `parity-${testId}`, testId, language: 'pt', params: params[testId], units })
      const res: Result = r.ok ? r.result! : { error: r.error }
      save(out, testId, res)
      console.log(testId, res.error ?? 'ok', Date.now() - t1, 'ms')
    }
    child.stdin.end()
    return
  }

  // In-process: the given engine's runners, as the Electron build's harness did.
  const eng = process.env.PARITY_ENGINE!
  const imp = (p: string): Promise<Record<string, unknown>> => import(pathToFileURL(join(eng, p)).href)
  const { handle } = (await imp('lexical-worker.ts')) as { handle: (req: unknown, post: () => void) => unknown }
  const { sortByDocumentName } = (await imp('corpus/prepare.ts')) as { sortByDocumentName: <T>(u: T[]) => T[] }
  const { resolveR } = (await imp('r-runtime.ts')) as { resolveR: (r: boolean) => Promise<{ installation?: unknown }> }
  const ng = await imp('tests/ngrams.ts')
  const runners: Record<string, unknown> = {
    wordcloud: (await imp('tests/wordcloud.ts')).runWordcloud,
    bigrams: ng.runBigrams,
    trigrams: ng.runTrigrams,
    'word-tree': (await imp('tests/word-tree.ts')).runWordTree,
    yake: (await imp('tests/yake.ts')).runYake,
    'keyword-associations': (await imp('tests/keyword-associations.ts')).runKeywordAssociations,
    sentiment: (await imp('tests/sentiment.ts')).runSentiment,
    emotions: (await imp('tests/emotions.ts')).runEmotions,
    similitude: (await imp('tests/similitude.ts')).runSimilitude,
    lda: (await imp('tests/lda.ts')).runLda,
    'thematic-map': (await imp('tests/thematic-map.ts')).runThematicMap,
    chd: (await imp('tests/chd.ts')).runChd
  }
  const resourcesDir = join(RES, 'lexical')
  const key = 'parity'
  let id = 1
  const call = <T,>(req: object): Promise<T> => Promise.resolve(handle({ ...req, id: id++ }, () => {}) as T)
  await call({ type: 'prepare', key, units: sortByDocumentName(units), options: { language: 'pt', uceSize: 40, segmentCount: 'content' }, resourcesDir, cacheDir: mkdtempSync(join(tmpdir(), 'parity-cache-')) })
  const r = (await resolveR(true)).installation ?? null
  for (const testId of wanted) {
    const t1 = Date.now()
    const res = (await (runners[testId] as (ctx: unknown) => Promise<Result>)({
      runId: `parity-${testId}`, key, runDir: mkdtempSync(join(tmpdir(), `parity-${testId}-`)), resourcesDir,
      params: params[testId], language: 'pt', r, worker: call, progress: () => {}, isCancelled: () => false
    }))
    save(out, testId, res)
    console.log(testId, res.error ?? 'ok', Date.now() - t1, 'ms')
  }
}, 3_600_000)
