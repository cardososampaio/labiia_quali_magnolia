/**
 * YAKE keyword extraction, ported from the yake library 0.7.3 that
 * labiia_lex uses (KeywordExtractor with seqm deduplication), followed by
 * labiia_lex's filters for conversational noise.
 *
 * Corrections to labiia_lex, which change results but not the method:
 *  - each text segment is a sentence for YAKE. labiia_lex hands YAKE the
 *    whole corpus without punctuation, so YAKE sees one sentence and its
 *    position and spread features stop meaning anything (scores collapse to
 *    ties at 1,000,000);
 *  - deduplication threshold and co-occurrence window are the chosen ones
 *    (labiia_lex passes them under names yake 0.7.3 ignores, so it always
 *    used 0.9 and 1 — which are therefore the defaults here);
 *  - frequency counts real occurrences (labiia_lex adds at least one per
 *    segment, even where the phrase is absent).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { keptWords, type PreparedCorpus } from '../corpus/prepare'
import type { Lexicon, CorpusLanguage } from '../corpus/lexicon'

const PUNCT = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~')

interface Term {
  id: number
  unique: string
  stopword: boolean
  tf: number
  tfA: number
  tfN: number
  occurs: Map<number, number>
  h: number
}

interface Candidate {
  kw: string
  unique: string
  terms: Term[]
  tags: Set<string>
  tf: number
  h: number
  startOrEndStopword: boolean
}

export interface YakeOptions {
  n: number
  windowSize: number
  dedupLim: number
  top: number
}

const stopwordCache = new Map<string, Set<string>>()
export function yakeStopwords(language: CorpusLanguage, resourcesDir: string): Set<string> {
  let set = stopwordCache.get(language)
  if (!set) {
    const text = readFileSync(join(resourcesDir, 'yake', `stopwords_${language}.txt`), 'utf-8').replace(/^﻿/, '')
    set = new Set(text.toLowerCase().split('\n').map((w) => w.replace(/\r$/, '')))
    stopwordCache.set(language, set)
  }
  return set
}

/** yake's get_tag: d = number, u = unusual (digits with letters, symbols), p = plain. Text here is lower case, so no acronyms or names. */
function tagOf(word: string): string {
  const w = word.replace(/,/g, '')
  const digitsOnly = (x: string): boolean => /^\p{Nd}+$/u.test(x)
  // Python: w.isdigit() or w.replace('.', '', 1).isdigit() (String.replace drops only the first dot).
  if (digitsOnly(w) || digitsOnly(w.replace('.', ''))) return 'd'
  let digits = 0, alpha = 0, excl = 0
  for (const c of word) {
    if (/\p{Nd}/u.test(c)) digits++
    if (/\p{L}/u.test(c)) alpha++
    if (PUNCT.has(c)) excl++
  }
  if ((digits > 0 && alpha > 0) || (digits === 0 && alpha === 0) || excl > 1) return 'u'
  return 'p'
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** yake.KeywordExtractor.extract_keywords on a list of sentences (lists of words). */
export function extractKeywords(sentences: string[][], stopwords: Set<string>, o: YakeOptions): [string, number][] {
  const terms = new Map<string, Term>()
  const termList: Term[] = []
  // Co-occurrence graph: edges[left][right] = count.
  const out = new Map<number, Map<number, number>>()
  const inn = new Map<number, Map<number, number>>()
  const candidates = new Map<string, Candidate>()
  let sentenceCount = 0

  const getTerm = (word: string): Term => {
    let unique = word.toLowerCase()
    const simplesSto = stopwords.has(unique)
    if (unique.endsWith('s') && unique.length > 3) unique = unique.slice(0, -1)
    const found = terms.get(unique)
    if (found) return found
    let simples = unique
    for (const p of PUNCT) simples = simples.split(p).join('')
    const t: Term = { id: termList.length, unique, stopword: simplesSto || stopwords.has(unique) || simples.length < 3, tf: 0, tfA: 0, tfN: 0, occurs: new Map(), h: 0 }
    terms.set(unique, t)
    termList.push(t)
    return t
  }
  const addCooccur = (left: Term, right: Term): void => {
    const o1 = out.get(left.id) ?? new Map<number, number>()
    o1.set(right.id, (o1.get(right.id) ?? 0) + 1)
    out.set(left.id, o1)
    const i1 = inn.get(right.id) ?? new Map<number, number>()
    i1.set(left.id, (i1.get(left.id) ?? 0) + 1)
    inn.set(right.id, i1)
  }
  // Candidate phrases are keyed by their lower-case text; parts are built once, when new.
  const addCandidate = (kw: string, unique: string, tag: string, terms: () => Term[]): void => {
    let c = candidates.get(unique)
    if (!c) {
      const ts = terms()
      c = { kw, unique, terms: ts, tags: new Set([tag]), tf: 0, h: 1, startOrEndStopword: ts[0].stopword || ts[ts.length - 1].stopword }
      candidates.set(unique, c)
    } else c.tags.add(tag)
    c.tf++
  }

  const wordInfo = new Map<string, { tag: string; lower: string; term: Term } | null>()
  let posText = 0
  for (const sentence of sentences) {
    if (sentence.length === 0) continue
    const sid = sentenceCount++
    let block: { tag: string; word: string; lower: string; term: Term }[] = []
    sentence.forEach((word) => {
      // A word's tag and term never change: computed once per distinct word (large corpora).
      let info = wordInfo.get(word)
      if (!info) {
        info = [...word].every((c) => PUNCT.has(c)) ? null : { tag: tagOf(word), lower: word.toLowerCase(), term: getTerm(word) }
        wordInfo.set(word, info)
      }
      if (!info) {
        block = []
        return
      }
      const { tag, lower, term } = info
      term.occurs.set(sid, (term.occurs.get(sid) ?? 0) + 1)
      term.tf++
      posText++
      if (tag !== 'u' && tag !== 'd') {
        for (let w = Math.max(0, block.length - o.windowSize); w < block.length; w++) {
          if (block[w].tag !== 'u' && block[w].tag !== 'd') addCooccur(block[w].term, term)
        }
      }
      // Candidates: the word alone, then the n-grams ending at it.
      let kw = word, unique = lower, tags = tag
      addCandidate(kw, unique, tags, () => [term])
      const first = Math.max(0, block.length - (o.n - 1))
      for (let w = block.length - 1; w >= first; w--) {
        const b = block[w]
        kw = b.word + ' ' + kw
        unique = b.lower + ' ' + unique
        tags = b.tag + tags
        const from = w
        addCandidate(kw, unique, tags, () => [...block.slice(from).map((x) => x.term), term])
      }
      block.push({ tag, word, lower, term })
    })
  }
  if (sentenceCount === 0) return []

  // Single-word features.
  const valid = termList.filter((t) => !t.stopword).map((t) => t.tf)
  if (valid.length === 0) return []
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length
  const std = Math.sqrt(valid.reduce((a, b) => a + (b - avg) ** 2, 0) / valid.length)
  const maxTf = Math.max(...termList.map((t) => t.tf))
  for (const t of termList) {
    const outs = out.get(t.id), ins = inn.get(t.id)
    const wdr = outs?.size ?? 0
    const wir = outs ? [...outs.values()].reduce((a, b) => a + b, 0) : 0
    const wdl = ins?.size ?? 0
    const wil = ins ? [...ins.values()].reduce((a, b) => a + b, 0) : 0
    const pwr = wir === 0 ? 0 : wdr / wir
    const pwl = wil === 0 ? 0 : wdl / wil
    const wrel = 0.5 + pwl * (t.tf / maxTf) + (0.5 + pwr * (t.tf / maxTf))
    const wfreq = t.tf / (avg + std)
    const wspread = t.occurs.size / sentenceCount
    const wcase = Math.max(t.tfA, t.tfN) / (1 + Math.log(t.tf))
    const wpos = Math.log(Math.log(3 + median([...t.occurs.keys()])))
    t.h = (wpos * wrel) / (wcase + wfreq / wrel + wspread / wrel)
  }

  const edgeTf = (a: Term, b: Term): number => out.get(a.id)?.get(b.id) ?? 0
  const isValid = (c: Candidate): boolean => [...c.tags].some((tag) => !tag.includes('u') && !tag.includes('d')) && !c.startOrEndStopword
  const validCands: Candidate[] = []
  for (const c of candidates.values()) {
    if (!isValid(c)) continue
    let sum = 0
    let prod = 1
    c.terms.forEach((t, i) => {
      if (!t.stopword) {
        sum += t.h
        prod *= t.h
      } else {
        // A stopword inside a phrase weighs by how strongly it binds its neighbours.
        const p1 = i > 0 && edgeTf(c.terms[i - 1], t) ? edgeTf(c.terms[i - 1], t) / c.terms[i - 1].tf : 0
        const p2 = i < c.terms.length - 1 && edgeTf(t, c.terms[i + 1]) ? edgeTf(t, c.terms[i + 1]) / c.terms[i + 1].tf : 0
        const prob = p1 * p2
        prod *= 1 + (1 - prob)
        sum -= 1 - prob
      }
    })
    c.h = prod / ((sum + 1) * c.tf)
    validCands.push(c)
  }
  validCands.sort((a, b) => a.h - b.h)

  if (o.dedupLim >= 1) return validCands.slice(0, o.top).map((c) => [c.unique, c.h])
  const result: Candidate[] = []
  for (const c of validCands) {
    if (!result.some((r) => seqm(c.unique, r.unique) > o.dedupLim)) result.push(c)
    if (result.length === o.top) break
  }
  return result.map((c) => [c.kw, c.h])
}

/** yake 0.7.3's "seqm" similarity (its fast approximation, with the same pre-filter). */
export function seqm(a: string, b: string): number {
  if (a === b) return 1
  const la = a.length, lb = b.length
  const maxLen = Math.max(la, lb)
  if (Math.abs(la - lb) > maxLen * 0.6) return 0
  if (maxLen > 3) {
    if (a[0] !== b[0] || a[la - 1] !== b[lb - 1]) return 0
    if (Math.min(la, lb) >= 3 && a.slice(0, 2) !== b.slice(0, 2)) return 0
  }
  if (Math.abs(a.split(' ').length - b.split(' ').length) > 1) return 0
  if (maxLen === 0) return 0
  const lenRatio = Math.min(la, lb) / maxLen
  if (lenRatio < 0.3) return 0
  const ca = new Set(a), cb = new Set(b)
  const charUnion = new Set([...ca, ...cb])
  const charOverlap = [...ca].filter((c) => cb.has(c)).length / charUnion.size
  if (charOverlap < 0.2) return 0
  if (maxLen <= 4) return charOverlap * lenRatio
  const wa = a.split(/\s+/).filter(Boolean), wb = b.split(/\s+/).filter(Boolean)
  if (wa.length > 1 || wb.length > 1) {
    const sa = new Set(wa), sb = new Set(wb)
    const union = new Set([...sa, ...sb])
    const overlap = [...sa].filter((w) => sb.has(w)).length / union.size
    if (overlap > 0.4) return overlap
  }
  const tri = (s: string): Set<string> => { const r = new Set<string>(); for (let i = 0; i + 3 <= s.length; i++) r.add(s.slice(i, i + 3)); return r }
  const ta = tri(a), tb = tri(b)
  const tu = new Set([...ta, ...tb])
  const triOverlap = tu.size ? [...ta].filter((x) => tb.has(x)).length / tu.size : 0
  return Math.min(0.3 * lenRatio + 0.2 * charOverlap + 0.5 * triOverlap, 1)
}

// labiia_lex's conversational fillers and interview roles, by language.
const CONVERSATIONAL: Record<CorpusLanguage, Set<string>> = {
  pt: new Set(['acho', 'ai', 'aí', 'assim', 'daí', 'dai', 'entao', 'então', 'enfim', 'eu', 'gente', 'ela', 'ele', 'eles', 'elas', 'isso', 'isto', 'né', 'ne', 'nos', 'nós', 'que', 'pra', 'pro', 'pras', 'pros', 'quem', 'tipo', 'tudo', 'voce', 'você', 'vocês', 'voces']),
  es: new Set(['aja', 'ajá', 'bueno', 'claro', 'cosa', 'cosas', 'digamos', 'eh', 'entonces', 'gente', 'mira', 'nada', 'osea', 'oye', 'pues', 'tipo', 'vale', 'yo', 'tu', 'el', 'ella', 'ellos', 'ellas', 'nosotros', 'usted', 'ustedes', 'que', 'quien']),
  en: new Set(['actually', 'basically', 'guys', 'kinda', 'like', 'literally', 'okay', 'ok', 'really', 'right', 'sorta', 'stuff', 'thing', 'things', 'uh', 'um', 'well', 'yeah', 'i', 'you', 'he', 'she', 'they', 'we', 'that', 'who'])
}
const ROLES: Record<CorpusLanguage, Set<string>> = {
  pt: new Set(['entrevistador', 'entrevistadora', 'entrevistado', 'entrevistada', 'mediador', 'mediadora', 'pesquisador', 'pesquisadora']),
  es: new Set(['entrevistador', 'entrevistadora', 'entrevistado', 'entrevistada', 'moderador', 'moderadora', 'investigador', 'investigadora', 'participante', 'hablante']),
  en: new Set(['interviewer', 'interviewee', 'moderator', 'researcher', 'participant', 'speaker'])
}

export function isNoiseKeyphrase(phrase: string, lex: Lexicon): boolean {
  const lang = lex.language
  const norm = phrase.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!norm || norm === 'a gente') return true
  const tokens = norm.split(' ')
  if (tokens.length > 3) return true
  const conv = CONVERSATIONAL[lang], roles = ROLES[lang]
  if (tokens.length === 1 && (conv.has(tokens[0]) || roles.has(tokens[0]))) return true
  if (tokens.some((t) => roles.has(t))) return true
  if (tokens.every((t) => conv.has(t))) return true
  if (!lex.isDisplayTerm(tokens[0]) || !lex.isDisplayTerm(tokens[tokens.length - 1])) return true
  if (tokens.filter((t) => lex.isStopwordLike(t)).length / tokens.length > 0.4) return true
  if (tokens.filter((t) => lex.isDisplayTerm(t)).length < Math.max(1, Math.min(2, tokens.length))) return true
  return norm.length > 70
}

