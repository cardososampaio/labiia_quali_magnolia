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
