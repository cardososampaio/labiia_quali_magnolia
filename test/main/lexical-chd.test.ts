import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Lexicon } from '../../src/main/lexical/corpus/lexicon'
import { prepareCorpus } from '../../src/main/lexical/corpus/prepare'
import { writeChdMatrix } from '../../src/main/lexical/analyses/chd'
import { readClasses } from '../../src/main/lexical/tests/chd'

// The CHD input must be what IRaMuTeQ's R scripts read: a binary Matrix Market
// table of segments x active words (at least 3 occurrences), one row per segment.
const RES = join(__dirname, '..', '..', 'resources', 'lexical')
const pt = new Lexicon('pt', RES)

describe('CHD input table', () => {
  it('writes one binary row per segment over words with at least 3 occurrences', () => {
    const text = 'A escola pública precisa de professores. A escola precisa de merenda. O hospital precisa de médicos. '.repeat(4)
    const c = prepareCorpus([{ id: 'a', name: 'Doc A', text }], pt, { language: 'pt', uceSize: 40 })
    const dir = mkdtempSync(join(tmpdir(), 'chd-'))
    const info = writeChdMatrix(c, pt, { minFreq: 2, maxActives: 20000, useLemmas: true, rows: 'segments' }, dir)
    expect(info).not.toBeNull()
    const lines = readFileSync(join(dir, 'TableUc1.csv'), 'utf-8').trim().split('\n')
    expect(lines[0]).toBe('%%MatrixMarket matrix coordinate integer general')
    const [rows, cols, nnz] = lines[1].split(' ').map(Number)
    expect(rows).toBe(c.uceText.length)
    expect(cols).toBe(info!.terms)
    expect(lines.length - 2).toBe(nnz)
    for (const l of lines.slice(2)) expect(l.split(' ')[2]).toBe('1')
    // "médico" appears 4 times, so it is active; minFreq 2 is raised to IRaMuTeQ's 3.
    const words = readFileSync(join(dir, 'formes.csv'), 'utf-8').trim().split('\n').slice(1).map((l) => l.split(';'))
    for (const [, f] of words) expect(Number(f)).toBeGreaterThanOrEqual(3)
    expect(words.map(([w]) => w)).toContain('escola')
  })

  it('reads the class of each row from R output', () => {
    expect(readClasses('"";"V1";"V2"\n"1";2;3\n"2";0;0\n')).toEqual([3, 0])
  })
})