export interface Keyphrase {
  phrase: string
  rawScore: number
  relevance: number
  frequency: number
  docCount: number
}

/** Occurrences of a phrase as whole words, without overlap (reference for countPhraseIndexed). */
export function countPhrase(words: string[], phrase: string[]): number {
  let n = 0
  for (let i = 0; i + phrase.length <= words.length;) {
    if (phrase.every((p, j) => words[i + j] === p)) { n++; i += phrase.length } else i++
  }
  return n
}

/**
 * Where each word occurs (segment, position), so a phrase is only checked
 * where its first word is: on large corpora scanning every segment for each
 * of the ~150 candidate phrases dominated the run time.
 */
export function wordPositions(segments: string[][]): Map<string, number[]> {
  const index = new Map<string, number[]>()
  segments.forEach((seg, s) => seg.forEach((w, i) => {
    let list = index.get(w)
    if (!list) index.set(w, (list = []))
    list.push(s, i)
  }))
  return index
}

/** Same counts as countPhrase over every segment: total occurrences and segments containing the phrase. */
export function countPhraseIndexed(segments: string[][], index: Map<string, number[]>, phrase: string[]): { freq: number; docs: number } {
  const list = index.get(phrase[0])
  let freq = 0, docs = 0
  if (!list) return { freq, docs }
  let seg = -1, nextFree = 0, inSeg = 0
  for (let k = 0; k < list.length; k += 2) {
    const s = list[k], i = list[k + 1]
    if (s !== seg) { if (inSeg > 0) docs++; seg = s; nextFree = 0; inSeg = 0 }
    if (i < nextFree) continue
    const words = segments[s]
    if (i + phrase.length > words.length) continue
    let match = true
    for (let j = 1; j < phrase.length; j++) if (words[i + j] !== phrase[j]) { match = false; break }
    if (match) { freq++; inSeg++; nextFree = i + phrase.length }
  }
  if (inSeg > 0) docs++
  return { freq, docs }
}

