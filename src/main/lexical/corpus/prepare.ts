/**
 * Corpus preparation for the lexical analyses: from the plain text of each
 * document (a "text unit", IRaMuTeQ's UCI) to text segments (UCE), word
 * forms, lemmas and grammatical classes.
 *
 * It follows IRaMuTeQ's own parser, as labiia_lex's strict mode does, with
 * three corrections to labiia_lex:
 *  - stopwords stay in the text and are only marked supplementary, so
 *    segments are cut on the real text (40 words counts every word) and
 *    typical segments read as written;
 *  - the stopword list follows the corpus language;
 *  - punctuation is kept until segments are cut, so cuts prefer sentence
 *    ends, as IRaMuTeQ intends.
 */
import { Lexicon, gramIsActive, type CorpusLanguage } from './lexicon'

/** Bump when a change here would give different results for the same text. */
// 2: units carry variables and a date.
// 4: the CHD's segments are cut on labiia_lex's word chain (contentChain).
export const PREPARATION_VERSION = 4

export interface TextUnitInput {
  id: string
  name: string
  /** Source document of a coded passage (the CHD groups passages by it). */
  document?: string
  text: string
  variables?: string[]
  date?: string
}

/**
 * Texts in the order labiia_lex reads a folder: by document name, ignoring
 * case (as Windows sorts paths). Coded passages keep their order inside
 * their document.
 */
export function sortByDocumentName<T extends TextUnitInput>(units: T[]): T[] {
  const key = (u: T): string => (u.document ?? u.name).toLowerCase()
  return [...units].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
}

export interface PrepareOptions {
  language: CorpusLanguage
  /** Target segment length in words (IRaMuTeQ default 40). */
  uceSize: number
  /**
   * How segments are cut. 'all' (IRaMuTeQ): every word counts toward the
   * length and cuts prefer sentence ends. 'content' (labiia_lex's CHD):
   * only the words labiia_lex keeps before cutting count, so the same text
   * gives the same segments as in labiia_lex (see contentChain); the
   * segments keep their stopwords.
   */
  segmentCount?: 'all' | 'content'
}

export interface PreparedCorpus {
  version: number
  language: CorpusLanguage
  uceSize: number
  units: { id: string; name: string; document?: string; variables: string[]; date?: string }[]
  /** Unit index of each segment. */
  uceUnit: Uint32Array
  /** Cleaned segment text (lower case, punctuation removed), as IRaMuTeQ stores it. */
  uceText: string[]
  /** tokens[uceStart[i] .. uceStart[i+1]) are the form ids of segment i, in order. */
  uceStart: Uint32Array
  tokens: Uint32Array
  forms: string[]
  formFreq: Uint32Array
  formLemma: Uint32Array
  formGram: string[]
  /** 1 = active, 2 = supplementary (grammatical class or stopword). */
  formAct: Uint8Array
  lemmas: string[]
  lemmaFreq: Uint32Array
  lemmaGram: string[]
  lemmaAct: Uint8Array
  stats: { units: number; segments: number; occurrences: number; forms: number; lemmas: number; hapax: number }
}

