/**
 * Bigram and trigram networks, as labiia_lex builds them: per text, the
 * content words in reading order (stopwords and fillers left out, as in its
 * extra analyses), adjacent pairs or triples counted, the most frequent kept,
 * and a network where words are nodes and neighbours are linked.
 */
import type { PreparedCorpus } from '../corpus/prepare'
import type { Lexicon } from '../corpus/lexicon'
import { readableNetworkFigure, type NetworkFigure } from '../plot/readable-network'

/** labiia_lex's TOKEN_PATTERN: words of three or more letters, accents included. */
const TOKEN = /^[a-zA-ZÀ-ÿ]{3,}$/

/** English function words labiia_lex also removes from Portuguese corpora (mixed-language interviews). */
const ENGLISH_STOPWORDS = new Set([
  'you', 'your', 'yours', 'the', 'and', 'for', 'with', 'from', 'this', 'that', 'was', 'were', 'are', 'not',
  'have', 'has', 'had', 'can', 'could', 'will', 'would', 'shall', 'should', 'what', 'when', 'where', 'which',
  'who', 'whom', 'why', 'how', 'into', 'onto', 'over', 'under', 'than', 'then', 'there', 'their', 'them'
])

/**
 * Content words of each text, in order (labiia_lex's tokenize_text with
 * stopword removal), over the words labiia_lex keeps; a heading line starts
 * a new text, so no n-gram spans it.
 */
export function contentTokensByUnit(c: PreparedCorpus, lex: Lexicon): string[][] {
  const keep = new Map<string, boolean>()
  const ok = (w: string): boolean => {
    let v = keep.get(w)
    if (v === undefined) {
      v = TOKEN.test(w) && !ENGLISH_STOPWORDS.has(w) && !lex.lexiconStopwords.has(w) && lex.isDisplayTerm(w)
      keep.set(w, v)
    }
    return v
  }
  const out: string[][] = []
  for (let s = 0; s < c.uceText.length; s++) {
    if (c.uceNewText[s] || out.length === 0) out.push([])
    const tokens = out[out.length - 1]
    for (let t = c.uceStart[s]; t < c.uceStart[s + 1]; t++) {
      if (!c.tokenKept[t]) continue
      const w = c.forms[c.tokens[t]]
      if (ok(w)) tokens.push(w)
    }
  }
  return out
}

export interface NgramRow {
  words: string[]
  frequency: number
}

/** Counts n-grams; ties keep the order in which they first appear, as Python's Counter does. */
export function countNgrams(tokensByUnit: string[][], n: number): NgramRow[] {
  const counts = new Map<string, number>()
  for (const tokens of tokensByUnit) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const key = tokens.slice(i, i + n).join('\u0000')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const rows = [...counts].map(([k, f]) => ({ words: k.split('\u0000'), frequency: f }))
  // Array.sort is stable, so equal counts stay in first-seen order.
  return rows.sort((a, b) => b.frequency - a.frequency)
}

export interface NgramNetworkResult {
  figure: NetworkFigure
  kept: NgramRow[]
  allBigrams: NgramRow[]
}

export function ngramNetwork(
  c: PreparedCorpus,
  lex: Lexicon,
  opts: { n: 2 | 3; minFreq: number; topEdges: number; title: string }
): NgramNetworkResult | null {
  const tokens = contentTokensByUnit(c, lex)
  const rows = countNgrams(tokens, opts.n)
  const minFreq = Math.max(1, Math.round(opts.minFreq))
  const topEdges = Math.max(20, Math.round(opts.topEdges))
  const kept = rows.filter((r) => r.frequency >= minFreq).slice(0, topEdges)
  if (kept.length === 0) return null

  // Nodes in the order edges are added (networkx graph order). A trigram adds two
  // edges and an edge seen again adds its frequency; for bigrams the reverse pair
  // ("b a" after "a b") replaces the weight, as networkx's add_edge does there.
  const order: string[] = []
  const seen = new Set<string>()
  const edgeIndex = new Map<string, number>()
  const edges: { source: string; target: string; weight: number }[] = []
  const addNode = (w: string): void => { if (!seen.has(w)) { seen.add(w); order.push(w) } }
  const addEdge = (a: string, b: string, w: number): void => {
    addNode(a)
    addNode(b)
    const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`
    const at = edgeIndex.get(key)
    if (at !== undefined) edges[at].weight = opts.n === 3 ? edges[at].weight + w : w
    else {
      edgeIndex.set(key, edges.length)
      edges.push({ source: a, target: b, weight: w })
    }
  }
  for (const r of kept) {
    for (let i = 0; i + 1 < r.words.length; i++) addEdge(r.words[i], r.words[i + 1], r.frequency)
  }

  return {
    figure: readableNetworkFigure(order, edges, { title: opts.title, maxLabels: order.length }),
    kept,
    allBigrams: opts.n === 3 ? countNgrams(tokens, 2) : []
  }
}
