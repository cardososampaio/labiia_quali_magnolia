/**
 * Background thread for the lexical analyses: prepares corpora (or reads
 * them from the cache) and does the counting the tests need, so the window
 * stays responsive on large corpora. The main process talks to it through
 * messages (see engine.ts); Cancel ends the thread.
 */
import { parentPort } from 'worker_threads'
import { Lexicon, type CorpusLanguage } from './corpus/lexicon'
import { prepareCorpus, wordFrequencies, type PreparedCorpus, type PrepareOptions, type TextUnitInput } from './corpus/prepare'
import { readCachedCorpus, writeCachedCorpus, hasCachedCorpus } from './corpus/cache'
import { ngramNetwork } from './analyses/ngrams'
import { wordTree, type WordTreeOptions } from './analyses/word-tree'

export type WorkerRequest =
  | { id: number; type: 'prepare'; key: string; units: TextUnitInput[]; options: PrepareOptions; resourcesDir: string; cacheDir: string }
  | { id: number; type: 'word-frequencies'; key: string; resourcesDir: string; useLemmas: boolean; activeOnly: boolean }
  | { id: number; type: 'ngram-network'; key: string; resourcesDir: string; n: 2 | 3; minFreq: number; topEdges: number; title: string }
  | { id: number; type: 'word-tree'; key: string; resourcesDir: string; options: WordTreeOptions }

export type WorkerMessage =
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'result'; value: unknown }
  | { id: number; type: 'error'; message: string }

const lexicons = new Map<string, Lexicon>()
function lexiconFor(language: CorpusLanguage, resourcesDir: string): Lexicon {
  let lex = lexicons.get(language)
  if (!lex) {
    lex = new Lexicon(language, resourcesDir)
    lexicons.set(language, lex)
  }
  return lex
}

// The last corpora used stay in memory, so several runs on the same
// documents read the cache file only once.
const MEMORY_SLOTS = 2
const corpora = new Map<string, PreparedCorpus>()
function remember(key: string, c: PreparedCorpus): void {
  corpora.delete(key)
  corpora.set(key, c)
  while (corpora.size > MEMORY_SLOTS) corpora.delete(corpora.keys().next().value as string)
}

function corpusFor(key: string): PreparedCorpus {
  const c = corpora.get(key)
  if (!c) throw new Error('corpus-not-prepared')
  return c
}

export interface PrepareResult {
  fromCache: boolean
  stats: PreparedCorpus['stats']
}

function handle(msg: WorkerRequest, post: (m: WorkerMessage) => void): unknown {
  if (msg.type === 'prepare') {
    const inMemory = corpora.get(msg.key)
    if (inMemory) return { fromCache: true, stats: inMemory.stats } satisfies PrepareResult
    if (hasCachedCorpus(msg.cacheDir, msg.key)) {
      const cached = readCachedCorpus(msg.cacheDir, msg.key)
      if (cached) {
        remember(msg.key, cached)
        return { fromCache: true, stats: cached.stats } satisfies PrepareResult
      }
    }
    const lex = lexiconFor(msg.options.language, msg.resourcesDir)
    const corpus = prepareCorpus(msg.units, lex, msg.options, (p) => post({ id: msg.id, type: 'progress', ...p }))
    try {
      writeCachedCorpus(msg.cacheDir, msg.key, corpus)
    } catch {
      // A full or read-only disk only costs the next run its cache.
    }
    remember(msg.key, corpus)
    return { fromCache: false, stats: corpus.stats } satisfies PrepareResult
  }
  if (msg.type === 'word-frequencies') {
    const c = corpusFor(msg.key)
    const lex = lexiconFor(c.language, msg.resourcesDir)
    return wordFrequencies(c, { useLemmas: msg.useLemmas, activeOnly: msg.activeOnly, isDisplayTerm: (w) => lex.isDisplayTerm(w) })
  }
  if (msg.type === 'ngram-network') {
    const c = corpusFor(msg.key)
    return ngramNetwork(c, lexiconFor(c.language, msg.resourcesDir), { n: msg.n, minFreq: msg.minFreq, topEdges: msg.topEdges, title: msg.title })
  }
  if (msg.type === 'word-tree') {
    const c = corpusFor(msg.key)
    return wordTree(c, lexiconFor(c.language, msg.resourcesDir), msg.options)
  }
  throw new Error(`unknown request ${(msg as { type: string }).type}`)
}

parentPort?.on('message', (msg: WorkerRequest) => {
  const post = (m: WorkerMessage): void => parentPort!.postMessage(m)
  try {
    post({ id: msg.id, type: 'result', value: handle(msg, post) })
  } catch (err) {
    post({ id: msg.id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
})
