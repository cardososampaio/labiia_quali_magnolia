/**
 * Keyword associations (labiia_lex's "Associações de palavras-chave"): for
 * each focal word, the words that appear in the same text segments more
 * often than chance, ranked by Dunning's log-likelihood (G²) on segment
 * presence. Only attraction is kept (a word must be more frequent with the
 * focal word than overall).
 */
import type { PreparedCorpus } from '../corpus/prepare'
import { stripAccents, type Lexicon } from '../corpus/lexicon'

export const MAX_FOCAL_TERMS = 6

export interface Collocate {
  focal: string
  term: string
  logLikelihood: number
  joint: number
  focalSegments: number
  termSegments: number
}

export function dunningLogLikelihood(joint: number, focalOnly: number, termOnly: number, neither: number): number {
  const total = joint + focalOnly + termOnly + neither
  if (total <= 0) return 0
  const part = (o: number, e: number): number => (o > 0 && e > 0 ? o * Math.log(o / e) : 0)
  const rowFocal = joint + focalOnly
  const rowOther = termOnly + neither
  const colTerm = joint + termOnly
  const colOther = focalOnly + neither
  return 2 * (part(joint, (rowFocal * colTerm) / total) + part(focalOnly, (rowFocal * colOther) / total) +
    part(termOnly, (rowOther * colTerm) / total) + part(neither, (rowOther * colOther) / total))
}

export function parseFocalTerms(raw: string): string[] {
  const out: string[] = []
  for (const item of raw.replace(/;/g, ',').replace(/\n/g, ',').split(',')) {
    const term = item.trim().toLowerCase()
    if (term && !out.includes(term)) out.push(term)
  }
  return out.slice(0, MAX_FOCAL_TERMS)
}

export function rankCollocates(segments: Set<string>[], focal: string, topN: number, minJoint: number): Collocate[] {
  const total = segments.length
  const docFreq = new Map<string, number>()
  for (const s of segments) for (const w of s) docFreq.set(w, (docFreq.get(w) ?? 0) + 1)
  const withFocal = segments.filter((s) => s.has(focal))
  const nFocal = withFocal.length
  if (nFocal === 0) return []
  const joint = new Map<string, number>()
  for (const s of withFocal) for (const w of s) if (w !== focal) joint.set(w, (joint.get(w) ?? 0) + 1)
  const ranked: Collocate[] = []
  for (const [term, j] of joint) {
    if (j < minJoint) continue
    const nTerm = docFreq.get(term)!
    if (j / nFocal <= nTerm / total) continue
    ranked.push({ focal, term, joint: j, focalSegments: nFocal, termSegments: nTerm, logLikelihood: dunningLogLikelihood(j, nFocal - j, nTerm - j, total - nFocal - nTerm + j) })
  }
  ranked.sort((a, b) => b.logLikelihood - a.logLikelihood || b.joint - a.joint || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0))
  return ranked.slice(0, Math.max(1, Math.round(topN)))
}

export interface AssociationsResult {
  focalTerms: string[]
  missing: string[]
  collocates: Map<string, Collocate[]>
  segments: number
  examples: [string, string, string][]
}

export function keywordAssociations(
  c: PreparedCorpus,
  lex: Lexicon,
  o: { focalTerms: string; topN: number; minJoint: number; minFreq: number; useLemmas: boolean; examplesPerPair?: number }
): AssociationsResult | { error: 'too-small' } | { error: 'focal-not-found'; requested: string[] } {
  const minFreq = Math.max(1, Math.round(o.minFreq))
  // Vocabulary: active terms with enough occurrences that are not stopword-like (TextProcessor.build_dtm).
  const vocab = new Set<string>()
  if (o.useLemmas) {
    for (let i = 0; i < c.lemmas.length; i++) if (c.lemmaAct[i] === 1 && c.lemmaFreq[i] >= minFreq && !lex.isStopwordLike(c.lemmas[i])) vocab.add(c.lemmas[i])
  } else {
    for (let i = 0; i < c.forms.length; i++) if (c.formAct[i] === 1 && c.formFreq[i] >= minFreq && !lex.isStopwordLike(c.forms[i])) vocab.add(c.forms[i])
  }
  const segments: Set<string>[] = []
  for (let s = 0; s < c.uceText.length; s++) {
    const set = new Set<string>()
    for (let t = c.uceStart[s]; t < c.uceStart[s + 1]; t++) {
      const f = c.tokens[t]
      // Stopword occurrences never stand for a content lemma ("é" is not "ser" here).
      if (c.formAct[f] !== 1) continue
      const term = o.useLemmas ? c.lemmas[c.formLemma[f]] : c.forms[f]
      if (vocab.has(term)) set.add(term)
    }
    segments.push(set)
  }
  if (segments.length < 2 || vocab.size < 2) return { error: 'too-small' }

  const frequency = new Map<string, number>()
  for (const s of segments) for (const w of s) frequency.set(w, (frequency.get(w) ?? 0) + 1)
  let requested = parseFocalTerms(o.focalTerms)
  if (requested.length === 0) {
    requested = [...frequency].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w)
  }
  const folded = new Map<string, string>()
  for (const term of [...vocab].sort((a, b) => (frequency.get(b) ?? 0) - (frequency.get(a) ?? 0))) {
    const f = stripAccents(term)
    if (!folded.has(f)) folded.set(f, term)
  }
  const focalTerms: string[] = []
  const missing: string[] = []
  for (const term of requested) {
    let match = vocab.has(term) ? term : folded.get(stripAccents(term))
    if (!match && o.useLemmas) {
      const hit = lex.lookup(term)
      if (hit) match = vocab.has(hit[0]) ? hit[0] : folded.get(stripAccents(hit[0]))
    }
    if (match && !focalTerms.includes(match)) focalTerms.push(match)
    else if (!match) missing.push(term)
  }
  if (focalTerms.length === 0) return { error: 'focal-not-found', requested }

  const collocates = new Map(focalTerms.map((f) => [f, rankCollocates(segments, f, o.topN, Math.max(1, Math.round(o.minJoint)))]))
  const perPair = Math.max(1, o.examplesPerPair ?? 2)
  const examples: [string, string, string][] = []
  for (const [focal, items] of collocates) {
    for (const item of items) {
      let shown = 0
      for (let s = 0; s < segments.length && shown < perPair; s++) {
        if (segments[s].has(focal) && segments[s].has(item.term)) {
          examples.push([focal, item.term, c.uceText[s].slice(0, 400)])
          shown++
        }
      }
    }
  }
  return { focalTerms, missing, collocates, segments: segments.length, examples }
}
