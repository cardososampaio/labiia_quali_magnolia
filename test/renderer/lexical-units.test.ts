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
      variables: ['*caracteristica_gestor', '*datadaentrevista_15032024', '*genero_feminino', '*pasta_rodada1'],
      date: '2024-03-15'
    })
  })
})

// The "Codes" source makes one text per chosen code, so the analyses that
// compare texts (LDA, Thematic map, CHD variables) compare codes.
describe('codes as texts (Codes source)', () => {
  const data = {
    sources: [
      { guid: 'd1', name: 'Entrevista A.txt', sourceType: 'text' },
      { guid: 'd2', name: 'Entrevista B.txt', sourceType: 'text' },
      { guid: 'img', name: 'Foto.png', sourceType: 'image' },
      { guid: 's1', name: 'Questionário.csv', sourceType: 'survey' }
    ],
    codes: [
      { guid: 'c1', name: 'Participação', isCodable: true },
      { guid: 'c2', name: 'Conselhos', isCodable: true, parentGuid: 'c1' },
      { guid: 'c3', name: 'Saúde', isCodable: true },
      { guid: 'c4', name: 'Só imagem', isCodable: true }
    ],
    sourceContents: {
      d1: 'Início. A participação cresce nos conselhos. Fim do texto. Outro trecho aqui.',
      d2: 'O posto de saúde fechou cedo.'
    },
    sourceSelections: {
      d1: [
        { guid: 'p2', startPosition: 59, endPosition: 77, codings: [{ guid: 'k2', codeGuid: 'c3' }] },
        { guid: 'p1', startPosition: 8, endPosition: 44, codings: [{ guid: 'k1', codeGuid: 'c2' }] },
        // The same span coded again by the parent: one passage in the parent's text.
        { guid: 'p1b', startPosition: 8, endPosition: 44, codings: [{ guid: 'k1b', codeGuid: 'c1' }] }
      ],
      // A passage coded with two chosen codes.
      d2: [{ guid: 'p5', startPosition: 0, endPosition: 29, codings: [{ guid: 'k5', codeGuid: 'c3' }, { guid: 'k6', codeGuid: 'c1' }] }],
      img: [{ guid: 'p3', startPosition: 0, endPosition: 0, codings: [{ guid: 'k3', codeGuid: 'c4' }] }],
      s1: [{ guid: 'p4', startPosition: 0, endPosition: 9, surveyCell: { respondentId: 'r1', questionId: 'q1' }, codings: [{ guid: 'k4', codeGuid: 'c2' }] }]
    },
    surveyCodableCells: { s1: [{ respondentId: 'r1', questionId: 'q1', text: 'Conselhos fortes.' }] },
    categories: [], tags: [], tagMembers: {}, folders: []
  } as unknown as AnalysisInitData
  const all = ['d1', 'd2', 'img', 's1']

  it('makes one text per chosen code, with its passages in document order and its code variable', async () => {
    const { codeUnits } = await import('../../src/renderer/components/Lexical/lexical-units')
    const r = codeUnits(data, all, ['c1', 'c3'], true)
    expect(r.units.map((u) => u.name)).toEqual(['Participação', 'Saúde'])
    expect(r.units[0]).toMatchObject({
      id: 'code:c1',
      kind: 'code',
      parts: ['A participação cresce nos conselhos.', 'O posto de saúde fechou cedo.', 'Conselhos'],
      variables: ['*codigo_participacao']
    })
    expect(r.units[0].text).toBe(r.units[0].parts!.join('\n'))
    expect(r.units[0].document).toBeUndefined()
    expect(r.units[0].date).toBeUndefined()
  })

  it('puts a passage coded with two chosen codes into both texts', async () => {
    const { codeUnits } = await import('../../src/renderer/components/Lexical/lexical-units')
    const r = codeUnits(data, all, ['c1', 'c3'], true)
    // Saúde's text holds the shared passage too, after its own passage of the earlier document.
    expect(r.units[1].parts).toEqual(['Outro trecho aqui.', 'O posto de saúde fechou cedo.'])
    expect(r.units[0].parts).toContain('O posto de saúde fechou cedo.')
    expect(r.passageCounts).toEqual({ c1: 3, c3: 2 })
  })

  it('counts a span once within a code even when the parent and its child both code it', async () => {
    const { codeUnits } = await import('../../src/renderer/components/Lexical/lexical-units')
    const parts = codeUnits(data, ['d1'], ['c1'], true).units[0].parts!
    expect(parts.filter((p) => p === 'A participação cresce nos conselhos.')).toHaveLength(1)
  })

  it('leaves subcodes out when asked', async () => {
    const { codeUnits } = await import('../../src/renderer/components/Lexical/lexical-units')
    // Without Conselhos, Participação keeps only its own passages.
    expect(codeUnits(data, all, ['c1'], false).units[0].parts).toEqual(['A participação cresce nos conselhos.', 'O posto de saúde fechou cedo.'])
    // A parent and its child chosen together: each is its own text.
    expect(codeUnits(data, all, ['c1', 'c2'], true).units.map((u) => u.name)).toEqual(['Participação', 'Conselhos'])
  })

  it('leaves out codes with no passage holding text, naming them', async () => {
    const { codeUnits } = await import('../../src/renderer/components/Lexical/lexical-units')
    const r = codeUnits(data, all, ['c4', 'c3'], true)
    expect(r.units.map((u) => u.name)).toEqual(['Saúde'])
    expect(r.codesWithoutText).toEqual(['Só imagem'])
    expect(r.passagesWithoutText).toBe(1)
  })

  it('takes only the passages of the chosen documents', async () => {
    const { codeUnits } = await import('../../src/renderer/components/Lexical/lexical-units')
    const r = codeUnits(data, ['d2'], ['c1', 'c3'], true)
    expect(r.units.map((u) => u.parts)).toEqual([['O posto de saúde fechou cedo.'], ['O posto de saúde fechou cedo.']])
  })
})
