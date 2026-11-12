import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { Lexicon } from '../../src/helper/lexical/corpus/lexicon'
import { expressionJoiner, prepareCorpus, type PrepareOptions } from '../../src/helper/lexical/corpus/prepare'
import { corpusKey } from '../../src/helper/lexical/corpus/cache'

// "Preparar corpus" is optional: without it, the corpus (and its cache key)
// must be exactly what it was, so results keep matching labiia_lex. With it,
// the chosen phrases become one word and the chosen words are counted as
// another, in every test, since every test reads the prepared corpus.

const RES = join(__dirname, '..', '..', 'resources', 'lexical')
const pt = new Lexicon('pt', RES)
const units = [
  { id: 'a', name: 'A', text: 'A Política Pública de saúde atende docentes e slams. O docente fala de política-pública.' },
  { id: 'b', name: 'B', text: 'Os slams e o slam da escola. Política pública para docentes.' }
]
const base: PrepareOptions = { language: 'pt', uceSize: 40, segmentCount: 'content' }
const table = {
  expressions: [['política pública', 'política_pública']] as [string, string][],
  forms: { docente: 'professor', docentes: 'professor', slams: 'slam' }
}

describe('corpus preparation', () => {
  it('leaves the corpus and its cache key as before when there is no preparation or an empty one', () => {
    const empty = { ...base, preparation: { expressions: [], forms: {} } }
    expect(prepareCorpus(units, pt, empty)).toEqual(prepareCorpus(units, pt, base))
    expect(corpusKey(units, empty)).toBe(corpusKey(units, base))
  })

  it('joins phrases and replaces words in the segments every test reads', () => {
    const c = prepareCorpus(units, pt, { ...base, preparation: table })
    const freq = new Map(c.forms.map((f, i) => [f, c.formFreq[i]]))
    // Any case, and a hyphen in place of the space.
    expect(freq.get('política_pública')).toBe(3)
    expect(freq.get('professor')).toBe(3)
    expect(freq.get('slam')).toBe(3)
    expect(freq.has('docentes')).toBe(false)
    expect(freq.has('pública')).toBe(false)
    expect(c.uceText.join(' ')).toContain('política_pública de saúde atende professor')
  })

  it('gives a prepared corpus its own cache key', () => {
    expect(corpusKey(units, { ...base, preparation: table })).not.toBe(corpusKey(units, base))
  })

  it('matches phrases as whole words only', () => {
    const join = expressionJoiner([['saúde mental', 'saúde_mental']])
    expect(join('Saúde  Mental e saúde-mental')).toBe('saúde_mental e saúde_mental')
    expect(join('desaúde mentalidade')).toBe('desaúde mentalidade')
  })
})
