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

/** Document variable as labiia_lex names it (*doc_ + the name without accents or spaces). */
export function docVariable(name: string): string {
  const slug = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '').slice(0, 30) || 'doc'
  return `*doc_${slug}`
}

/**
 * Tables of IRaMuTeQ's profile stage (make_and_write_profile): for each word,
 * in how many rows of each class it appears. Active words (Contout), other
 * supplementary words (ContSupOut; stopwords left out, since labiia_lex
 * deletes them from the text) and document variables (ContEtOut). Words
 * appearing in fewer than 3 classified rows are dropped, as in IRaMuTeQ.
 * Also writes the active terms of each row (rowterms.csv) for the typical segments.
 */
export function writeChdProfileTables(
  c: PreparedCorpus,
  lex: Lexicon,
  o: ChdMatrixOptions,
  dir: string,
  classes: number[]
): { classes: number } {
  const nClass = Math.max(0, ...classes)
  const vocab = new Set(activeVocabulary(c, lex, { minFreq: Math.max(CHD_MIN_FREQ, o.minFreq), maxFeatures: o.maxActives, useLemmas: o.useLemmas }))
  const termOf = (f: number): string => (o.useLemmas ? c.lemmas[c.formLemma[f]] : c.forms[f])
  const nRows = o.rows === 'texts' ? c.units.length : c.uceText.length
  const actRows = new Map<string, Set<number>>()
  const supRows = new Map<string, Set<number>>()
  const actFreq = new Map<string, number>()
  const supFreq = new Map<string, number>()
  const rowTerms: Set<string>[] = Array.from({ length: nRows }, () => new Set())
  const add = (m: Map<string, Set<number>>, t: string, r: number): void => { let s = m.get(t); if (!s) m.set(t, (s = new Set())); s.add(r) }
  for (let s = 0; s < c.uceText.length; s++) {
    const r = o.rows === 'texts' ? c.uceUnit[s] : s
    for (let t = c.uceStart[s]; t < c.uceStart[s + 1]; t++) {
      const f = c.tokens[t]
      const term = termOf(f)
      if (c.formAct[f] === 1 && vocab.has(term)) {
        add(actRows, term, r); actFreq.set(term, (actFreq.get(term) ?? 0) + 1); rowTerms[r].add(term)
      } else if (c.formAct[f] === 2 && !lex.stopwords.has(c.forms[f]) && !/^\d+$/.test(term)) {
        add(supRows, term, r); supFreq.set(term, (supFreq.get(term) ?? 0) + 1)
      }
    }
  }
  const perClass = (rows: Set<number>): number[] => {
    const counts = new Array(nClass).fill(0)
    for (const r of rows) if (classes[r] > 0) counts[classes[r] - 1]++
    return counts
  }
  // IRaMuTeQ orders by frequency, then by name, both descending.
  const order = (freq: Map<string, number>): string[] =>
    [...freq.entries()].filter(([, f]) => f >= CHD_MIN_FREQ).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)).map(([t]) => t)
  const table = (terms: string[], rowsOf: Map<string, Set<number>>): string => terms
    .map((t) => [t, perClass(rowsOf.get(t)!)] as const)
    .filter(([, n]) => n.reduce((a, b) => a + b, 0) >= 3)
    .map(([t, n]) => `${t};${n.join(';')}`).join('\n')
  const actives = order(actFreq)
  const activeSet = new Set(actives)
  const write = (name: string, body: string): void => writeFileSync(join(dir, name), body ? body + '\n' : '', 'utf-8')
  write('Contout.csv', table(actives, actRows))
  write('ContSupOut.csv', table(order(supFreq).filter((t) => !activeSet.has(t)), supRows))
  // Document variables: rows of each document per class.
  const docRows = new Map<string, Set<number>>()
  for (let r = 0; r < nRows; r++) add(docRows, docVariable(c.units[o.rows === 'texts' ? r : c.uceUnit[r]].name), r)
  write('ContEtOut.csv', [...docRows.keys()].sort().map((v) => `${v};${perClass(docRows.get(v)!).join(';')}`).join('\n'))
  write('rowterms.csv', rowTerms.map((s, r) => `${r};${[...s].join(' ')}`).join('\n'))
  return { classes: nClass }
}