// Characters IRaMuTeQ keeps; everything else becomes a space (after lower-casing).
// \u0001 stands in for the ellipsis marker while the filter runs.
const DROP_CHARS = /[^a-z0-9àâäáåãéèêëìîïíóòôöõøùûüúçßœ’ñ.:,;!?'_\-\u0001]+/g

/** Separator weights used to choose where a segment ends (IRaMuTeQ's decouperlist). */
const SEPARATOR_WEIGHT: Record<string, number> = { '.': 6, '?': 6, '!': 6, '£$£': 6, ':': 5, ';': 4, ',': 1 }
const SPACE_WEIGHT = 0.01
const PUNCTUATION = new Set(['.', '£$£', ';', '?', '!', ',', ':', ''])
const END = '$'

/**
 * Text extraction leftovers repaired before cleaning: words hyphenated
 * across a line break are joined, and web addresses and file paths are
 * removed, since they would otherwise become many meaningless "words".
 */
export function repairExtraction(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    // Line breaks written out as "\n" by some exports would glue an "n" to the next word.
    .replace(/\\[nrt]/g, ' ')
    .replace(/(\p{L})-\n[ \t]*(\p{Ll})/gu, '$1$2')
    .replace(/\b(?:https?:\/\/|www\.)\S+/giu, ' ')
    .replace(/\b[a-z]:\\\S+/giu, ' ')
}

/** IRaMuTeQ's cleaning: lower case, punctuation spaced out, other characters dropped, expressions joined, apostrophes and hyphens split. */
export function cleanText(text: string, expressions: [string, string][] = []): string {
  let txt = text.toLowerCase()
  txt = txt.replace(/’/g, "'").replace(/œ/g, 'oe')
  txt = txt
    .replace(/\.\.\./g, ' £$£ ')
    .replace(/\?/g, ' ? ')
    .replace(/\./g, ' . ')
    .replace(/!/g, ' ! ')
    .replace(/,/g, ' , ')
    .replace(/;/g, ' ; ')
    .replace(/:/g, ' : ')
    .replace(/…/g, ' £$£ ')
  // The "£$£" marker survives the character filter by being restored afterwards.
  txt = txt.replace(/£\$£/g, '\u0001').replace(DROP_CHARS, ' ').replace(/\u0001/g, '£$£')
  for (const [source, target] of expressions) {
    if (source && txt.includes(source)) txt = txt.split(source).join(target)
  }
  txt = txt.replace(/'/g, ' ').replace(/-/g, ' ')
  return txt.split(/\s+/).filter(Boolean).join(' ')
}

/**
 * One cut of IRaMuTeQ's decouperlist: the next segment and what remains.
 * With `counted` (one flag per word of `chaine`), only the flagged words
 * occupy positions, as if the others were not there: labiia_lex's CHD cuts
 * a text from which they were deleted.
 */
export function decouperlist(
  chaine: string[],
  longueur: number,
  longueurOptimale: number,
  counted?: boolean[]
): { found: boolean; segment: string[]; rest: string[]; restCounted?: boolean[] } {
  let trouve = false
  let iDecoupe = 0
  let travail: string[]
  // Position of each word measured in counted words (every word when `counted` is absent).
  let posOf: (nb: number) => number
  if (!counted) {
    longueur = Math.min(longueur, chaine.length - 1)
    travail = chaine.slice(0, longueur + 1)
    posOf = (nb) => nb
  } else {
    const pos: number[] = []
    let k = -1
    let i = 0
    for (; i < chaine.length; i++) {
      // The end marker takes a position too, as in labiia_lex's chain.
      if (counted[i] || chaine[i] === END) {
        if (k + 1 > longueur) break
        k++
      }
      pos.push(Math.max(0, k))
    }
    travail = chaine.slice(0, i)
    longueur = travail.length - 1
    posOf = (nb) => pos[nb]
  }
  let best = { weight: 0, pos: 0 }

  const endAt = travail.indexOf(END)
  if (endAt >= 0) {
    trouve = true
    iDecoupe = endAt - 1
  } else {
    for (let nb = longueur; nb >= 0; nb--) {
      const mot = travail[nb]
      const distance = Math.abs(longueurOptimale - posOf(nb)) + 1
      const bestDistance = Math.abs(longueurOptimale - best.pos) + 1
      // A word that does not count is not in labiia_lex's chain, so it is no preferred place to cut.
      const weight = counted && !counted[nb] ? SPACE_WEIGHT : SEPARATOR_WEIGHT[mot] ?? SPACE_WEIGHT
      if (weight / distance > best.weight / bestDistance) {
        best = { weight, pos: posOf(nb) }
        trouve = true
        iDecoupe = nb
      }
    }
  }
  if (trouve) {
    const segment = travail.slice(0, iDecoupe + 1)
    return { found: segment.length > 0, segment, rest: chaine.slice(iDecoupe + 1), restCounted: counted?.slice(iDecoupe + 1) }
  }
  return { found: false, segment: chaine, rest: [], restCounted: [] }
}

/**
 * Cuts a cleaned text into segments of about `uceSize` words (at most
 * uceSize + 15). `counted` flags the words that count (all when absent).
 */
export function makeSegments(cleaned: string, uceSize: number, counted?: boolean[]): string[] {
  if (!cleaned) return []
  const out: string[] = []
  const push = (seg: string[]): void => {
    const s = seg.filter((w) => !PUNCTUATION.has(w)).join(' ').trim()
    if (s) out.push(s)
  }
  let cut = decouperlist([...cleaned.split(' '), END], uceSize + 15, uceSize, counted ? [...counted, false] : undefined)
  while (cut.found) {
    push(cut.segment)
    cut = decouperlist(cut.rest, uceSize + 15, uceSize, cut.restCounted)
  }
  push(cut.segment.filter((w) => w !== END))
  return out
}

/** The text's lines split at IRaMuTeQ heading lines ("****" text, "-*" theme), which are left out. */
export function splitAtHeadings(lines: string[]): string[][] {
  const parts: string[][] = [[]]
  for (const line of lines) {
    if (line.startsWith('****') || line.startsWith('-*')) parts.push([])
    else parts[parts.length - 1].push(line)
  }
  return parts.filter((p) => p.length > 0)
}

const WORD_CHAR = /[\p{L}\p{M}\p{N}_]/u
const LETTER = /\p{L}/u
const DIGIT = /\p{Nd}/u
// Unicode word-boundary classes (UAX #29) of the punctuation that can sit inside a word.
const MID_NUM_LET = new Set(['.', "'", '‘', '’', '․', '﹒', '＇', '．'])
const MID_LETTER = new Set([':', '·', '·', '‧', '︓', '﹕', '：'])
const MID_NUM = new Set([',', ';', ';', '٬', '︐', '︔', '﹐', '﹔', '，', '；'])

/**
 * The text split into words and what lies between them, by the Unicode
 * word-boundary rules that quanteda (labiia_lex) applies: letters, digits
 * and "_" join, and a "." or apostrophe between two letters or two digits,
 * ":" between two letters, or "," or ";" between two digits stays inside
 * the word ("o.com", "d'água", "1.1", "1,5"). Written out rather than taken
 * from Intl.Segmenter, whose rules differ between Node and Electron.
 */
export function unicodeWords(text: string): { text: string; word: boolean }[] {
  const chars = [...text]
  const out: { text: string; word: boolean }[] = []
  let i = 0
  while (i < chars.length) {
    const start = i
    if (!WORD_CHAR.test(chars[i])) {
      while (i < chars.length && !WORD_CHAR.test(chars[i])) i++
      out.push({ text: chars.slice(start, i).join(''), word: false })
      continue
    }
    for (;;) {
      while (i < chars.length && WORD_CHAR.test(chars[i])) i++
      const mid = chars[i]
      const prev = chars[i - 1]
      const next = chars[i + 1]
      if (mid === undefined || next === undefined) break
      const letters = LETTER.test(prev) && LETTER.test(next)
      const digits = DIGIT.test(prev) && DIGIT.test(next)
      const joins = (MID_NUM_LET.has(mid) && (letters || digits)) || (MID_LETTER.has(mid) && letters) || (MID_NUM.has(mid) && digits)
      if (!joins) break
      i++
    }
    out.push({ text: chars.slice(start, i).join(''), word: true })
  }
  return out
}

/**
 * labiia_lex's CHD chain. Before cutting, labiia_lex's R text pipeline
 * splits the text into words by the Unicode rules (quanteda), drops loose
 * punctuation and deletes the stopwords; what remains is then cleaned as by
 * IRaMuTeQ. So a word with punctuation inside ("1.1", "o.com", "1,5") is
 * never deleted, and its inner punctuation stays and is a place to cut.
 * Returns the IRaMuTeQ-cleaned text with one flag per word: whether it is
 * in that chain.
 */
export function contentChain(text: string, lexicon: Lexicon): { cleaned: string; counted: boolean[] } {
  const words: string[] = []
  const counted: boolean[] = []
  for (const part of unicodeWords(text)) {
    const kept = part.word && !lexicon.segmentStopwords.has(part.text.toLowerCase())
    const cleaned = cleanText(part.text)
    if (!cleaned) continue
    for (const w of cleaned.split(' ')) {
      words.push(w)
      counted.push(kept)
    }
  }
  return { cleaned: words.join(' '), counted }
}

export interface PrepareProgress {
  done: number
  total: number
}

export function prepareCorpus(
  units: TextUnitInput[],
  lexicon: Lexicon,
  options: PrepareOptions,
  onProgress?: (p: PrepareProgress) => void,
  isCancelled?: () => boolean
): PreparedCorpus {
  const uceUnit: number[] = []
  const uceText: string[] = []
  const uceStart: number[] = [0]
  const tokens: number[] = []

  const formIndex = new Map<string, number>()
  const forms: string[] = []
  const formFreq: number[] = []
  const formLemma: number[] = []
  const formGram: string[] = []
  const formAct: number[] = []

  // A lemma is identified by its text and its status: stopword occurrences of
  // an otherwise active lemma ("é", "foi" of "ser") go to a supplementary
  // entry, so they never count in an active lemma's frequency.
  const lemmaIndex = new Map<string, number>()
  const lemmas: string[] = []
  const lemmaFreq: number[] = []
  const lemmaGram: string[] = []
  const lemmaAct: number[] = []

  const formId = (form: string): number => {
    let id = formIndex.get(form)
    if (id !== undefined) return id
    let lemma = form
    let gram: string
    if (/^\d+$/.test(form)) gram = 'num'
    else {
      const hit = lexicon.lookup(form)
      if (hit) [lemma, gram] = hit
      else gram = 'nr'
    }
    const stop = lexicon.stopwords.has(form) || lexicon.stopwords.has(lemma)
    const act = gramIsActive(gram) && !stop ? 1 : 2
    const lemmaKey = `${lemma}\u0000${act}`
    let lid = lemmaIndex.get(lemmaKey)
    if (lid === undefined) {
      lid = lemmas.length
      lemmaIndex.set(lemmaKey, lid)
      lemmas.push(lemma)
      lemmaFreq.push(0)
      lemmaGram.push(gram)
      lemmaAct.push(act)
    }
    id = forms.length
    formIndex.set(form, id)
    forms.push(form)
    formFreq.push(0)
    formLemma.push(lid)
    formGram.push(gram)
    formAct.push(act)
    return id
  }

  const uceSize = Math.max(20, Math.min(200, Math.round(options.uceSize || 40)))
  for (let u = 0; u < units.length; u++) {
    if (isCancelled?.()) throw new Error('cancelled')
    // The lines of a text are one stream, as in IRaMuTeQ: segments may span line breaks.
    const lines = repairExtraction(units[u].text).split('\n').map((l) => l.trim()).filter(Boolean)
    const segments: string[] = []
    if (options.segmentCount === 'content') {
      // labiia_lex reads texts in IRaMuTeQ's format: a line starting with "****" (a text)
      // or "-*" (a theme) is a heading, so it is left out and the cutting starts again after it.
      for (const part of splitAtHeadings(lines)) {
        const chain = contentChain(part.join(' '), lexicon)
        segments.push(...makeSegments(chain.cleaned, uceSize, chain.counted))
      }
    } else {
      segments.push(...makeSegments(cleanText(lines.join(' '), lexicon.expressions), uceSize))
    }
    for (const seg of segments) {
      uceUnit.push(u)
      uceText.push(seg)
      for (const w of seg.split(' ')) {
        const id = formId(w)
        tokens.push(id)
        formFreq[id]++
        lemmaFreq[formLemma[id]]++
      }
      uceStart.push(tokens.length)
    }
    onProgress?.({ done: u + 1, total: units.length })
  }

  let hapax = 0
  for (const f of formFreq) if (f === 1) hapax++
  return {
    version: PREPARATION_VERSION,
    language: options.language,
    uceSize,
    units: units.map((x) => ({ id: x.id, name: x.name, ...(x.document ? { document: x.document } : {}), variables: x.variables ?? [], ...(x.date ? { date: x.date } : {}) })),
    uceUnit: Uint32Array.from(uceUnit),
    uceText,
    uceStart: Uint32Array.from(uceStart),
    tokens: Uint32Array.from(tokens),
    forms,
    formFreq: Uint32Array.from(formFreq),
    formLemma: Uint32Array.from(formLemma),
    formGram,
    formAct: Uint8Array.from(formAct),
    lemmas,
    lemmaFreq: Uint32Array.from(lemmaFreq),
    lemmaGram,
    lemmaAct: Uint8Array.from(lemmaAct),
    stats: {
      units: units.length,
      segments: uceText.length,
      occurrences: tokens.length,
      forms: forms.length,
      lemmas: lemmas.length,
      hapax
    }
  }
}

/**
 * Word frequencies over the corpus, as labiia_lex's TextProcessor gives
 * them to the word cloud: by lemma or by form, active words only when
 * asked, most frequent first.
 */
export function wordFrequencies(c: PreparedCorpus, opts: { useLemmas: boolean; activeOnly: boolean; isDisplayTerm?: (w: string) => boolean }): [string, number][] {
  const out: [string, number][] = []
  const show = opts.isDisplayTerm ?? isContentWord
  const push = (word: string, freq: number, act: number): void => {
    if (opts.activeOnly && act !== 1) return
    if (!show(word)) return
    out.push([word, freq])
  }
  if (opts.useLemmas) for (let i = 0; i < c.lemmas.length; i++) push(c.lemmas[i], c.lemmaFreq[i], c.lemmaAct[i])
  else for (let i = 0; i < c.forms.length; i++) push(c.forms[i], c.formFreq[i], c.formAct[i])
  if (opts.useLemmas) {
    // A lemma may appear twice (active and supplementary); without the
    // active-only filter the two entries are added together.
    const merged = new Map<string, number>()
    for (const [w, f] of out) merged.set(w, (merged.get(w) ?? 0) + f)
    out.length = 0
    for (const e of merged) out.push(e)
  }
  // Ties in reverse alphabetical order, as labiia_lex and IRaMuTeQ sort (frequency, word) descending.
  return out.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
}

/**
 * Single letters and tokens with digits are not shown as words. Roman
 * numerals are kept: in Portuguese many are real words ("vi", "li", "mil").
 */
export function isContentWord(word: string): boolean {
  return word.length >= 2 && !/\d/.test(word)
}
