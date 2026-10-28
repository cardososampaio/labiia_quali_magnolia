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
