/**
 * Similarity analysis (labiia_lex's "Similitude", IRaMuTeQ method): which
 * words share text segments. A binary segment x word table, the 2 x 2
 * contingency (a, b, c, d) of every pair, an association index, and the
 * square matrix the R renderer turns into a maximum tree and a graph.
 *
 * Correction to labiia_lex: when the vocabulary is capped, words are ranked
 * by their lemma frequency (labiia_lex looked the lemma up among the word
 * forms, giving frequency 1 to lemmas never written in that exact form and
 * dropping them).
 */
import type { PreparedCorpus } from '../corpus/prepare'
import type { Lexicon } from '../corpus/lexicon'

type Index = (a: number, b: number, c: number, d: number, n: number) => number
const div = (num: number, den: number): number => (den !== 0 ? num / den : 0)
const phi: Index = (a, b, c, d) => div(a * d - b * c, Math.sqrt((a + b) * (c + d) * (a + c) * (b + d)))

/** IRaMuTeQ's indices, by the names its interface (and labiia_lex) uses. */
export const SIMILARITY_INDEX: Record<string, Index> = {
  cooccurrence: (a) => a,
  'percentual de coocorrência': (a, _b, _c, _d, n) => div(a, n),
  russel: (a, _b, _c, _d, n) => div(a, n),
  jaccard: (a, b, c) => div(a, a + b + c),
  kulczynski1: (a, b, c) => div(a, b + c),
  kulczynski2: (a, b, c) => 0.5 * (div(a, a + b) + div(a, a + c)),
  mountford: (a, b, c) => div(2 * a, a * b + a * c + 2 * b * c),
  fager: (a, b, c) => div(a, Math.sqrt((a + b) * (a + c))) - div(1, 2 * Math.sqrt(a + c)),
  'simple matching': (a, _b, _c, d, n) => div(a + d, n),
  hamman: (a, b, c, d, n) => div(a + d - (b + c), n),
  faith: (a, _b, _c, d, n) => div(a + d / 2, n),
  tanimoto: (a, b, c, d) => div(a + d, a + 2 * b + 2 * c + d),
  dice: (a, b, c) => div(2 * a, 2 * a + b + c),
  phi,
  stiles: (a, b, c, d, n) => {
    const num = Math.max(Math.abs(a * d - b * c) - 0.5 * n, 0)
    const den = (a + b) * (c + d) * (a + c) * (b + d)
    return den > 0 && num > 0 ? Math.log10((n * num ** 2) / den) : 0
  },
  michael: (a, b, c, d) => div(4 * (a * d - b * c), (a + d) ** 2 + (b + c) ** 2),
  mozley: (a, b, c, _d, n) => div(a * n, (a + b) * (a + c)),
  yule: (a, b, c, d) => div(a * d - b * c, a * d + b * c),
  yule2: (a, b, c, d) => { const sa = Math.sqrt(a * d), sb = Math.sqrt(b * c); return div(sa - sb, sa + sb) },
  ochiai: (a, b, c) => div(a, Math.sqrt((a + b) * (a + c))),
  simpson: (a, b, c) => div(a, Math.min(a + b, a + c)),
  'braun-blanquet': (a, b, c) => div(a, Math.max(a + b, a + c)),
  'chi-squared': (a, b, c, d, n) => div(n * (a * d - b * c) ** 2, (a + b) * (c + d) * (a + c) * (b + d)),
  'phi-squared': (a, b, c, d, n) => phi(a, b, c, d, n) ** 2,
  tschuprow: (a, b, c, d, n) => Math.abs(phi(a, b, c, d, n)),
  cramer: (a, b, c, d, n) => Math.abs(phi(a, b, c, d, n)),
  pearson: phi,
  binomial: (a, b, c, _d, n) => {
    const nf = Math.max(1, n)
    const pi = div(a + b, nf), pj = div(a + c, nf)
    const expected = nf * pi * pj
    const variance = Math.max(expected * Math.max(1 - pi * pj, 0), 0)
    return div(a - expected, Math.sqrt(variance))
  }
}

export interface SimilitudeMatrix {
  vocabulary: string[]
  /** Segments containing each word (the R renderer sizes labels by it). */
  frequencies: number[]
  association: Float64Array
  segments: number
}

