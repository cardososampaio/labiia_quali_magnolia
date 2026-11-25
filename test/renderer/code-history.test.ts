import { describe, it, expect, beforeEach } from 'vitest'
import type { Code } from '../../src/renderer/models/types'
import {
  diffCodeTrees,
  normalizeHistory,
  rememberOpenedHistory,
  useHistoryState,
  withHistory,
  emptyHistory
} from '../../src/renderer/labiia/code-history-model'
import { installCodeHistory, setHistoryEnabled, setJustification } from '../../src/renderer/labiia/code-history-store'
import { useCodeStore } from '../../src/renderer/stores/code-store'
import { useDocumentStore } from '../../src/renderer/stores/document-store'
import { useProjectStore } from '../../src/renderer/stores/project-store'
import { usePreferencesStore } from '../../src/renderer/stores/preferences-store'
import { useUndoStore } from '../../src/renderer/stores/undo-store'
import { applyMerge, emptyApplyPlan } from '../../src/renderer/utils/project-diff-apply'

// The history of the codes makes the coding process transparent and
// replicable: every change that alters what a code is (created, renamed,
// described, moved to another parent, merged, deleted, imported) is kept
// with who did it and when, and nothing is ever erased from it.

const code = (guid: string, name: string, children: Code[] = [], description?: string): Code =>
  ({ guid, name, isCodable: true, color: '#888', children, ...(description !== undefined ? { description } : {}) }) as Code

describe('what counts as a change to a code', () => {
  it('lists creations, renames, descriptions, moves and deletions with their paths', () => {
    const prev = [code('A', 'Saúde', [code('B', 'Acesso')]), code('C', 'Escola'), code('D', 'Velho', [code('E', 'Filho')])]
    const next = [code('A', 'Saúde pública', [code('N', 'Novo')], 'Definição'), code('C', 'Escola', [code('B', 'Acesso')])]
    const changes = diffCodeTrees(prev, next)
    const by = (action: string) => changes.filter((c) => c.action === action)
    expect(by('created')).toEqual([expect.objectContaining({ codeGuid: 'N', path: 'Saúde pública › Novo' })])
    expect(by('renamed')).toEqual([expect.objectContaining({ codeGuid: 'A', before: 'Saúde', after: 'Saúde pública' })])
    expect(by('described')).toEqual([expect.objectContaining({ codeGuid: 'A', before: '', after: 'Definição' })])
    expect(by('moved')).toEqual([expect.objectContaining({ codeGuid: 'B', before: 'Saúde', after: 'Escola', path: 'Escola › Acesso' })])
    // A deleted code takes its subcodes along: each one is listed.
    expect(by('deleted').map((c) => c.codeGuid).sort()).toEqual(['D', 'E'])
  })

  it('does not count saving the same values, a new colour, a new order or a hotkey', () => {
    const prev = [code('A', 'Um', [], 'x'), code('B', 'Dois')]
    const next = [{ ...code('B', 'Dois'), color: '#f00', hotkey: 3 } as Code, code('A', 'Um', [], 'x ')]
    expect(diffCodeTrees(prev, next)).toEqual([])
  })
})

describe('the history kept with the project file', () => {
  const project = { creatingUserGUID: 'u1', creationDateTime: '2026-01-01T00:00:00Z' }

  it('is on for projects saved before it existed, and keeps only well-formed entries', () => {
    expect(normalizeHistory(undefined)).toEqual(emptyHistory())
    const h = normalizeHistory({ enabled: false, entries: [{ id: '1', at: 'x', action: 'renamed', user: 'Ana' }, { id: 2 }, { id: '3', at: 'x', action: 'bogus' }] })
    expect(h.enabled).toBe(false)
    expect(h.entries.map((e) => e.id)).toEqual(['1'])
  })

  it('starts the history of an older project with the codes it already has, when it is saved', () => {
    rememberOpenedHistory({ ...project })
    const saved = withHistory({ project: { ...project, codes: [code('A', 'Saúde', [code('B', 'Acesso')])] }, userName: 'Ana' }).project.labiiaCodeHistory
    expect(saved.entries).toHaveLength(1)
    expect(saved.entries[0]).toMatchObject({ action: 'start', user: 'Ana' })
    expect(saved.entries[0].codes.map((c: { path: string }) => c.path)).toEqual(['Saúde', 'Saúde › Acesso'])
    // Saving again does not start it twice.
    expect(withHistory({ project: { ...project, codes: [] } }).project.labiiaCodeHistory.entries).toHaveLength(1)
  })

  it('belongs to the project it came from', () => {
    rememberOpenedHistory({ ...project, labiiaCodeHistory: { enabled: true, entries: [{ id: '1', at: 'x', action: 'created', user: 'Ana', origin: 'edit' }] } })
    const other = { creatingUserGUID: 'u2', creationDateTime: '2026-02-02T00:00:00Z', codes: [] }
    const saved = withHistory({ project: other }).project.labiiaCodeHistory
    expect(saved.entries.map((e: { action: string }) => e.action)).toEqual(['start'])
  })
})

