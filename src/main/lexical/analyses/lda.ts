/**
 * LDA topic model input and output (labiia_lex's "LDA"): the document x term
 * count table that R's topicmodels fits, and the reading of its results.
 *
 * Documents are the texts (UCI); terms are the active lemmas (or forms) with
 * at least `minFreq` occurrences that are not stopword-like, the
 * `maxFeatures` most frequent kept. Correction to labiia_lex: documents keep
 * their names ("Doc_0", "Doc_1"... in labiia_lex, which lacks titles).
 */
import type { PreparedCorpus } from '../corpus/prepare'
import type { Lexicon } from '../corpus/lexicon'

export interface LdaInput {
  csv: string
  docs: string[]
  vocabulary: string[]
  /** Tokens per document and per term (for the intertopic map). */
  docLengths: number[]
  termFrequencies: number[]
}

export function ldaInput(c: PreparedCorpus, lex: Lexicon, o: { minFreq: number; maxFeatures: number; useLemmas: boolean }): LdaInput | null {
  const minFreq = Math.max(1, Math.round(o.minFreq))
  const cand: { term: string; freq: number }[] = []
  const seen = new Set<string>()
  const terms = o.useLemmas ? c.lemmas : c.forms
  const freqs = o.useLemmas ? c.lemmaFreq : c.formFreq
  const acts = o.useLemmas ? c.lemmaAct : c.formAct
  for (let i = 0; i < terms.length; i++) {
    const t = terms[i]
    if (acts[i] === 1 && freqs[i] >= minFreq && !seen.has(t) && !lex.isStopwordLike(t)) {
      seen.add(t)
      cand.push({ term: t, freq: freqs[i] })
    }
  }
  // The most frequent first (ties alphabetical), then alphabetical order as the columns.
  cand.sort((a, b) => b.freq - a.freq || (a.term < b.term ? -1 : 1))
  const vocabulary = cand.slice(0, Math.max(10, Math.round(o.maxFeatures))).map((x) => x.term).sort()
  if (vocabulary.length < 2 || c.units.length < 2) return null
  const index = new Map(vocabulary.map((t, i) => [t, i]))
  const counts = c.units.map(() => new Uint32Array(vocabulary.length))
  for (let s = 0; s < c.uceText.length; s++) {
    const row = counts[c.uceUnit[s]]
    for (let t = c.uceStart[s]; t < c.uceStart[s + 1]; t++) {
      const f = c.tokens[t]
      if (c.formAct[f] !== 1) continue
      const k = index.get(o.useLemmas ? c.lemmas[c.formLemma[f]] : c.forms[f])
      if (k !== undefined) row[k]++
    }
  }
  // Labels go into R's table: no separators or line breaks.
  const docs = c.units.map((u) => u.name.replace(/[;\r\n"]/g, ' ').trim() || u.id)
  const lines = [['Doc_ID', 'Label', ...vocabulary].join(';')]
  counts.forEach((row, d) => lines.push([String(d), docs[d], ...Array.from(row, String)].join(';')))
  const termFrequencies = vocabulary.map((_t, k) => counts.reduce((n, row) => n + row[k], 0))
  return { csv: lines.join('\n') + '\n', docs, vocabulary, docLengths: counts.map((row) => row.reduce((a, b) => a + b, 0)), termFrequencies }
}

export interface LdaModel {
  k: number
  labels: string[]
  /** Terms of each topic, most probable first, with their probability (beta). */
  topicTerms: { term: string; weight: number }[][]
  /** P(topic | document), one row per document. */
  gamma: number[][]
  docLabels: string[]
}

/** Reads topicmodels' outputs written by lda_topicmodels.R. */
export function readLdaOutputs(topicsCsv: string, docTopicCsv: string): LdaModel {
  const topicTerms: { term: string; weight: number }[][] = []
  const labels: string[] = []
  for (const line of topicsCsv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue
    const [id, label, term, weight] = line.split(';')
    const k = Number(id)
    topicTerms[k] ??= []
    labels[k] = label
    topicTerms[k].push({ term, weight: Number(weight) })
  }
  const rows = docTopicCsv.split(/\r?\n/).filter((l) => l.trim())
  const header = rows[0].split(';')
  const first = header.indexOf('T0')
  const gamma: number[][] = []
  const docLabels: string[] = []
  for (const line of rows.slice(1)) {
    const cells = line.split(';')
    docLabels.push(cells[1])
    gamma.push(cells.slice(first).map(Number))
  }
  return { k: topicTerms.length, labels, topicTerms, gamma, docLabels }
}