export function similitudeMatrix(
  c: PreparedCorpus,
  lex: Lexicon,
  o: { minFreq: number; maxTerms: number; useLemmas: boolean; coefficient: string }
): SimilitudeMatrix | null {
  const minFreq = Math.max(1, Math.round(o.minFreq))
  // Vocabulary: active terms with enough occurrences that pass the display gate and are not English, in alphabetical order.
  const candidates: { term: string; freq: number }[] = []
  if (o.useLemmas) {
    const seen = new Set<string>()
    for (let i = 0; i < c.lemmas.length; i++) {
      const t = c.lemmas[i]
      if (c.lemmaAct[i] === 1 && c.lemmaFreq[i] >= minFreq && !lex.isStopwordLike(t) && lex.isDisplayTerm(t) && !lex.isEnglishOnly(t) && !seen.has(t)) {
        seen.add(t)
        candidates.push({ term: t, freq: c.lemmaFreq[i] })
      }
    }
  } else {
    for (let i = 0; i < c.forms.length; i++) {
      const t = c.forms[i]
      if (c.formAct[i] === 1 && c.formFreq[i] >= minFreq && !lex.isStopwordLike(t) && lex.isDisplayTerm(t) && !lex.isEnglishOnly(t, c.lemmas[c.formLemma[i]])) candidates.push({ term: t, freq: c.formFreq[i] })
    }
  }
  candidates.sort((a, b) => (a.term < b.term ? -1 : a.term > b.term ? 1 : 0))
  let kept = candidates
  const maxTerms = Math.max(0, Math.round(o.maxTerms))
  if (maxTerms > 0 && kept.length > maxTerms) {
    const top = new Set([...kept].map((x, i) => ({ ...x, i })).sort((a, b) => b.freq - a.freq || a.i - b.i).slice(0, maxTerms).map((x) => x.i))
    kept = kept.filter((_x, i) => top.has(i))
  }
  const vocabulary = kept.map((x) => x.term)
  if (vocabulary.length < 2) return null
  const index = new Map(vocabulary.map((t, i) => [t, i]))
  const n = vocabulary.length

  // Binary table and pair counts: a[i][j] = segments containing both.
  const a = new Float64Array(n * n)
  const freq = new Float64Array(n)
  for (let s = 0; s < c.uceText.length; s++) {
    const present = new Set<number>()
    for (let t = c.uceStart[s]; t < c.uceStart[s + 1]; t++) {
      const f = c.tokens[t]
      if (c.formAct[f] !== 1) continue
      const term = o.useLemmas ? c.lemmas[c.formLemma[f]] : c.forms[f]
      const k = index.get(term)
      if (k !== undefined) present.add(k)
    }
    const list = [...present]
    for (const i of list) {
      freq[i]++
      for (const j of list) a[i * n + j]++
    }
  }
  const N = c.uceText.length
  const fn = SIMILARITY_INDEX[o.coefficient.toLowerCase()] ?? SIMILARITY_INDEX.cooccurrence
  const m = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const aa = a[i * n + j]
      const b = Math.max(0, freq[i] - aa)
      const cc = Math.max(0, freq[j] - aa)
      const d = Math.max(0, N - aa - b - cc)
      const v = fn(aa, b, cc, d, N)
      m[i * n + j] = Number.isFinite(v) ? v : 0
    }
  }
  // Symmetric, as labiia_lex makes it ((M + Mᵀ) / 2).
  const association = new Float64Array(n * n)
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) association[i * n + j] = (m[i * n + j] + m[j * n + i]) / 2
  return { vocabulary, frequencies: Array.from(freq), association, segments: N }
}

/** The square matrix as the R renderer reads it (comma-separated, 6 decimals, "0" for zero). */
export function matrixCsv(sm: SimilitudeMatrix): string {
  const n = sm.vocabulary.length
  const lines = [['', ...sm.vocabulary].join(',')]
  for (let i = 0; i < n; i++) {
    const row = [sm.vocabulary[i]]
    for (let j = 0; j < n; j++) {
      const v = sm.association[i * n + j]
      row.push(v !== 0 ? v.toFixed(6) : '0')
    }
    lines.push(row.join(','))
  }
  return lines.join('\n') + '\n'
}
