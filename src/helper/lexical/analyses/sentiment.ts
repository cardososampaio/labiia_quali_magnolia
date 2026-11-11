/**
 * Sentiment (labiia_lex's "Análise de Sentimentos"): each word of the texts
 * looked up in OpLexicon (a Portuguese polarity lexicon: 1 positive,
 * -1 negative, 0 neutral) and counted by polarity.
 *
 * Correction to labiia_lex: every word of the text is looked up, including
 * the function words labiia_lex had already deleted during preparation, as
 * the lexicon method defines; only words of three letters or more, as there.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { PreparedCorpus } from '../corpus/prepare'

export type Polarity = 'Positivo' | 'Negativa' | 'Neutro'
export const POLARITIES: Polarity[] = ['Positivo', 'Negativa', 'Neutro']

let cached: Map<string, Polarity> | null = null
export function loadOpLexicon(resourcesDir: string): Map<string, Polarity> {
  if (cached) return cached
  const map = new Map<string, Polarity>()
  for (const raw of readFileSync(join(resourcesDir, 'lexicons', 'oplexicon.csv'), 'utf-8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || !line.includes(',')) continue
    const parts = line.split(',').map((p) => p.trim())
    if (parts.length < 3 || !parts[0]) continue
    const v = parts[2]
    // A word listed twice keeps its last polarity, as labiia_lex reads the file.
    map.set(parts[0].toLowerCase(), v === '1' || v === '+1' ? 'Positivo' : v === '-1' ? 'Negativa' : 'Neutro')
  }
  cached = map
  return map
}

const TOKEN = /^[a-zA-ZÀ-ÿ]{3,}$/

export interface SentimentResult {
  counts: Record<Polarity, number>
  /** The same counts for each document (for the timeline). */
  perUnit: Record<Polarity, number>[]
  words: { word: string; polarity: Polarity; frequency: number }[]
  matched: number
}

export function sentiment(c: PreparedCorpus, lexicon: Map<string, Polarity>, topWords: number): SentimentResult {
  const counts: Record<Polarity, number> = { Positivo: 0, Negativa: 0, Neutro: 0 }
  const perWord = new Map<string, { word: string; polarity: Polarity; frequency: number }>()
  const perUnit = c.units.map(() => ({ Positivo: 0, Negativa: 0, Neutro: 0 }))
  let seg = 0
  for (let t = 0; t < c.tokens.length; t++) {
    while (t >= c.uceStart[seg + 1]) seg++
    const w = c.forms[c.tokens[t]]
    if (!TOKEN.test(w)) continue
    const p = lexicon.get(w)
    if (!p) continue
    counts[p]++
    perUnit[c.uceUnit[seg]][p]++
    const key = `${w}\u0000${p}`
    const e = perWord.get(key)
    if (e) e.frequency++
    else perWord.set(key, { word: w, polarity: p, frequency: 1 })
  }
  const words = [...perWord.values()].sort((a, b) => b.frequency - a.frequency).slice(0, Math.max(10, Math.round(topWords)))
  return { counts, perUnit, words, matched: counts.Positivo + counts.Negativa + counts.Neutro }
}
