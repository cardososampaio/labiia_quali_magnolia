/**
 * The IRaMuTeQ dictionaries: each word form with its lemma and grammatical
 * class, and which classes count as "active" (content words) in the
 * analyses. Files live in resources/lexical/dictionaries.
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export type CorpusLanguage = 'pt' | 'en' | 'es'

/** IRaMuTeQ's key.cfg: 1 = active, 2 = supplementary. Classes missing here are supplementary. */
export const GRAM_STATUS: Record<string, 1 | 2> = {
  art_def: 2, pre: 2, adj_dem: 2, ono: 2, pro_per: 2, ver_sup: 2, adv: 1, ver: 1,
  adj_ind: 2, adj_pos: 2, aux: 2, adj_int: 2, pro_ind: 2, adj: 1, pro_dem: 2, nom: 1,
  art_ind: 2, pro_pos: 2, nom_sup: 2, adv_sup: 2, adj_sup: 2, adj_num: 2, pro_rel: 2,
  con: 2, num: 2, nr: 1, sw: 2, pro: 2
}

export function gramIsActive(gram: string): boolean {
  return GRAM_STATUS[gram] === 1
}

const DICTIONARY_FILE: Record<CorpusLanguage, string> = { pt: 'lexique_pt.txt', en: 'lexique_en.txt', es: 'lexique_sp.txt' }
const EXPRESSION_FILE: Record<CorpusLanguage, string> = { pt: 'expression_pt.txt', en: 'expression_en.txt', es: 'expression_sp.txt' }

/**
 * Corrections to the official Portuguese dictionary: "pós" and "pré" are cut
 * from "pós-graduação" and "pré-escola" when hyphens split words, and the
 * dictionary would lemmatise them as "pó" (dust) and "predeterminado".
 */
const LEMMA_OVERRIDES: Partial<Record<CorpusLanguage, Record<string, [string, string]>>> = {
  pt: { 'pós': ['pós', 'adj'], 'pré': ['pré', 'adj'] }
}

/**
 * Spanish and English dictionaries are written without some accents that
 * real texts carry, so those languages also look words up with accents
 * removed. Portuguese is matched exactly, as in IRaMuTeQ.
 */
const ACCENT_FOLDING: Record<CorpusLanguage, boolean> = { pt: false, en: true, es: true }

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC')
}

export class Lexicon {
  readonly language: CorpusLanguage
  private entries = new Map<string, [string, string]>()
  private folded = new Map<string, [string, string]>()
  readonly expressions: [string, string][] = []
  readonly stopwords = new Set<string>()
  /** Words left out of charts, clouds and labels (labiia_lex's display gate): function words and conversational fillers. */
  readonly displayStopwords = new Set<string>()
  /** Short words that are shown even though they are under three letters ("ia", "sus"). */
  readonly displayAllow = new Set<string>()

