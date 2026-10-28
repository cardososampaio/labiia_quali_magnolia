import { describe, it, expect } from 'vitest'
import { mkdtempSync, readdirSync, writeFileSync, utimesSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Lexicon } from '../../src/main/lexical/corpus/lexicon'
import { cleanText, makeSegments, prepareCorpus, repairExtraction, wordFrequencies } from '../../src/main/lexical/corpus/prepare'
import { corpusKey, readCachedCorpus, writeCachedCorpus, hasCachedCorpus, pruneCache } from '../../src/main/lexical/corpus/cache'

// Corpus preparation must follow IRaMuTeQ: segments of about 40 words cut
// preferably at sentence ends, words lemmatised with the IRaMuTeQ
// dictionary, content words active. Corrected from labiia_lex: stopwords
// stay in the text (marked supplementary) and count in the segment size.

const RES = join(__dirname, '..', '..', 'resources', 'lexical')
const pt = new Lexicon('pt', RES)

describe('cleaning', () => {
  it('keeps accented words whole and splits hyphens and apostrophes', () => {
    expect(cleanText('Não há AÇÃO sem pré-escola, d’água!')).toBe('não há ação sem pré escola , d água !')
  })

  it('marks ellipses as sentence ends and drops other symbols', () => {
    expect(cleanText('Então... «talvez» 50% (sim)')).toBe('então £$£ talvez 50 sim')
  })

  it('joins words hyphenated across a line break and removes web addresses', () => {
    expect(repairExtraction('educa-\nção em https://exemplo.org/x e www.site.br')).toBe('educação em   e  ')
  })
})

describe('segments', () => {
  const words = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `w${i + from}`)

  it('cuts at a nearby full stop, then near 40 words, then at the end', () => {
    // Worked by hand with IRaMuTeQ's weights: "." at word 38 (6/3) beats any
    // space; with no punctuation the best cut is the 41st word (0.01/1).
    const text = [...words(38), '.', ...words(62, 39)].join(' ')
    const segs = makeSegments(text, 40).map((s) => s.split(' ').length)
    expect(segs).toEqual([38, 41, 21])
  })

  it('never exceeds 55 words and drops punctuation from segment text', () => {
    const text = cleanText(Array.from({ length: 30 }, () => 'um dois três quatro cinco, seis sete oito nove dez').join(' '))
    const segs = makeSegments(text, 40)
    for (const s of segs) {
      expect(s.split(' ').length).toBeLessThanOrEqual(56)
      expect(s).not.toMatch(/[,.;:!?]/)
    }
    expect(segs.join(' ').split(' ').length).toBe(300)
  })

  it('counts stopwords in the segment size', () => {
    const text = cleanText(Array.from({ length: 20 }, () => 'de que o').join(' ') + '. ' + Array.from({ length: 20 }, () => 'escola').join(' '))
    // 60 stopwords, a full stop, 20 content words. Had the stopwords been
    // deleted first (labiia_lex), everything would fit in one segment.
    const segs = makeSegments(text, 40).map((s) => s.split(' ').length)
    expect(segs).toEqual([41, 39])
  })
})

describe('lemmas and status', () => {
  const corpus = prepareCorpus(
    [
      { id: 'a', name: 'A', text: 'Não há ação sem pré-escola. As escolas públicas falaram e o professor falou.' },
      { id: 'b', name: 'B', text: 'A escola é pública. Foi 2024.' }
    ],
    pt,
    { language: 'pt', uceSize: 40 }
  )
  const lemma = (w: string) => corpus.lemmas[corpus.formLemma[corpus.forms.indexOf(w)]]
  const act = (w: string) => corpus.formAct[corpus.forms.indexOf(w)]

  it('lemmatises with the IRaMuTeQ dictionary', () => {
    expect(pt.size).toBeGreaterThan(100_000)
    expect(lemma('escolas')).toBe('escola')
    expect(lemma('falaram')).toBe('falar')
    expect(lemma('falou')).toBe('falar')
    expect(lemma('pré')).toBe('pré')
  })

  it('marks content words active and stopwords, articles and numbers supplementary', () => {
    expect(act('ação')).toBe(1)
    expect(act('escola')).toBe(1)
    expect(act('não')).toBe(2) // stopword
    expect(act('o')).toBe(2)
    expect(act('é')).toBe(2)
    expect(act('2024')).toBe(2)
  })

  it('keeps stopwords in the segment text', () => {
    expect(corpus.uceText[0].startsWith('não há ação sem pré escola')).toBe(true)
    expect(corpus.stats).toMatchObject({ units: 2, segments: 2 })
  })

  it('gives word frequencies by lemma, active words only', () => {
    const f = Object.fromEntries(wordFrequencies(corpus, { useLemmas: true, activeOnly: true }))
    expect(f.escola).toBe(3)
    expect(f.falar).toBe(2)
    expect(f.público ?? f.pública).toBe(2)
    expect(f['não']).toBeUndefined()
    expect(f['2024']).toBeUndefined()
  })
})

describe('display gate', () => {
  it('leaves out fillers, numbers, roman numerals and abbreviations, and keeps content words', () => {
    for (const w of ['né', 'gente', 'então', 'coisa', 'xii', 'etc', 'www', 'covid19', 'de']) expect(pt.isDisplayTerm(w)).toBe(false)
    for (const w of ['achar', 'falar', 'democracia', 'participação', 'ia', 'sus']) expect(pt.isDisplayTerm(w)).toBe(true)
  })

  it('removes line breaks written as text', () => {
    expect(repairExtraction('fim\\npalestrante')).toBe('fim palestrante')
  })
})

describe('cache', () => {
  const units = [{ id: 'a', name: 'A', text: 'Texto da escola.' }]
  const opts = { language: 'pt' as const, uceSize: 40 }

  it('changes the fingerprint when text, language or field boundaries change', () => {
    const k = corpusKey(units, opts)
    expect(corpusKey(units, opts)).toBe(k)
    expect(corpusKey([{ ...units[0], text: 'Texto da escola!' }], opts)).not.toBe(k)
    expect(corpusKey(units, { ...opts, language: 'en' })).not.toBe(k)
    expect(corpusKey([{ id: 'ab', name: 'c', text: '' }], opts)).not.toBe(corpusKey([{ id: 'a', name: 'bc', text: '' }], opts))
  })

  it('stores and reads back a prepared corpus', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lexcache-'))
    const corpus = prepareCorpus(units, pt, opts)
    const key = corpusKey(units, opts)
    expect(hasCachedCorpus(dir, key)).toBe(false)
    writeCachedCorpus(dir, key, corpus)
    const back = readCachedCorpus(dir, key)!
    expect(back.forms).toEqual(corpus.forms)
    expect(Array.from(back.tokens)).toEqual(Array.from(corpus.tokens))
    expect(back.tokens).toBeInstanceOf(Uint32Array)
  })

  it('ignores a damaged file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lexcache-'))
    writeFileSync(join(dir, 'abc.corpus'), 'not a corpus')
    expect(readCachedCorpus(dir, 'abc')).toBeNull()
  })

  it('removes the least recently used corpora above the limit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lexcache-'))
    for (const [name, age] of [['old', 3000], ['mid', 2000], ['new', 1000]] as const) {
      const p = join(dir, `${name}.corpus`)
      writeFileSync(p, Buffer.alloc(100))
      const t = new Date(Date.now() - age * 1000)
      utimesSync(p, t, t)
    }
    pruneCache(dir, 250)
    expect(readdirSync(dir).sort()).toEqual(['mid.corpus', 'new.corpus'])
  })
})
