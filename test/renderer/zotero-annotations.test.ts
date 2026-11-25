import { describe, it, expect, beforeEach } from 'vitest'
import { applyAnnotations, listAnnotations, locateAnnotation, type ZoteroAnnotation } from '../../src/renderer/labiia/zotero-annotations'
import { installCodeHistory } from '../../src/renderer/labiia/code-history-store'
import { rememberOpenedHistory, useHistoryState } from '../../src/renderer/labiia/code-history-model'
import { useCodeStore } from '../../src/renderer/stores/code-store'
import { useDocumentStore } from '../../src/renderer/stores/document-store'
import { useMemoStore } from '../../src/renderer/stores/memo-store'
import { useQuoteStore } from '../../src/renderer/stores/quote-store'
import { useProjectStore } from '../../src/renderer/stores/project-store'

// Highlights made in Zotero come in as quotes of the passage; a highlight's
// comment becomes a code applied to it; the passage is found in the text the
// program extracted from the PDF, whatever the line breaks and hyphens, and
// never marked in the wrong place.

const slice = (s: string, p: { start: number; end: number } | null) => (p ? Array.from(s).slice(p.start, p.end).join('') : null)

describe('finding a highlighted passage in the PDF text', () => {
  const page1 = 'Introdução ao método.\n'
  const page2 = 'A metodo-\nlogia qualitativa exige “rigor” e reﬂexão.\n'
  const content = page1 + page2
  const offsets = [0, Array.from(page1).length]

  it('finds it across line breaks, end-of-line hyphens, ligatures and curly quotes', () => {
    const p = locateAnnotation(content, offsets, 1, 'metodologia qualitativa exige "rigor" e reflexão')
    expect(slice(content, p)).toBe('metodo-\nlogia qualitativa exige “rigor” e reﬂexão')
  })

  it('gives positions in code points, as the rest of the PDF text', () => {
    const withEmoji = '😀 ' + content
    const p = locateAnnotation(withEmoji, [0, Array.from('😀 ' + page1).length], 1, 'reflexão')
    const cps = Array.from(withEmoji)
    const expected = cps.findIndex((_, i) => cps.slice(i, i + 7).join('') === 'reﬂexão')
    expect(p?.start).toBe(expected)
    expect(slice(withEmoji, p)).toBe('reﬂexão')
  })

  it('keeps the right place with wide characters (emoji) on the same page', () => {
    const text = 'Sorriso 😀 e depois o método qualitativo aparece aqui.'
    const p = locateAnnotation(text, [0], 0, 'método qualitativo')
    expect(slice(text, p)).toBe('método qualitativo')
  })

  it('finds a passage the extracted text interrupts with a footer, by its beginning and end', () => {
    const before = 'A stenographer produces a text without answering for its claims; a research assistant can produce large portions of a finished paper'
    const footer = '\n1 3\n129 Page 10 of 18 L. Floridi\n'
    const after = ' without grounding its authorship; a ghostwriter produces what another person must sign.'
    const text = 'Intro.\n' + before + footer + after + ' Next sentence.'
    const zotero = before + after
    const p = locateAnnotation(text, [0], 0, zotero)
    expect(slice(text, p)).toBe(before + footer + after)
    // A short highlight is not stretched over a gap: it has to match as it is.
    expect(locateAnnotation(text, [0], 0, 'Intro. Next sentence.')).toBeNull()
  })

  it('prefers the page Zotero gives over the same words elsewhere', () => {
    const twice = 'o método\n' + 'outra coisa e o método\n'
    const p = locateAnnotation(twice, [0, 9], 1, 'o método')
    expect(p?.start).toBeGreaterThanOrEqual(9)
  })

  it('looks in the whole text when the page has no match, and gives null when there is none', () => {
    expect(slice(content, locateAnnotation(content, offsets, 0, 'qualitativa'))).toBe('qualitativa')
    expect(locateAnnotation(content, offsets, 1, 'não existe aqui')).toBeNull()
    expect(locateAnnotation(content, offsets, 1, '   ')).toBeNull()
  })
})