  constructor(language: CorpusLanguage, resourcesDir: string) {
    this.language = language
    const dictDir = join(resourcesDir, 'dictionaries')
    const text = readFileSync(join(dictDir, DICTIONARY_FILE[language]), 'utf-8')
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line) continue
      const parts = line.split('\t')
      if (parts.length < 3) continue
      const word = parts[0].trim().toLowerCase()
      const lemma = parts[1].trim().toLowerCase() || word
      const gram = parts[2].trim().toLowerCase() || 'nr'
      // A form listed twice keeps its last entry, as the dictionary loader of labiia_lex does.
      this.entries.set(word, [lemma, gram])
      const f = stripAccents(word)
      if (f && !this.folded.has(f)) this.folded.set(f, [lemma, gram])
    }
    for (const [word, entry] of Object.entries(LEMMA_OVERRIDES[language] ?? {})) {
      if (this.entries.has(word)) {
        this.entries.set(word, entry)
        const f = stripAccents(word)
        if (this.folded.has(f)) this.folded.set(f, entry)
      }
    }

    const expPath = join(dictDir, EXPRESSION_FILE[language])
    if (existsSync(expPath)) {
      for (const raw of readFileSync(expPath, 'utf-8').split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith('#')) continue
        const parts = line.includes('\t') ? line.split('\t', 2) : line.split(/\s{2,}/, 2)
        if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
          this.expressions.push([parts[0].trim().toLowerCase(), parts[1].trim().toLowerCase()])
        }
      }
      // Longest first, so "a contrario de" wins over "a contrario".
      this.expressions.sort((a, b) => b[0].length - a[0].length)
    }

    const swPath = join(resourcesDir, 'stopwords', `${language}.txt`)
    if (existsSync(swPath)) {
      for (const w of readFileSync(swPath, 'utf-8').split(/\r?\n/)) if (w.trim()) this.stopwords.add(w.trim().toLowerCase())
    }
    for (const w of ALWAYS_STOPWORDS) this.stopwords.add(w)

    const readList = (file: string, into: Set<string>): void => {
      const path = join(resourcesDir, 'stopwords', file)
      if (!existsSync(path)) return
      for (const w of readFileSync(path, 'utf-8').split(/\r?\n/)) if (w.trim()) into.add(w.trim().toLowerCase())
    }
    readList(`visual_${language}.txt`, this.displayStopwords)
    readList(`allow_${language}.txt`, this.displayAllow)
  }

  /**
   * labiia_lex's is_stopword_like: noise (roman numerals, web fragments,
   * abbreviations, letters mixed with digits) or a display stopword. Used to
   * build analysis vocabularies; unlike isDisplayTerm it keeps short words.
   */
  isStopwordLike(word: string): boolean {
    if (!word) return true
    const folded = stripAccents(word)
    if (WEB_FRAGMENTS.has(folded) || ABBREVIATIONS.has(folded) || ROMAN_NUMERAL.test(folded)) return true
    if (/\d/.test(word) && /\p{L}/u.test(word)) return true
    return this.displayStopwords.has(folded) || this.displayStopwords.has(word)
  }

  /**
   * Whether a word is shown in charts and clouds: labiia_lex's display gate.
   * Leaves out numbers, roman numerals, web fragments, abbreviations,
   * words under three letters (unless allowed) and display stopwords;
   * a joined expression ("a_contrario") must not start or end with one.
   */
  isDisplayTerm(word: string): boolean {
    if (!word || /\d/.test(word)) return false
    const folded = stripAccents(word)
    if (WEB_FRAGMENTS.has(folded) || ABBREVIATIONS.has(folded) || ROMAN_NUMERAL.test(folded)) return false
    if (this.displayAllow.has(folded)) return true
    if (word.length < 3 || !/\p{L}/u.test(word)) return false
    if (this.displayStopwords.has(folded) || this.displayStopwords.has(word)) return false
    const parts = word.split(/[_-]+/).filter(Boolean)
    if (parts.length >= 2) {
      const fp = parts.map(stripAccents)
      if (this.displayStopwords.has(fp[0]) || this.displayStopwords.has(fp[fp.length - 1])) return false
      const content = fp.filter((p) => this.displayAllow.has(p) || (p.length >= 3 && !this.displayStopwords.has(p)))
      return content.length >= Math.max(1, fp.length - 1)
    }
    return true
  }

  get size(): number {
    return this.entries.size
  }

  /** Lemma and grammatical class of a word form, or null when the dictionary does not know it. */
  lookup(word: string): [string, string] | null {
    const direct = this.entries.get(word)
    if (direct) return direct
    if (!ACCENT_FOLDING[this.language]) return null
    return this.folded.get(stripAccents(word)) ?? null
  }
}

const ROMAN_NUMERAL = /^(?=[ivxlcdm]{2,}$)m{0,4}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/
const WEB_FRAGMENTS = new Set(['br', 'org', 'gov', 'edu', 'com', 'net', 'www', 'http', 'https', 'html', 'htm', 'php', 'pdf', 'url', 'file', 'mailto'])
const ABBREVIATIONS = new Set([
  'jan', 'fev', 'feb', 'abr', 'apr', 'mai', 'jun', 'jul', 'ago', 'aug', 'set', 'sep', 'sept', 'out', 'oct', 'nov', 'dic', 'ene',
  'ed', 'eds', 'ad', 'am', 'pm', 'id', 'ibid', 'ibidem', 'etc', 'vs', 'cf', 'pp', 'op', 'cit', 'vol', 'num', 'cap', 'pag', 'pg',
  'fl', 'fls', 'obs', 'et', 'al', 'doi', 'isbn', 'issn', 'inc', 'ltda', 'doc', 'docs',
  'sr', 'sra', 'srs', 'dr', 'dra', 'prof', 'profa', 'av', 'tel'
])

/**
 * Words treated as stopwords in every language: bibliographic and web
 * fragments common in academic texts (labiia_lex's always-on list).
 */
export const ALWAYS_STOPWORDS = [
  'et', 'al', 'the', 'of', 'and', 'for', 'in', 'on', 'with', 'from', 'vol', 'pp', 'doi', 'issn', 'isbn',
  'http', 'https', 'www', 'url', 'html', 'pdf', 'retrieved', 'available', 'acesso', 'acessado', 'disponível', 'off'
]
