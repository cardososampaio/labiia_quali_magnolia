import { describe, it, expect } from 'vitest'
import { documentVariables, parseTagDate, variablePart } from '../../src/renderer/components/Lexical/lexical-units'
import type { AnalysisInitData } from '../../src/renderer/models/types'

// Tags and folders become IRaMuTeQ variables (*variable_value) and a date tag
// gives the document its date, so the CHD can profile classes by variable and
// Sentiment and LDA can draw timelines.
describe('document variables', () => {
  it('reads dates as people type them in date tags', () => {
    expect(parseTagDate('15/03/2024')).toBe('2024-03-15')
    expect(parseTagDate('5/3/2024')).toBe('2024-03-05')
    expect(parseTagDate('2024-03-15')).toBe('2024-03-15')
    expect(parseTagDate('03/2024')).toBe('2024-03')
    expect(parseTagDate('2024')).toBe('2024')
    expect(parseTagDate('31/02/2024')).toBeUndefined()
    expect(parseTagDate('março')).toBeUndefined()
  })

  it('turns tags and the folder into variables and takes the date tag', () => {
    expect(variablePart('Região Sul')).toBe('regiaosul')
    const data = {
      categories: [{ guid: 'c1', name: 'Gênero', type: 'list' }, { guid: 'c2', name: 'Data da entrevista', type: 'date' }],
      tags: [
        { guid: 't1', name: 'Feminino', categoryGuid: 'c1', value: 'Feminino' },
        { guid: 't2', name: '15/03/2024', categoryGuid: 'c2', value: '15/03/2024' },
        { guid: 't3', name: 'Gestor' },
        { guid: 't4', name: 'Outro', categoryGuid: 'c1', value: 'Masculino' }
      ],
      tagMembers: { t1: ['doc'], t2: ['doc'], t3: ['doc'], t4: ['other'] },
      folders: [{ guid: 'f1', name: 'Rodada 1', parentGuid: null }],
      sourceFolder: { doc: 'f1' }
    } as unknown as AnalysisInitData
    expect(documentVariables(data, 'doc')).toEqual({
      variables: ['*datadaentrevista_15032024', '*etiqueta_gestor', '*genero_feminino', '*pasta_rodada1'],
      date: '2024-03-15'
    })
  })
})
