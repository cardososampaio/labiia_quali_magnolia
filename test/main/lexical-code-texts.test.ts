import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Lexicon } from '../../src/main/lexical/corpus/lexicon'
import { prepareCorpus } from '../../src/main/lexical/corpus/prepare'
import { corpusKey } from '../../src/main/lexical/corpus/cache'
import { contentTokensByUnit } from '../../src/main/lexical/analyses/ngrams'
import { writeChdProfileTables } from '../../src/main/lexical/analyses/chd'

// A code's text gathers passages from different documents. Each passage is cut
// on its own, so no segment and no n-gram joins the end of one passage to the
// start of the next, and the CHD names the text by its code, not as a document.
const RES = join(__dirname, '..', '..', 'resources', 'lexical')
const pt = new Lexicon('pt', RES)
const opts = { language: 'pt' as const, uceSize: 40, segmentCount: 'content' as const }

describe('a code text made of passages', () => {
  const parts = ['A escola pública precisa de professores.', 'Hospital central atende mal.']
  const unit = { id: 'code:c1', name: 'Educação', kind: 'code' as const, text: parts.join('\n'), parts, variables: ['*codigo_educacao'] }

  it('starts a new text at each passage, so segments never span two passages', () => {
    const c = prepareCorpus([unit], pt, opts)
    expect(Array.from(c.uceUnit)).toEqual([0, 0])
    expect(Array.from(c.uceNewText)).toEqual([1, 1])
    expect(c.units[0]).toMatchObject({ name: 'Educação', kind: 'code' })
  })

  it('does not join n-grams across passages', () => {
    const c = prepareCorpus([unit], pt, opts)
    const runs = contentTokensByUnit(c, pt)
    expect(runs).toHaveLength(2)
    expect(runs[0]).not.toContain('hospital')
    expect(runs[1][0]).toBe('hospital')
  })

  it('gets a new cache key when the passages split differently', () => {
    const same = { ...unit, parts: ['A escola pública precisa de professores.\nHospital central atende mal.'] }
    expect(corpusKey([unit], opts)).not.toBe(corpusKey([same], opts))
  })

  it('profiles CHD classes by code, without a document variable for the code text', () => {
    const text = 'A escola pública precisa de professores. O hospital precisa de médicos. '.repeat(6)
    const c = prepareCorpus([
      { id: 'code:a', name: 'Educação', kind: 'code', text, parts: [text], variables: ['*codigo_educacao'] },
      { id: 'code:b', name: 'Saúde', kind: 'code', text, parts: [text], variables: ['*codigo_saude'] }
    ], pt, opts)
    const dir = mkdtempSync(join(tmpdir(), 'chdcode-'))
    writeChdProfileTables(c, pt, { minFreq: 3, maxActives: 20000, useLemmas: true, rows: 'segments' }, dir, c.uceText.map(() => 1))
    const et = readFileSync(join(dir, 'ContEtOut.csv'), 'utf-8')
    expect(et).toMatch(/^\*codigo_educacao;/m)
    expect(et).toMatch(/^\*codigo_saude;/m)
    expect(et).not.toMatch(/^\*doc_/m)
  })
})