describe('recording the changes made in the program', () => {
  installCodeHistory()
  const proj = { creatingUserGUID: 'rec', creationDateTime: '2026-03-03T00:00:00Z', filePath: null }
  const entries = () => useHistoryState.getState().history.entries
  const actions = () => entries().map((e) => e.action)

  beforeEach(() => {
    useProjectStore.setState(proj as never)
    usePreferencesStore.setState({ userName: 'Ana' } as never)
    useDocumentStore.setState({ sources: [] } as never)
    useCodeStore.getState().setCodes([code('A', 'Saúde'), code('B', 'Escola')])
    rememberOpenedHistory({ ...proj })
  })

  it('records nothing when a project is opened or closed', () => {
    useCodeStore.getState().setCodes([code('X', 'Outro')])
    useCodeStore.getState().clearAll()
    expect(entries()).toEqual([])
  })

  it('opens the history with the codes that existed before the first change, then records it', () => {
    useCodeStore.getState().renameCode('A', 'Saúde pública')
    expect(actions()).toEqual(['start', 'renamed'])
    expect(entries()[0].codes?.map((c) => c.name)).toEqual(['Saúde', 'Escola'])
    expect(entries()[1]).toMatchObject({ user: 'Ana', before: 'Saúde', after: 'Saúde pública', origin: 'edit' })
    // Renaming to the same name again is not a change.
    useCodeStore.getState().renameCode('A', 'Saúde pública')
    expect(actions()).toEqual(['start', 'renamed'])
  })

  it('records a merge as one entry with the passages recoded', () => {
    useDocumentStore.setState({ sources: [{ guid: 's', selections: [
      { guid: 'x1', codings: [{ codeGuid: 'A' }] },
      { guid: 'x2', codings: [{ codeGuid: 'A' }, { codeGuid: 'B' }] },
      { guid: 'x3', codings: [{ codeGuid: 'B' }] }
    ] }] } as never)
    useCodeStore.getState().mergeIntoCode('A', 'B')
    const merged = entries().filter((e) => e.action === 'merged')
    expect(merged).toEqual([expect.objectContaining({ codeName: 'Saúde', targetName: 'Escola', passages: 2, origin: 'merge' })])
    expect(actions()).not.toContain('deleted')
  })

  it('says how many coded passages a deleted code had', () => {
    useDocumentStore.setState({ sources: [{ guid: 's', selections: [{ guid: 'x1', codings: [{ codeGuid: 'B' }] }] }] } as never)
    useCodeStore.getState().removeCode('B')
    expect(entries().find((e) => e.action === 'deleted')).toMatchObject({ codeName: 'Escola', passages: 1 })
  })

  it('records codes imported from a codebook as imported', () => {
    useCodeStore.getState().mergeCodes([code('N1', 'Novo 1'), code('N2', 'Novo 2')])
    expect(entries().filter((e) => e.action === 'imported').map((e) => e.codeName)).toEqual(['Novo 1', 'Novo 2'])
  })

  it('keeps the change when it is undone and adds an entry for the undo', async () => {
    await new Promise((r) => setTimeout(r, 600))
    useUndoStore.getState().clearHistory()
    useCodeStore.getState().renameCode('B', 'Educação')
    await new Promise((r) => setTimeout(r, 600))
    useUndoStore.getState().undo()
    expect(useCodeStore.getState().codes[1].name).toBe('Escola')
    const renames = entries().filter((e) => e.action === 'renamed')
    expect(renames.map((e) => [e.origin, e.after])).toEqual([['edit', 'Educação'], ['undo', 'Escola']])
  })

  it('records changes that come from merging another copy of the project', () => {
    // Applied straight to the code list, without the code store's actions.
    applyMerge({ ...emptyApplyPlan(), codes: [
      { guid: 'B', bucket: 'bothDiffer', changedFields: ['name'], mine: code('B', 'Escola'), theirs: code('B', 'Escola básica') } as never
    ] })
    expect(entries().find((e) => e.action === 'renamed')).toMatchObject({ after: 'Escola básica', origin: 'projectMerge' })
  })

  it('records nothing while paused, and marks the pause and the restart', () => {
    setHistoryEnabled(false)
    useCodeStore.getState().renameCode('A', 'Ignorado')
    setHistoryEnabled(true)
    expect(actions()).toEqual(['start', 'paused', 'resumed'])
    expect(entries()[2].codes?.map((c) => c.name)).toEqual(['Ignorado', 'Escola'])
  })

  it('keeps which parent code a code left and joined, so each code can show it', () => {
    useCodeStore.getState().moveCode('B', 'A')
    const created = useCodeStore.getState().addCode('Novo', '#000', 'A')
    expect(entries().find((e) => e.action === 'moved')).toMatchObject({ codeGuid: 'B', fromParentGuid: null, toParentGuid: 'A' })
    expect(entries().find((e) => e.action === 'created')).toMatchObject({ codeGuid: created, parentGuid: 'A' })
  })

  it('keeps the justification written for an entry', () => {
    useCodeStore.getState().renameCode('A', 'Saúde coletiva')
    const id = entries()[1].id
    setJustification(id, 'Termo usado pelos entrevistados')
    expect(entries()[1].justification).toBe('Termo usado pelos entrevistados')
    setJustification(id, '  ')
    expect(entries()[1]).not.toHaveProperty('justification')
  })
})
