import { describe, expect, it } from 'vitest'
import type { AnalysisInitData, PlainTextSelection } from '../../src/renderer/models/types'
import {
  buildClusteringInput,
  findSelectedHierarchyOverlaps,
  paragraphSpans,
  selectionsSpatiallyOverlap
} from '../../src/renderer/labiia/coding-units/units'

function makeSelection(
  guid: string,
  codeGuids: string[],
  extra: Partial<PlainTextSelection> = {}
): PlainTextSelection {
  return {
    guid,
    startPosition: 0,
    endPosition: 0,
    codings: codeGuids.map((codeGuid, idx) => ({ guid: `${guid}-c${idx}`, codeGuid })),
    ...extra
  }
}

function baseData(overrides: Partial<AnalysisInitData> = {}): AnalysisInitData {
  return {
    toolType: 'coding-clusters',
    theme: 'light',
    sources: [],
    folders: [],
    codes: [
      { guid: 'inst', name: 'Instituições', isCodable: true },
      { guid: 'stf', name: 'STF', isCodable: true, parentGuid: 'inst' },
      { guid: 'tse', name: 'TSE', isCodable: true, parentGuid: 'inst' },
      { guid: 'econ', name: 'Economia', isCodable: true }
    ],
    tags: [],
    categories: [],
    sourceContents: {},
    sourceSelections: {},
    tagMembers: {},
    ...overrides
  }
}

describe('paragraphSpans', () => {
  it('returns trimmed codepoint spans for non-empty lines including astral Unicode', () => {
    const text = '  Olá 😀 mundo  \n\n  Segunda linha\n'
    const spans = paragraphSpans(text)
    const cps = [...text]
    expect(spans.map((s) => cps.slice(s.start, s.end).join(''))).toEqual([
      'Olá 😀 mundo',
      'Segunda linha'
    ])
  })
})

describe('findSelectedHierarchyOverlaps', () => {
  it('detects selected ancestor-descendant pairs only when subcodes are included', () => {
    const data = baseData()
    expect(findSelectedHierarchyOverlaps(data.codes, ['inst', 'stf', 'econ'], false)).toEqual([])
    expect(findSelectedHierarchyOverlaps(data.codes, ['inst', 'stf', 'econ'], true)).toEqual([
      { ancestorGuid: 'inst', descendantGuid: 'stf' }
    ])
  })
})

describe('selectionsSpatiallyOverlap', () => {
  it('isolates different survey cells even when cell-relative offsets match', () => {
    const a = makeSelection('s1', ['stf'], {
      startPosition: 0,
      endPosition: 10,
      surveyCell: { respondentId: 'r1', questionId: 'q1' }
    })
    const b = makeSelection('s2', ['econ'], {
      startPosition: 0,
      endPosition: 10,
      surveyCell: { respondentId: 'r2', questionId: 'q1' }
    })
    const c = makeSelection('s3', ['econ'], {
      startPosition: 5,
      endPosition: 12,
      surveyCell: { respondentId: 'r1', questionId: 'q1' }
    })
    expect(selectionsSpatiallyOverlap(a, b)).toBe(false)
    expect(selectionsSpatiallyOverlap(a, c)).toBe(true)
  })

  it('compares PDF/image boxes on the same page and audio/video time ranges', () => {
    const box1 = makeSelection('b1', ['stf'], {
      pdfRegion: { page: 1, x: 10, y: 10, width: 50, height: 50 }
    })
    const box2 = makeSelection('b2', ['econ'], {
      pdfRegion: { page: 1, x: 40, y: 40, width: 30, height: 30 }
    })
    const boxPage2 = makeSelection('b3', ['econ'], {
      pdfRegion: { page: 2, x: 10, y: 10, width: 50, height: 50 }
    })
    expect(selectionsSpatiallyOverlap(box1, box2)).toBe(true)
    expect(selectionsSpatiallyOverlap(box1, boxPage2)).toBe(false)

    const clip1 = makeSelection('t1', ['stf'], { timeRange: { startTime: 5, endTime: 15 } })
    const clip2 = makeSelection('t2', ['econ'], { timeRange: { startTime: 12, endTime: 20 } })
    const clip3 = makeSelection('t3', ['econ'], { timeRange: { startTime: 15, endTime: 25 } })
    expect(selectionsSpatiallyOverlap(clip1, clip2)).toBe(true)
    expect(selectionsSpatiallyOverlap(clip1, clip3)).toBe(false)
  })
})