export function yakeKeyphrases(
  c: PreparedCorpus,
  lex: Lexicon,
  resourcesDir: string,
  o: { minTokens: number; maxTokens: number; minFreq: number; topN: number; dedupThreshold: number; windowSize: number }
): Keyphrase[] {
  // The text labiia_lex hands YAKE: its segments, without the stopwords it deleted.
  const segments = c.uceText.map((_s, i) => keptWords(c, i))
  const n = Math.min(3, Math.max(1, Math.round(o.maxTokens)))
  const topN = Math.max(1, Math.round(o.topN))
  const raw = extractKeywords(segments, yakeStopwords(c.language, resourcesDir), { n, windowSize: Math.max(1, Math.round(o.windowSize)), dedupLim: o.dedupThreshold, top: topN * 3 })

  const out: Keyphrase[] = []
  const seen = new Set<string>()
  const positions = wordPositions(segments)
  for (const [phrase, score] of raw) {
    const norm = phrase.toLowerCase().trim()
    if (seen.has(norm)) continue
    seen.add(norm)
    if (isNoiseKeyphrase(norm, lex)) continue
    const words = norm.split(' ')
    if (words.length < o.minTokens || words.length > 3) continue
    const { freq, docs } = countPhraseIndexed(segments, positions, words)
    if (freq < o.minFreq) continue
    const rank = score <= 0 ? Math.abs(score) : score
    out.push({ phrase, rawScore: score, relevance: Math.round((1 / Math.max(rank, 1e-6)) * 1e4) / 1e4, frequency: freq, docCount: docs })
  }
  out.sort((a, b) => b.relevance - a.relevance || b.frequency - a.frequency)
  return out.slice(0, topN)
}