describe('CHD segments (labiia_lex)', () => {
  it('count only words outside the stopword list toward the 40 words', () => {
    // 200 words: "de" (stopword) alternating with "escola". labiia_lex deletes
    // "de" before cutting, so each of its segments spans about 80 words.
    const text = Array.from({ length: 100 }, () => 'de escola').join(' ')
    const units = [{ id: 'a', name: 'A', text }]
    const all = prepareCorpus(units, pt, { language: 'pt', uceSize: 40 })
    const content = prepareCorpus(units, pt, { language: 'pt', uceSize: 40, segmentCount: 'content' })
    const counts = (c: typeof all): number[] => c.uceText.map((s) => s.split(' ').filter((w) => w === 'escola').length)
    expect(counts(all)[0]).toBeLessThanOrEqual(28)
    expect(counts(content)[0]).toBeGreaterThanOrEqual(39)
    expect(counts(content)[0]).toBeLessThanOrEqual(41)
    // The stopwords stay in the segment text.
    expect(content.uceText[0].startsWith('de escola')).toBe(true)
  })

  it('count words with inner punctuation whole, and cut at that punctuation', async () => {
    const { contentChain } = await import('../../src/main/lexical/corpus/prepare')
    // "o.com" and "1.1" are single words for labiia_lex: never deleted as stopwords.
    const c = contentChain('ganhar o.com a gente, opinião 1.1 acesso', pt)
    const words = c.cleaned.split(' ')
    const flags = Object.fromEntries(words.map((w, i) => [`${w}@${i}`, c.counted[i]]))
    expect(flags).toEqual({
      'ganhar@0': true, 'o@1': true, '.@2': true, 'com@3': true, 'a@4': false, 'gente@5': true,
      ',@6': false, 'opinião@7': true, '1@8': true, '.@9': true, '1@10': true,
      // labiia_lex deletes its longer always-on list ("acesso", "doi"...) only after cutting.
      'acesso@11': true
    })
  })

  it('restart at IRaMuTeQ heading lines, which are left out', () => {
    const lines = Array.from({ length: 30 }, () => 'escola pública').join(' ')
    const text = `${lines}\n**** e aí queria entender\n${lines}`
    const c = prepareCorpus([{ id: 'a', name: 'A', text }], pt, { language: 'pt', uceSize: 40, segmentCount: 'content' })
    expect(c.uceText.join(' ')).not.toMatch(/entender/)
    // Each side of the heading (60 words) is cut on its own, so no segment spans it.
    expect(c.uceText.map((s) => s.split(' ').length)).toEqual([41, 19, 41, 19])
  })

  it('reads the texts by document name, ignoring case, whatever the import order', async () => {
    const { sortByDocumentName } = await import('../../src/main/lexical/corpus/prepare')
    const names = ['0-2sm_CB_T3.txt', '0-2sm__CB_T5.txt', 'b.txt', 'A.txt']
    expect(sortByDocumentName(names.map((n) => ({ id: n, name: n, text: '' }))).map((u) => u.name))
      .toEqual(['0-2sm__CB_T5.txt', '0-2sm_CB_T3.txt', 'A.txt', 'b.txt'])
  })
})

describe('CHD profiles and dendrogram', () => {
  it('reads IRaMuTeQ profile sections and the chi2 table', async () => {
    const { readProfiles, readChiTable } = await import('../../src/main/lexical/tests/chd')
    const profiles = readProfiles([
      '"V1";"V2";"V3";"V4";"V5";"V6"',
      '"***";"nb classes";"2";"***";"";""',
      '"**";"classe";"1";"**";"";""',
      '"****";"131";"674";"19.44";"****";""',
      '"52";"119";" 43.70";"54.324";"democracia";"1.7e-13"',
      '"**";"classe";"2";"**";"";""',
      '" 8";"  8";"100.00";"33.559";"líder";"6.9e-09"'
    ].join('\n'))
    expect(profiles).toEqual([
      { cls: 1, word: 'democracia', inClass: 52, total: 119, percent: 43.7, chi2: 54.324, p: 1.7e-13 },
      { cls: 2, word: 'líder', inClass: 8, total: 8, percent: 100, chi2: 33.559, p: 6.9e-9 }
    ])
    const chi = readChiTable('"";"classe 1";"classe 2"\n"achar";-0,235;6,8\n')
    expect(chi.get('achar')).toEqual([-0.235, 6.8])
  })

  it('draws the tree the CHD built, not one rebuilt from the profiles', async () => {
    const { chdDendrogram, parseNewick } = await import('../../src/main/lexical/plot/chd-dendrogram')
    expect(parseNewick('((1,((4,(5,6)),2)),3);')).toEqual([[1, [[4, [5, 6]], 2]], 3])
    const fig = chdDendrogram('((1,((4,(5,6)),2)),3);', [10, 10, 10, 10, 10, 50], (k) => [`w${k}`])
    expect(fig.classes.map((c) => c.id)).toEqual([1, 4, 5, 6, 2, 3])
    expect(fig.classes.find((c) => c.id === 6)!.percent).toBeCloseTo(50)
    // Class k keeps colour k whatever its place in the tree.
    expect(fig.classes.find((c) => c.id === 1)!.color).toBe('#C0405C')
  })

  it('counts, per class, the rows where each word appears', async () => {
    const { writeChdProfileTables, docVariable } = await import('../../src/main/lexical/analyses/chd')
    expect(docVariable('Entrevista Uirá.md')).toBe('*doc_EntrevistaUiramd')
    const text = 'A escola pública precisa de professores. O hospital precisa de médicos. '.repeat(6)
    const c = prepareCorpus([{ id: 'a', name: 'Doc A', text }, { id: 'b', name: 'Doc B', text }], pt, { language: 'pt', uceSize: 40 })
    const dir = mkdtempSync(join(tmpdir(), 'chdprof-'))
    const classes = c.uceText.map((_t, i) => (i % 2) + 1)
    writeChdProfileTables(c, pt, { minFreq: 3, maxActives: 20000, useLemmas: true, rows: 'segments' }, dir, classes)
    const cont = readFileSync(join(dir, 'Contout.csv'), 'utf-8').trim().split('\n').map((l) => l.split(';'))
    const escola = cont.find(([w]) => w === 'escola')!
    const expected = [1, 2].map((k) => c.uceText.filter((s, i) => classes[i] === k && s.split(' ').includes('escola')).length)
    expect(escola.slice(1).map(Number)).toEqual(expected)
    // Stopwords are not supplementary words here (labiia_lex deletes them).
    const sup = readFileSync(join(dir, 'ContSupOut.csv'), 'utf-8')
    expect(sup).not.toMatch(/^de;/m)
    expect(readFileSync(join(dir, 'ContEtOut.csv'), 'utf-8')).toMatch(/^\*doc_DocA;/m)
  })
})