describe('reading the annotations from Zotero', () => {
  it('keeps only annotations, in reading order', async () => {
    const children = [
      { key: 'N', data: { key: 'N', itemType: 'note' } },
      { key: 'B', data: { key: 'B', itemType: 'annotation', annotationType: 'highlight', annotationSortIndex: '00002' } },
      { key: 'A', data: { key: 'A', itemType: 'annotation', annotationType: 'highlight', annotationSortIndex: '00001' } }
    ]
    const get = async () => ({ status: 200, total: 3, body: JSON.stringify(children) })
    const list = await listAnnotations(get, 'users/0', 'ATT')
    expect(list.map((a) => a.key)).toEqual(['A', 'B'])
  })
})

describe('putting the annotations in the project', () => {
  installCodeHistory()
  const proj = { creatingUserGUID: 'z', creationDateTime: '2026-01-01T00:00:00Z', filePath: null }
  const content = 'O método qualitativo exige rigor. A amostra foi pequena.'
  const labels = { parentCode: 'Comentários do Zotero', noteTitle: (p: string) => `Nota (p. ${p})` }
  const ann = (a: Partial<ZoteroAnnotation>): ZoteroAnnotation => ({ key: Math.random().toString(), annotationType: 'highlight', annotationPosition: '{"pageIndex":0}', ...a })
  let guid = ''

  beforeEach(() => {
    useProjectStore.setState(proj as never)
    useCodeStore.getState().setCodes([])
    useQuoteStore.setState({ quotes: [] } as never)
    useMemoStore.setState({ memos: [] } as never)
    useDocumentStore.setState({ sources: [], sourceContents: {} } as never)
    guid = useDocumentStore.getState().addSource('Artigo', content)
    rememberOpenedHistory({ ...proj })
  })

  it('makes a quote of each highlight and a code of each comment, once per comment', () => {
    const s = applyAnnotations(guid, 'Artigo', [
      ann({ annotationText: 'método qualitativo', annotationComment: 'método' }),
      ann({ annotationText: 'amostra foi pequena', annotationComment: '  Método ' }),
      ann({ annotationText: 'exige rigor' })
    ], content, [0], labels)
    expect(s).toEqual({ found: 3, notFound: 0 })
    expect(useQuoteStore.getState().quotes.map((q) => q.text)).toEqual(['método qualitativo', 'amostra foi pequena', 'exige rigor'])
    const codes = useCodeStore.getState().codes
    expect(codes.map((c) => c.name)).toEqual(['Comentários do Zotero'])
    expect(codes[0].children.map((c) => c.name)).toEqual(['método'])
    // Two passages coded with the comment's code; the highlight without a comment has none.
    const sels = useDocumentStore.getState().sources[0].selections
    expect(sels).toHaveLength(2)
    expect(sels.every((sel) => sel.codings[0].codeGuid === codes[0].children[0].guid)).toBe(true)
  })

  it('counts a highlight it cannot find and marks nothing for it', () => {
    const s = applyAnnotations(guid, 'Artigo', [ann({ annotationText: 'frase de outro livro', annotationComment: 'x' })], content, [0], labels)
    expect(s).toEqual({ found: 0, notFound: 1 })
    expect(useQuoteStore.getState().quotes).toHaveLength(0)
    expect(useDocumentStore.getState().sources[0].selections).toHaveLength(0)
  })

  it('turns a sticky note into a memo on the document', () => {
    applyAnnotations(guid, 'Artigo', [ann({ annotationType: 'note', annotationComment: 'Ver capítulo 3', annotationPageLabel: '12' })], content, [0], labels)
    const memos = useMemoStore.getState().memos
    expect(memos.map((m) => [m.title, m.content])).toEqual([['Nota (p. 12)', 'Ver capítulo 3']])
  })

  it('records the comment codes as imported in the history of the codes', () => {
    applyAnnotations(guid, 'Artigo', [ann({ annotationText: 'exige rigor', annotationComment: 'rigor' })], content, [0], labels)
    const actions = useHistoryState.getState().history.entries.map((e) => e.action)
    expect(actions.filter((a) => a === 'imported')).toHaveLength(2)
    expect(actions).not.toContain('created')
  })
})