describe('buildClusteringInput', () => {
  it('rolls subcodes into parent without double-counting a selection carrying two subcodes', () => {
    const data = baseData({
      sources: [{ guid: 'doc1', name: 'Entrevista 1', sourceType: 'text' }],
      sourceContents: { doc1: 'Parágrafo um.\nParágrafo dois.' },
      sourceSelections: {
        doc1: [
          makeSelection('sel1', ['stf', 'tse'], { startPosition: 0, endPosition: 13 }),
          makeSelection('sel2', ['econ'], { startPosition: 14, endPosition: 29 })
        ]
      }
    })
    const withSub = buildClusteringInput(data, {
      sourceGuids: ['doc1'],
      selectedCodeGuids: ['inst', 'econ'],
      target: 'documents',
      unit: 'document',
      includeSubcodes: true,
      expandSurveyRespondents: false,
      measure: 'cosine',
      linkage: 'average',
      minReferences: 1
    })
    expect(withSub.request.units).toEqual([
      { id: 'doc1', selections: [['inst'], ['econ']] }
    ])

    const withoutSub = buildClusteringInput(data, {
      sourceGuids: ['doc1'],
      selectedCodeGuids: ['inst', 'econ'],
      target: 'documents',
      unit: 'document',
      includeSubcodes: false,
      expandSurveyRespondents: false,
      measure: 'cosine',
      linkage: 'average',
      minReferences: 1
    })
    expect(withoutSub.request.units).toEqual([
      { id: 'doc1', selections: [['econ']] }
    ])
  })

  it('segments codes by paragraph and sentence while counting skipped non-text selections', () => {
    const text = 'Primeira frase. Segunda frase.\nTerceira frase isolada.'
    const data = baseData({
      sources: [
        { guid: 'doc1', name: 'Texto', sourceType: 'text' },
        { guid: 'img1', name: 'Foto', sourceType: 'image' }
      ],
      sourceContents: { doc1: text },
      sourceSelections: {
        doc1: [
          makeSelection('s1', ['stf'], { startPosition: 0, endPosition: 15 }),
          makeSelection('s2', ['econ'], { startPosition: 16, endPosition: 30 }),
          makeSelection('s3', ['econ'], { startPosition: 31, endPosition: 54 })
        ],
        img1: [
          makeSelection('imgSel', ['stf'], {
            pdfRegion: { page: 1, x: 0, y: 0, width: 20, height: 20 }
          })
        ]
      }
    })

    const byParagraph = buildClusteringInput(data, {
      sourceGuids: ['doc1', 'img1'],
      selectedCodeGuids: ['stf', 'econ'],
      target: 'codes',
      unit: 'paragraph',
      includeSubcodes: false,
      expandSurveyRespondents: false,
      measure: 'jaccard',
      linkage: 'average',
      minReferences: 1
    })
    expect(byParagraph.skippedNonTextSelections).toBe(1)
    // Paragraph 0 has both stf and econ; Paragraph 1 has only econ.
    expect(byParagraph.request.units).toEqual([
      { id: 'doc1\u0000p\u00000', selections: [['stf'], ['econ']] },
      { id: 'doc1\u0000p\u00001', selections: [['econ']] }
    ])

    const bySentence = buildClusteringInput(data, {
      sourceGuids: ['doc1', 'img1'],
      selectedCodeGuids: ['stf', 'econ'],
      target: 'codes',
      unit: 'sentence',
      includeSubcodes: false,
      expandSurveyRespondents: false,
      measure: 'jaccard',
      linkage: 'average',
      minReferences: 1
    })
    expect(bySentence.skippedNonTextSelections).toBe(1)
    // Sentence 0 has stf, Sentence 1 has econ, Sentence 2 has econ: zero shared sentences!
    expect(bySentence.request.units).toEqual([
      { id: 'doc1\u0000s\u00000', selections: [['stf']] },
      { id: 'doc1\u0000s\u00001', selections: [['econ']] },
      { id: 'doc1\u0000s\u00002', selections: [['econ']] }
    ])
  })

  it('expands survey respondents as comparable units without mixing cells across respondents', () => {
    const data = baseData({
      sources: [{ guid: 'sv1', name: 'Questionário IA', sourceType: 'survey' }],
      surveyCodableCells: {
        sv1: [
          { respondentId: 'r1', questionId: 'q1', text: 'Resposta um.\nOutra linha.' },
          { respondentId: 'r2', questionId: 'q1', text: 'Resposta dois.' }
        ]
      },
      surveyEntityLabels: {
        sv1: { respondents: { r1: 'P01', r2: 'P02' }, questions: { q1: 'Pergunta 1' } }
      },
      sourceSelections: {
        sv1: [
          makeSelection('c1', ['stf'], {
            startPosition: 0,
            endPosition: 12,
            surveyCell: { respondentId: 'r1', questionId: 'q1' }
          }),
          makeSelection('c2', ['econ'], {
            startPosition: 0,
            endPosition: 14,
            surveyCell: { respondentId: 'r2', questionId: 'q1' }
          })
        ]
      }
    })

    const expanded = buildClusteringInput(data, {
      sourceGuids: ['sv1'],
      selectedCodeGuids: ['stf', 'econ'],
      target: 'documents',
      unit: 'document',
      includeSubcodes: false,
      expandSurveyRespondents: true,
      measure: 'cosine',
      linkage: 'average',
      minReferences: 1
    })
    expect(expanded.request.units).toEqual([
      { id: 'sv1\u0000resp\u0000r1', selections: [['stf']] },
      { id: 'sv1\u0000resp\u0000r2', selections: [['econ']] }
    ])
    expect(expanded.itemLabels.get('sv1\u0000resp\u0000r1')).toBe('Questionário IA · P01')
    expect(expanded.itemLabels.get('sv1\u0000resp\u0000r2')).toBe('Questionário IA · P02')
  })
})