describe('CHD double classification and robustness', () => {
  it('joins consecutive segments of a text into context units as IRaMuTeQ (make_uc)', async () => {
    const { contextUnits } = await import('../../src/main/lexical/analyses/chd')
    // Active words per segment; a unit keeps growing while it holds at most 12.
    expect(contextUnits([5, 5, 5, 20, 3, 4], [0, 0, 0, 0, 1, 1], 12)).toEqual([[0, 1, 2], [3], [4, 5]])
  })

  it('measures agreement by the adjusted Rand index (same values as labiia_lex)', async () => {
    const { adjustedRandIndex, robustnessSpecs } = await import('../../src/main/lexical/analyses/chd-robustness')
    expect(adjustedRandIndex([1, 1, 2, 2, 0, 3, 3, 1], [2, 2, 1, 1, 0, 3, 1, 1])).toBeCloseTo(0.15789473684210525, 12)
    expect(adjustedRandIndex([1, 1, 2, 2], [2, 2, 1, 1])).toBe(1)
    expect(robustnessSpecs(5, 3).map((s) => [s.classes, s.minFreq])).toEqual([[5, 3], [6, 3], [8, 3], [5, 5], [6, 5], [8, 5]])
  })
})

describe('variables and timelines', () => {
  it('adds the documents tag variables to the CHD variable table', async () => {
    const { writeChdProfileTables } = await import('../../src/main/lexical/analyses/chd')
    const text = 'A escola pública precisa de professores. O hospital precisa de médicos. '.repeat(6)
    const c = prepareCorpus([
      { id: 'a', name: 'Doc A', text, variables: ['*genero_feminino'] },
      { id: 'b', name: 'Doc B', text, variables: ['*genero_masculino'] }
    ], pt, { language: 'pt', uceSize: 40 })
    const dir = mkdtempSync(join(tmpdir(), 'chdvar-'))
    writeChdProfileTables(c, pt, { minFreq: 3, maxActives: 20000, useLemmas: true, rows: 'segments' }, dir, c.uceText.map(() => 1))
    const et = readFileSync(join(dir, 'ContEtOut.csv'), 'utf-8')
    const perDoc = c.uceUnit.filter((u) => u === 0).length
    expect(et.split('\n')).toContain(`*genero_feminino;${perDoc}`)
    expect(et).toMatch(/^\*genero_masculino;/m)
  })

  it('averages topics and shares sentiment per date, leaving undated documents out', async () => {
    const { ldaTimeline, sentimentTimeline, dateLabel } = await import('../../src/main/lexical/plot/timeline')
    const lda = ldaTimeline([[0.8, 0.2], [0.4, 0.6], [0.5, 0.5]], ['2024-02', '2024-02', undefined])!
    expect(lda.figure.dates.map((d) => d.label)).toEqual(['02/2024'])
    expect(lda.figure.series[0].values[0]).toBeCloseTo(0.6)
    const s = sentimentTimeline([{ Positivo: 3, Negativa: 1, Neutro: 0 }, { Positivo: 0, Negativa: 2, Neutro: 2 }], ['2024', '2023'])!
    expect(s.figure.dates.map((d) => d.label)).toEqual(['2023', '2024'])
    expect(s.figure.series[0].values).toEqual([0, 75])
    expect(sentimentTimeline([{ Positivo: 1, Negativa: 0, Neutro: 0 }], [undefined])).toBeNull()
    expect(dateLabel('2024-03-15')).toBe('15/03/2024')
  })
})

