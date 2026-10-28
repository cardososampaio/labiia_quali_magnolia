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

describe('coded passages as texts (Codes source)', () => {
  const data = {
    sources: [
      { guid: 'd1', name: 'Entrevista A.txt', sourceType: 'text' },
      { guid: 'img', name: 'Foto.png', sourceType: 'image' },
      { guid: 's1', name: 'Questionário.csv', sourceType: 'survey' }
    ],
    codes: [
      { guid: 'c1', name: 'Participação', isCodable: true },
      { guid: 'c2', name: 'Conselhos', isCodable: true, parentGuid: 'c1' },
      { guid: 'c3', name: 'Outro', isCodable: true }
    ],
    sourceContents: { d1: 'Início. A participação cresce nos conselhos. Fim do texto. Outro trecho aqui.' },
    sourceSelections: {
      d1: [
        { guid: 'p2', startPosition: 59, endPosition: 77, codings: [{ guid: 'k2', codeGuid: 'c3' }] },
        { guid: 'p1', startPosition: 8, endPosition: 44, codings: [{ guid: 'k1', codeGuid: 'c2' }] }
      ],
      img: [{ guid: 'p3', startPosition: 0, endPosition: 0, codings: [{ guid: 'k3', codeGuid: 'c1' }] }],
      s1: [{ guid: 'p4', startPosition: 0, endPosition: 9, surveyCell: { respondentId: 'r1', questionId: 'q1' }, codings: [{ guid: 'k4', codeGuid: 'c1' }] }]
    },
    surveyCodableCells: { s1: [{ respondentId: 'r1', questionId: 'q1', text: 'Conselhos fortes.' }] },
    categories: [], tags: [], tagMembers: {}, folders: []
  } as unknown as AnalysisInitData

  it('takes each passage coded with a chosen code (and its subcodes), with its text and code variable', async () => {
    const { codeUnits } = await import('../../src/renderer/components/Lexical/lexical-units')
    const r = codeUnits(data, ['d1', 'img', 's1'], ['c1'], true)
    expect(r.units.map((u) => u.text)).toEqual(['A participação cresce nos conselhos.', 'Conselhos'])
    expect(r.units[0]).toMatchObject({ document: 'Entrevista A.txt', name: 'Entrevista A.txt · Conselhos', variables: ['*codigo_conselhos'] })
    // The image passage has no text.
    expect(r.passagesWithoutText).toBe(1)
  })

  it('leaves subcodes out when asked', async () => {
    const { codeUnits } = await import('../../src/renderer/components/Lexical/lexical-units')
    expect(codeUnits(data, ['d1'], ['c1'], false).units).toHaveLength(0)
    expect(codeUnits(data, ['d1'], ['c3', 'c2'], false).units.map((u) => u.text)).toEqual(['A participação cresce nos conselhos.', 'Outro trecho aqui.'])
  })
})

describe('coded passages sharing a span', () => {
  it('become one text with the variables of all their codes', async () => {
    const { codeUnits } = await import('../../src/renderer/components/Lexical/lexical-units')
    const data = {
      sources: [{ guid: 'd1', name: 'A.txt', sourceType: 'text' }],
      codes: [{ guid: 'c1', name: 'Um', isCodable: true }, { guid: 'c2', name: 'Dois', isCodable: true }],
      sourceContents: { d1: 'Um trecho codificado duas vezes.' },
      sourceSelections: { d1: [
        { guid: 'p1', startPosition: 0, endPosition: 32, codings: [{ guid: 'k1', codeGuid: 'c1' }] },
        { guid: 'p2', startPosition: 0, endPosition: 32, codings: [{ guid: 'k2', codeGuid: 'c2' }] }
      ] },
      categories: [], tags: [], tagMembers: {}, folders: []
    } as unknown as AnalysisInitData
    const r = codeUnits(data, ['d1'], ['c1', 'c2'], false)
    expect(r.units).toHaveLength(1)
    expect(r.units[0].variables).toEqual(['*codigo_dois', '*codigo_um'])
  })
})
