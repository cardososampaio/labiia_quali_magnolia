/**
 * Input of the CHD (Reinert method) as labiia_lex hands it to IRaMuTeQ's R
 * scripts: a binary table of rows (text segments, or whole texts) x active
 * words in Matrix Market format, the row list, and the vocabulary.
 *
 * Active words follow IRaMuTeQ: content lemmas (or forms) with at least 3
 * occurrences, stopword-like words left out.
 */
import { writeFileSync } from 'fs'
import { join } from 'path'
import type { PreparedCorpus } from '../corpus/prepare'
import type { Lexicon } from '../corpus/lexicon'
import { activeVocabulary } from './lda'

export interface ChdMatrixOptions {
  minFreq: number
  maxActives: number
  useLemmas: boolean
  /** '1' = rows are text segments, '2' = rows are texts. */
  rows: 'segments' | 'texts'
}

export interface ChdMatrixInfo {
  rows: number
  terms: number
  nonZero: number
}

/** IRaMuTeQ raises the minimum frequency of active forms to 3. */
export const CHD_MIN_FREQ = 3

export function writeChdMatrix(c: PreparedCorpus, lex: Lexicon, o: ChdMatrixOptions, dir: string): ChdMatrixInfo | null {
  const vocab = activeVocabulary(c, lex, { minFreq: Math.max(CHD_MIN_FREQ, o.minFreq), maxFeatures: o.maxActives, useLemmas: o.useLemmas })
  if (vocab.length < 2) return null
  const index = new Map(vocab.map((t, i) => [t, i]))
  const nRows = o.rows === 'texts' ? c.units.length : c.uceText.length
  const present: Set<number>[] = Array.from({ length: nRows }, () => new Set())
  const freq = new Array(vocab.length).fill(0)
  for (let s = 0; s < c.uceText.length; s++) {
    const row = present[o.rows === 'texts' ? c.uceUnit[s] : s]
    for (let t = c.uceStart[s]; t < c.uceStart[s + 1]; t++) {
      const f = c.tokens[t]
      if (c.formAct[f] !== 1) continue
      const k = index.get(o.useLemmas ? c.lemmas[c.formLemma[f]] : c.forms[f])
      if (k === undefined) continue
      row.add(k)
      freq[k]++
    }
  }
  const lines: string[] = []
  for (let r = 0; r < nRows; r++) for (const k of [...present[r]].sort((a, b) => a - b)) lines.push(`${r + 1} ${k + 1} 1`)
  writeFileSync(join(dir, 'TableUc1.csv'),
    `%%MatrixMarket matrix coordinate integer general\n${nRows} ${vocab.length} ${lines.length}\n${lines.join('\n')}\n`, 'utf-8')
  const idLabel = o.rows === 'texts' ? 'uci' : 'uce'
  writeFileSync(join(dir, 'listuce1.csv'), `${idLabel};uc\n` + Array.from({ length: nRows }, (_v, i) => `${i};${i}`).join('\n') + '\n', 'utf-8')
  // Row descriptions (document and text) for the classified-segments table.
  const cell = (v: string): string => `"${v.replace(/"/g, '""')}"`
  const rowLines = o.rows === 'texts'
    ? c.units.map((u, i) => `${i};${cell(u.name)};""`)
    : c.uceText.map((t, i) => `${i};${cell(c.units[c.uceUnit[i]].name)};${cell(t)}`)
  writeFileSync(join(dir, 'rows.csv'), 'row;document;text\n' + rowLines.join('\n') + '\n', 'utf-8')
  writeFileSync(join(dir, 'formes.csv'), 'word;freq\n' + vocab.map((w, i) => `${w};${freq[i]}`).join('\n') + '\n', 'utf-8')
  return { rows: nRows, terms: vocab.length, nonZero: lines.length }
}
