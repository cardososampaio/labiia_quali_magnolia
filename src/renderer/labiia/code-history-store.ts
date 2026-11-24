/**
 * Records the history of the codes (see code-history-model.ts for what is
 * recorded and why).
 *
 * Instead of a call in every screen that changes codes, one observer
 * compares the code tree before and after each change. Every path that
 * changes codes is covered the same way: the Codes panel, the codebook
 * window, quick coding, transcripts, merging copies of a project, and
 * Undo/Redo.
 *
 * Opening or closing a project replaces the codes without recording
 * anything. The history is not part of Undo: undoing a change adds an entry
 * instead of removing one.
 */
import { create } from 'zustand'
import { useCodeStore } from '../stores/code-store'
import { useDocumentStore } from '../stores/document-store'
import { useProjectStore } from '../stores/project-store'
import { usePreferencesStore } from '../stores/preferences-store'
import { useUndoStore } from '../stores/undo-store'
import {
  type CodeHistory,
  type HistoryEntry,
  changesToEntries,
  countPassages,
  currentIntents,
  diffCodeTrees,
  emptyHistory,
  newEntryId,
  projectKey,
  startEntry,
  useHistoryState
} from './code-history-model'

function currentUser(): string {
  return usePreferencesStore.getState().userName.trim()
}

/** The open project's history, starting a new one when the kept history
 *  belongs to another project. */
function ownHistory(): CodeHistory {
  const s = useHistoryState.getState()
  return s.owner === projectKey(useProjectStore.getState()) ? s.history : emptyHistory()
}

function saveHistory(history: CodeHistory): void {
  useHistoryState.setState({ owner: projectKey(useProjectStore.getState()), history })
  useProjectStore.getState().markDirty()
}

let installed = false

/** Starts recording. Called once, when the main window starts. */
export function installCodeHistory(): void {
  if (installed) return
  installed = true
  useCodeStore.subscribe((state, prev) => {
    if (state.codes === prev.codes) return
    const intents = currentIntents()
    if (intents.some((i) => i.kind === 'load')) return
    const changes = diffCodeTrees(prev.codes, state.codes)
    if (changes.length === 0) return
    const history = ownHistory()
    if (!history.enabled) return
    const at = new Date().toISOString()
    const user = currentUser()
    const undo = useUndoStore.getState()
    const undoing = undo._restoring ? undo._labiiaRestoring : undefined
    const sources = useDocumentStore.getState().sources as never[]
    const entries: HistoryEntry[] = [...history.entries]
    // The history starts with the codes the project had before its first recorded change.
    if (entries.length === 0) entries.push(startEntry(prev.codes, user, at))
    entries.push(...changesToEntries(changes, { user, at, intents, undoing, passagesOf: (g) => countPassages(sources, [g]) }))
    saveHistory({ ...history, entries })
  })
}

// ── For the history window ────────────────────────────────────────────

/** The open project's history, kept up to date. */
export function useCodeHistory(): CodeHistory {
  const owner = useHistoryState((s) => s.owner)
  const history = useHistoryState((s) => s.history)
  const current = useProjectStore((s) => projectKey(s))
  return owner === current ? history : emptyHistory()
}

/** The researcher's reason for a change, saved with the project. */
export function setJustification(entryId: string, text: string): void {
  const history = ownHistory()
  const value = text.trim()
  saveHistory({
    ...history,
    entries: history.entries.map((e) => {
      if (e.id !== entryId) return e
      const next = { ...e }
      if (value) next.justification = text
      else delete next.justification
      return next
    })
  })
}

/** Pausing records the pause; resuming records every code that exists
 *  then, so changes made while paused show up as a gap, not as silence. */
export function setHistoryEnabled(enabled: boolean): void {
  const history = ownHistory()
  if (history.enabled === enabled) return
  const at = new Date().toISOString()
  const user = currentUser()
  const entries = [...history.entries]
  const codes = useCodeStore.getState().codes
  if (enabled) {
    entries.push(startEntry(codes, user, at, entries.length === 0 ? 'start' : 'resumed'))
  } else {
    if (entries.length === 0) entries.push(startEntry(codes, user, at))
    entries.push({ id: newEntryId(), at, user, action: 'paused', origin: 'edit' })
  }
  saveHistory({ ...history, enabled, entries })
}

// ── Opening the history window ────────────────────────────────────────

interface DialogState {
  open: boolean
  /** Opened from a code's menu: the window starts filtered on that code. */
  codeGuid?: string
}

export const useCodeHistoryDialog = create<DialogState>(() => ({ open: false }))

export function openCodeHistory(codeGuid?: string): void {
  useCodeHistoryDialog.setState({ open: true, codeGuid })
}

export function closeCodeHistory(): void {
  useCodeHistoryDialog.setState({ open: false, codeGuid: undefined })
}
