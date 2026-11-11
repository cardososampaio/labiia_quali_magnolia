import { describe, it, expect, beforeEach } from 'vitest'
import { useDocumentStore } from '../../src/renderer/stores/document-store'
import { useRecentCodesStore, withRecentCode } from '../../src/renderer/stores/recent-codes-store'
import { applyCodeToSelection, inVivoCodeName, selectionPositionLabel, foldForSearch, IN_VIVO_MAX } from '../../src/renderer/utils/apply-coding'

// The quick-coding bar must code a selection the way dropping a code on it
// does: one coded segment per passage, several codes stacked on it, never
// the same code twice, and video lines coded as a time range.

let src = ''
const selections = () => useDocumentStore.getState().sources.find((s) => s.guid === src)!.selections

beforeEach(() => {
  useDocumentStore.setState({ sources: [], sourceContents: {} })
  useRecentCodesStore.getState().clear()
  src = useDocumentStore.getState().addSource('entrevista.txt', 'Eu não sabia o que era pesquisa qualitativa.', 'text')
})

describe('applyCodeToSelection', () => {
  const text = () => ({ kind: 'text' as const, sourceGuid: src, startCp: 3, endCp: 15, selectedText: 'não sabia o' })

  it('creates one coded segment and stacks further codes on it', () => {
    applyCodeToSelection(text(), 'CODE-A')
    applyCodeToSelection(text(), 'CODE-B')
    expect(selections()).toHaveLength(1)
    expect(selections()[0].codings.map((c) => c.codeGuid)).toEqual(['CODE-A', 'CODE-B'])
  })

  it('does not apply the same code twice to the same passage', () => {
    applyCodeToSelection(text(), 'CODE-A')
    applyCodeToSelection(text(), 'CODE-A')
    expect(selections()[0].codings).toHaveLength(1)
  })

  it('codes video transcript lines as a time range', () => {
    applyCodeToSelection({ ...text(), timeRange: { startTime: 62, endTime: 70, startLine: 1, endLine: 2 } }, 'CODE-A')
    expect(selections()[0].timeRange).toEqual({ startTime: 62, endTime: 70 })
  })

  it('codes each selected survey answer separately', () => {
    applyCodeToSelection({
      kind: 'survey-cell',
      sourceGuid: src,
      cells: [
        { respondentId: 'R1', questionId: 'Q1', start: 0, end: 4, selectedText: 'sim' },
        { respondentId: 'R2', questionId: 'Q1', start: 0, end: 3, selectedText: 'não' }
      ]
    }, 'CODE-A')
    expect(selections().map((s) => s.surveyCell?.respondentId)).toEqual(['R1', 'R2'])
  })

  it('records the code as recently used', () => {
    applyCodeToSelection(text(), 'CODE-A')
    applyCodeToSelection(text(), 'CODE-B')
    expect(useRecentCodesStore.getState().codeGuids).toEqual(['CODE-B', 'CODE-A'])
  })
})

describe('recent codes', () => {
  it('moves a reused code to the front without duplicates and caps the list', () => {
    expect(withRecentCode(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
    expect(withRecentCode(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b'])
  })
})

describe('inVivoCodeName', () => {
  it('uses the selected words, without line breaks or surrounding quotes', () => {
    expect(inVivoCodeName('  “a escola\n  é longe”. ')).toBe('a escola é longe')
  })

  it('shortens long selections at a word boundary', () => {
    const long = 'eu sempre quis estudar mas a escola ficava muito longe da minha casa e eu tinha que trabalhar'
    const name = inVivoCodeName(long)
    expect(name.length).toBeLessThanOrEqual(IN_VIVO_MAX)
    expect(name.endsWith('…')).toBe(true)
    expect(long.startsWith(name.slice(0, -1))).toBe(true)
  })
})

describe('selection position and search', () => {
  it('shows character positions for text and times for video', () => {
    expect(selectionPositionLabel({ kind: 'text', sourceGuid: src, startCp: 604, endCp: 924, selectedText: 'x' })).toBe('604–924')
    expect(selectionPositionLabel({ kind: 'text', sourceGuid: src, startCp: 0, endCp: 1, selectedText: 'x', timeRange: { startTime: 62, endTime: 3725, startLine: 0, endLine: 3 } })).toBe('01:02–1:02:05')
  })

  it('finds codes ignoring accents and case', () => {
    expect(foldForSearch('Educação')).toBe(foldForSearch('EDUCACAO'))
  })
})
