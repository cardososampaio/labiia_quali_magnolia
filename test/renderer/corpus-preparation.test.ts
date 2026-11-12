import { describe, it, expect } from 'vitest'
import {
  emptyPreparation,
  normalizePreparation,
  preparationActive,
  rememberOpenedPreparation,
  withPreparation
} from '../../src/renderer/labiia/corpus-prep-state'
import { parseEquivalences } from '../../src/renderer/components/Lexical/CorpusPreparationDialog'

// "Preparar corpus" belongs to the project: it is saved with the project it
// came from and never with another one, and it changes nothing until turned on.

const project = { creatingUserGUID: 'u1', creationDateTime: '2026-01-01T00:00:00Z', name: 'P' }

describe('corpus preparation choices', () => {
  it('changes nothing until the project switch and one part are on', () => {
    const p = emptyPreparation()
    expect(preparationActive(p)).toBe(false)
    p.plurals.enabled = true
    expect(preparationActive(p)).toBe(false)
    p.enabled = true
    expect(preparationActive(p)).toBe(true)
    // An equivalence list that is on but empty does not count.
    expect(preparationActive({ ...emptyPreparation(), enabled: true, equivalences: { enabled: true, pairs: [] } })).toBe(false)
  })

  it('reads choices saved by any version, filling what is missing', () => {
    expect(normalizePreparation(undefined)).toEqual(emptyPreparation())
    const p = normalizePreparation({ enabled: true, equivalences: { enabled: true, pairs: [{ from: 'docente', to: 'professor' }, { from: 1 }] } })
    expect(p.equivalences.pairs).toEqual([{ from: 'docente', to: 'professor' }])
    expect(p.variants).toEqual({ enabled: false, groups: [] })
  })

  it('saves the choices only with the project they came from', () => {
    const prep = { ...emptyPreparation(), enabled: true, plurals: { enabled: true, excluded: ['ufms'] } }
    rememberOpenedPreparation({ ...project, labiiaCorpusPreparation: prep })
    expect(withPreparation({ project }).project.labiiaCorpusPreparation).toEqual(prep)
    // Another project (or a new one) is saved without them.
    const other = { creatingUserGUID: 'u2', creationDateTime: '2026-02-02T00:00:00Z' }
    expect(withPreparation({ project: other }).project).not.toHaveProperty('labiiaCorpusPreparation')
  })

  it('imports equivalence lists written in the usual ways', () => {
    expect(parseEquivalences('docente;professor\n# comentário\nSUS = sistema único de saúde\naluno\testudante\nfoo -> bar\n\nsozinho')).toEqual([
      { from: 'docente', to: 'professor' },
      { from: 'SUS', to: 'sistema único de saúde' },
      { from: 'aluno', to: 'estudante' },
      { from: 'foo', to: 'bar' }
    ])
  })
})