describe('the other tests read labiia_lex text', () => {
  it('flags the words labiia_lex keeps and where its texts start', () => {
    const c = prepareCorpus([{ id: 'a', name: 'A', text: 'A escola pública.\n**** cabeçalho\nO hospital.' }], pt, { language: 'pt', uceSize: 40, segmentCount: 'content' })
    const words = Array.from(c.tokens, (f) => c.forms[f])
    expect(words).toEqual(['a', 'escola', 'pública', 'o', 'hospital'])
    // "a" and "o" are Snowball stopwords: deleted from labiia_lex's text before any test.
    expect(Array.from(c.tokenKept)).toEqual([0, 1, 1, 0, 1])
    expect(Array.from(c.uceNewText)).toEqual([1, 1])
  })

  it('breaks ties among word frequencies by first appearance', async () => {
    const { wordFrequencies } = await import('../../src/main/lexical/corpus/prepare')
    const c = prepareCorpus([{ id: 'a', name: 'A', text: 'zebra escola zebra escola' }], pt, { language: 'pt', uceSize: 40, segmentCount: 'content' })
    expect(wordFrequencies(c, { useLemmas: false, activeOnly: true }).map(([w]) => w)).toEqual(['zebra', 'escola'])
  })

  it('leaves English-only words out of Portuguese vocabularies', () => {
    expect(pt.isEnglishOnly('run')).toBe(true)
    expect(pt.isEnglishOnly('escola')).toBe(false)
    // Known in Portuguese: kept even if English has it too.
    expect(pt.isEnglishOnly('mar')).toBe(false)
  })

  it('cuts a capped vocabulary as IRaMuTeQ: a tie at the limit drops the whole tied group', async () => {
    const { activeVocabulary } = await import('../../src/main/lexical/analyses/lda')
    // escola 4, hospital 3, médico 2, saúde 2: limit 3 falls on the tie at 2, so the
    // tied group goes, and with it the next frequency up (3), as labiia_lex cuts.
    const text = 'escola escola escola escola hospital hospital hospital médico médico saúde saúde'
    const c = prepareCorpus([{ id: 'a', name: 'A', text }], pt, { language: 'pt', uceSize: 40, segmentCount: 'content' })
    expect(activeVocabulary(c, pt, { minFreq: 1, maxFeatures: 3, useLemmas: false, floor: 1 })).toEqual(['escola'])
    // No tie at the limit: limit - 1 words.
    expect(activeVocabulary(c, pt, { minFreq: 1, maxFeatures: 2, useLemmas: false, floor: 1 })).toEqual(['escola'])
  })

  it('does not join n-grams across a heading line', async () => {
    const { contentTokensByUnit } = await import('../../src/main/lexical/analyses/ngrams')
    const c = prepareCorpus([{ id: 'a', name: 'A', text: 'escola pública\n**** fala\nhospital central' }], pt, { language: 'pt', uceSize: 40, segmentCount: 'content' })
    expect(contentTokensByUnit(c, pt)).toEqual([['escola', 'pública'], ['hospital', 'central']])
  })
})
