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
import { yakeKeyphrases, type Keyphrase } from './analyses/yake'
import { rankingBars } from './plot/bars'
import type { BarFigure, PanelBarsFigure, RadialFigure, VBarFigure } from '../../renderer/models/lexical-figures'
import { sentiment, loadOpLexicon, type SentimentResult } from './analyses/sentiment'
import { similitudeMatrix, matrixCsv } from './analyses/similitude'
import { ldaInput } from './analyses/lda'
import { thematicMap, type ThematicOptions } from './analyses/thematic-map'
import { keywordAssociations, type Collocate } from './analyses/keyword-associations'
import { associationBars, associationRadial } from './plot/association-figures'

export interface YakeRun { keyphrases: Keyphrase[]; figure: BarFigure }

/** The prepared segments as running text, one segment per line (input of the R text engines). */
export interface CorpusText { text: string }

export type SimilitudeRun = { matrixCsv: string; freqCsv: string; terms: number; segments: number } | null

export interface SentimentRun { result: SentimentResult; figure: VBarFigure }

export type AssociationsRun =
  | { focalTerms: string[]; missing: string[]; collocates: Map<string, Collocate[]>; segments: number; examples: [string, string, string][]; bars: PanelBarsFigure; radial: RadialFigure }
  | { error: 'too-small' }
  | { error: 'focal-not-found'; requested: string[] }

export type WorkerRequest =
  | { id: number; type: 'prepare'; key: string; units: TextUnitInput[]; options: PrepareOptions; resourcesDir: string; cacheDir: string }
  | { id: number; type: 'word-frequencies'; key: string; resourcesDir: string; useLemmas: boolean; activeOnly: boolean }
  | { id: number; type: 'ngram-network'; key: string; resourcesDir: string; n: 2 | 3; minFreq: number; topEdges: number; title: string }
  | { id: number; type: 'word-tree'; key: string; resourcesDir: string; options: WordTreeOptions }
  | { id: number; type: 'keyword-associations'; key: string; resourcesDir: string; options: { focalTerms: string; topN: number; minJoint: number; minFreq: number; useLemmas: boolean } }
  | { id: number; type: 'corpus-text'; key: string }
  | { id: number; type: 'thematic-map'; key: string; resourcesDir: string; options: ThematicOptions }
  | { id: number; type: 'lda-input'; key: string; resourcesDir: string; options: { minFreq: number; maxFeatures: number; useLemmas: boolean } }
  | { id: number; type: 'similitude-matrix'; key: string; resourcesDir: string; options: { minFreq: number; maxTerms: number; useLemmas: boolean; coefficient: string } }
  | { id: number; type: 'sentiment'; key: string; resourcesDir: string; topWords: number }
  | { id: number; type: 'yake'; key: string; resourcesDir: string; options: { minTokens: number; maxTokens: number; minFreq: number; topN: number; dedupThreshold: number; windowSize: number } }

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
  if (msg.type === 'keyword-associations') {
    const c = corpusFor(msg.key)
    const res = keywordAssociations(c, lexiconFor(c.language, msg.resourcesDir), msg.options)
    if ('error' in res) return res satisfies AssociationsRun
    return { ...res, bars: associationBars(res.focalTerms, res.collocates), radial: associationRadial(res.focalTerms, res.collocates) } satisfies AssociationsRun
  }
  if (msg.type === 'similitude-matrix') {
    const c = corpusFor(msg.key)
    const sm = similitudeMatrix(c, lexiconFor(c.language, msg.resourcesDir), msg.options)
    if (!sm) return null satisfies SimilitudeRun
    const freqCsv = 'word,frequency\n' + sm.vocabulary.map((w, i) => `${w},${sm.frequencies[i]}`).join('\n') + '\n'
    return { matrixCsv: matrixCsv(sm), freqCsv, terms: sm.vocabulary.length, segments: sm.segments } satisfies SimilitudeRun
  }
  if (msg.type === 'thematic-map') {
    const c = corpusFor(msg.key)
    return thematicMap(c, lexiconFor(c.language, msg.resourcesDir), msg.options)
  }
  if (msg.type === 'lda-input') {
    const c = corpusFor(msg.key)
    return ldaInput(c, lexiconFor(c.language, msg.resourcesDir), msg.options)
  }
  if (msg.type === 'corpus-text') {
    return { text: corpusFor(msg.key).uceText.join('\n') } satisfies CorpusText
  }
  if (msg.type === 'sentiment') {
    const c = corpusFor(msg.key)
    const result = sentiment(c, loadOpLexicon(msg.resourcesDir), msg.topWords)
    const total = result.matched || 1
    const colors = { Positivo: '#00BA38', Negativa: '#F8766D', Neutro: '#9CA3AF' }
    const max = Math.max(result.counts.Positivo, result.counts.Negativa, result.counts.Neutro)
    // labiia_lex's figure: 1100 x 700 "pixels" turned into inches (/125, /130), saved at 160 dpi.
    const figure: VBarFigure = {
      kind: 'vbar',
      title: 'Análise de Sentimentos (Polaridade Lexical)',
      ylabel: 'Frequência',
      figW: Math.max(8, 1100 / 125),
      figH: Math.max(5, 700 / 130),
      dpi: 160,
      bars: (['Positivo', 'Negativa', 'Neutro'] as const).map((p) => ({ label: p, value: result.counts[p], color: colors[p], text: `${((result.counts[p] / total) * 100).toFixed(1)}% (${result.counts[p]})` })),
      ymax: (max || 1) * 1.25,
      barWidth: 0.8,
      alpha: 0.92,
      edgeColor: '#FFFFFF',
      edgeWidth: 1.2
    }
    return { result, figure } satisfies SentimentRun
  }
  if (msg.type === 'yake') {
    const c = corpusFor(msg.key)
    const keyphrases = yakeKeyphrases(c, lexiconFor(c.language, msg.resourcesDir), msg.resourcesDir, msg.options)
    const figure = rankingBars(keyphrases.map((k) => ({ label: k.phrase, value: k.relevance })), {
      title: 'Ranking de Palavras-Chave (YAKE)', xlabel: 'YAKE Relevância', format: (v) => v.toFixed(3)
    })
    return { keyphrases, figure } satisfies YakeRun
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
