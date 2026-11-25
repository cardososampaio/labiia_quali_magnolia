/**
 * History of the codes: what is recorded and how it is kept with the project.
 *
 * To make the coding process transparent and replicable, the project keeps
 * every change to its codes: created, renamed, described, moved to another
 * parent code, merged, deleted, imported from a codebook. Each entry says
 * who did it (the name in Preferences), when, and the values before and
 * after. The researcher can add a justification to any entry afterwards.
 *
 * The history only grows: undoing a change does not erase it, it adds an
 * entry marked as undone. Colour, order in the list and hotkeys are not
 * recorded, because they do not change what a code means.
 *
 * It is saved in the project file (`labiiaCodeHistory`, see
 * crates/magnolia-core/src/qdpx/labiia_code_history.rs) and is on for every
 * project until the researcher pauses it.
 *
 * This module is loaded with the platform bridge (platform/tauri-api.ts),
 * before the program's stores exist, so it must not import them; the
 * recording itself is in code-history-store.ts.
 */
import { create } from 'zustand'
import type { Code } from '../models/types'

export const HISTORY_FIELD = 'labiiaCodeHistory'

export type HistoryAction =
  | 'start'
  | 'created'
  | 'renamed'
  | 'described'
  | 'moved'
  | 'merged'
  | 'deleted'
  | 'imported'
  | 'paused'
  | 'resumed'

export const HISTORY_ACTIONS: HistoryAction[] = ['start', 'created', 'renamed', 'described', 'moved', 'merged', 'deleted', 'imported', 'paused', 'resumed']

/** How the change came about: an ordinary edit, Undo/Redo, importing a
 *  codebook, merging two codes, or merging another copy of the project. */
export type HistoryOrigin = 'edit' | 'undo' | 'redo' | 'import' | 'zotero' | 'merge' | 'projectMerge'

/** A code as it was at that moment. */
export interface CodeSnapshot {
  guid: string
  name: string
  /** Names from the top-level code down to this one, joined by " › ". */
  path: string
}

export interface HistoryEntry {
  id: string
  /** ISO date and time. */
  at: string
  /** Who made the change: the name in Preferences. */
  user: string
  action: HistoryAction
  origin: HistoryOrigin
  codeGuid?: string
  codeName?: string
  path?: string
  before?: string
  after?: string
  /** Created and deleted: the parent code it was under (null at the top level). */
  parentGuid?: string | null
  /** Moved: the parent code before and after (null at the top level). */
  fromParentGuid?: string | null
  toParentGuid?: string | null
  /** Merges: the code that received the passages. */
  targetGuid?: string
  targetName?: string
  /** Merges and deletions: coded passages the code had at that moment. */
  passages?: number
  /** Start and resume: every code that existed at that moment. */
  codes?: CodeSnapshot[]
  /** The researcher's reason for the change, written at any time. */
  justification?: string
}

export interface CodeHistory {
  version: 1
  enabled: boolean
  entries: HistoryEntry[]
}

export function emptyHistory(): CodeHistory {
  return { version: 1, enabled: true, entries: [] }
}

const isStr = (v: unknown): v is string => typeof v === 'string'

/** A history read from a project file, keeping only well-formed entries;
 *  anything missing falls back to "on, no entries". */
export function normalizeHistory(v: unknown): CodeHistory {
  if (!v || typeof v !== 'object') return emptyHistory()
  const raw = v as Record<string, unknown>
  const entries: HistoryEntry[] = []
  if (Array.isArray(raw.entries)) {
    for (const e of raw.entries) {
      if (!e || typeof e !== 'object') continue
      const x = e as Record<string, unknown>
      if (!isStr(x.id) || !isStr(x.at) || !HISTORY_ACTIONS.includes(x.action as HistoryAction)) continue
      entries.push({ ...(x as unknown as HistoryEntry), user: isStr(x.user) ? x.user : '', origin: (isStr(x.origin) ? x.origin : 'edit') as HistoryOrigin })
    }
  }
  return { version: 1, enabled: raw.enabled !== false, entries }
}

export const PATH_SEPARATOR = ' › '

interface FlatCode {
  code: Code
  parentGuid: string | null
  path: string
}

export function flattenWithPaths(codes: Code[]): Map<string, FlatCode> {
  const out = new Map<string, FlatCode>()
  const walk = (list: Code[], parentGuid: string | null, prefix: string) => {
    for (const code of list) {
      const path = prefix ? `${prefix}${PATH_SEPARATOR}${code.name}` : code.name
      // A code listed twice in the tree (some older project files) keeps its
      // first place, which is under its parent code.
      if (!out.has(code.guid)) out.set(code.guid, { code, parentGuid, path })
      walk(code.children ?? [], code.guid, path)
    }
  }
  walk(codes, null, '')
  return out
}

export function snapshotCodes(codes: Code[]): CodeSnapshot[] {
  return [...flattenWithPaths(codes).values()].map(({ code, path }) => ({ guid: code.guid, name: code.name, path }))
}

/** One change between two versions of the code tree. */
export interface CodeChange {
  action: 'created' | 'renamed' | 'described' | 'moved' | 'deleted'
  codeGuid: string
  codeName: string
  path: string
  before?: string
  after?: string
  /** Created, moved: the parent code after the change; deleted: before it
   *  (null at the top level). */
  parentGuid?: string | null
  /** For a move: the parent code before it. */
  fromParentGuid?: string | null
}

/**
 * What changed in the codes, compared code by code (by guid). A code saved
 * again with the same name or description is not a change, and neither is
 * a new colour, a new place among its siblings or a hotkey. A deleted code
 * takes its subcodes along: each one is listed.
 */
export function diffCodeTrees(prev: Code[], next: Code[]): CodeChange[] {
  const a = flattenWithPaths(prev)
  const b = flattenWithPaths(next)
  const changes: CodeChange[] = []
  for (const [guid, n] of b) {
    const o = a.get(guid)
    if (!o) {
      changes.push({ action: 'created', codeGuid: guid, codeName: n.code.name, path: n.path, after: n.code.name, parentGuid: n.parentGuid })
      continue
    }
    if (o.code.name !== n.code.name) {
      changes.push({ action: 'renamed', codeGuid: guid, codeName: n.code.name, path: n.path, before: o.code.name, after: n.code.name })
    }
    const da = (o.code.description ?? '').trim()
    const db = (n.code.description ?? '').trim()
    if (da !== db) {
      changes.push({ action: 'described', codeGuid: guid, codeName: n.code.name, path: n.path, before: da, after: db })
    }
    if (o.parentGuid !== n.parentGuid) {
      const parentPath = (m: Map<string, FlatCode>, g: string | null) => (g ? m.get(g)?.path ?? '' : '')
      changes.push({
        action: 'moved', codeGuid: guid, codeName: n.code.name, path: n.path,
        before: parentPath(a, o.parentGuid), after: parentPath(b, n.parentGuid), parentGuid: n.parentGuid, fromParentGuid: o.parentGuid
      })
    }
  }
  for (const [guid, o] of a) {
    if (!b.has(guid)) changes.push({ action: 'deleted', codeGuid: guid, codeName: o.code.name, path: o.path, before: o.code.name, parentGuid: o.parentGuid })
  }
  return changes
}

// ── Kept between opening and saving a project ─────────────────────────

/** Which project a history belongs to: who created it and when (kept across Save As). */
export function projectKey(p: { creatingUserGUID?: string; creationDateTime?: string; filePath?: string | null }): string {
  return p.creatingUserGUID || p.creationDateTime ? `${p.creatingUserGUID ?? ''}|${p.creationDateTime ?? ''}` : `file:${p.filePath ?? ''}`
}

interface HistoryState {
  owner: string | null
  history: CodeHistory
}

export const useHistoryState = create<HistoryState>(() => ({ owner: null, history: emptyHistory() }))

/** A project's history, or a new one when the kept history belongs to another project. */
export function historyFor(project: { creatingUserGUID?: string; creationDateTime?: string; filePath?: string | null }): CodeHistory {
  const s = useHistoryState.getState()
  return s.owner === projectKey(project) ? s.history : emptyHistory()
}

/** A project file was opened: keep its history for it. */
export function rememberOpenedHistory(project: any): void {
  if (!project || typeof project !== 'object') return
  useHistoryState.setState({ owner: projectKey(project), history: normalizeHistory(project[HISTORY_FIELD]) })
}

let idCounter = 0
export function newEntryId(): string {
  idCounter += 1
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${idCounter}-${Math.random().toString(36).slice(2)}`
  return rand
}

/** The entry that opens a history: every code that existed when recording began. */
export function startEntry(codes: Code[], user: string, at: string, action: 'start' | 'resumed' = 'start'): HistoryEntry {
  return { id: newEntryId(), at, user, action, origin: 'edit', codes: snapshotCodes(codes) }
}

/**
 * The project about to be saved, with its history. A project saved with the
 * history on and nothing recorded yet starts it here, with the codes it has,
 * so the history of an older project begins from what it already had.
 */
export function withHistory<T extends { project?: any; userName?: string }>(data: T): T {
  if (!data?.project || typeof data.project !== 'object') return data
  const key = projectKey(data.project)
  let history = historyFor(data.project)
  if (history.enabled && history.entries.length === 0) {
    const codes: Code[] = Array.isArray(data.project.codes) ? data.project.codes : []
    history = { ...history, entries: [startEntry(codes, (data.userName ?? '').trim(), new Date().toISOString())] }
    useHistoryState.setState({ owner: key, history })
  }
  return { ...data, project: { ...data.project, [HISTORY_FIELD]: history } }
}

// ── Why the next change to the codes happens ──────────────────────────
// The code store says what it is about to do (open a project, merge two
// codes, import a codebook, apply another copy of the project), so the
// history can describe the change; a plain edit needs nothing.

export type CodeIntent =
  | { kind: 'load' }
  /** Importing codes: from a codebook (the default) or from Zotero's highlight comments. */
  | { kind: 'import'; from?: 'codebook' | 'zotero' }
  | { kind: 'projectMerge' }
  | { kind: 'merge'; sourceGuid: string; targetGuid: string; targetName: string; mode: 'move' | 'merge'; mergedGuids: string[]; passages: number }

const intents: CodeIntent[] = []

export function beginCodeIntent(intent: CodeIntent): void {
  intents.push(intent)
}

export function endCodeIntent(): void {
  intents.pop()
}

export function currentIntents(): readonly CodeIntent[] {
  return intents
}

interface SourceLike {
  selections?: { codings?: { codeGuid: string }[] }[]
}

/** Coded passages that carry any of these codes. */
export function countPassages(sources: SourceLike[], guids: Iterable<string>): number {
  const set = new Set(guids)
  let n = 0
  for (const s of sources) {
    for (const sel of s.selections ?? []) {
      if (sel.codings?.some((c) => set.has(c.codeGuid))) n += 1
    }
  }
  return n
}

/** Before merging `sourceGuid` into `targetGuid`: what the history will say about it. */
export function mergeIntent(codes: Code[], sources: SourceLike[], sourceGuid: string, targetGuid: string, mode: 'move' | 'merge'): CodeIntent {
  const flat = flattenWithPaths(codes)
  const merged = [sourceGuid]
  if (mode === 'merge') {
    for (const [guid] of flattenWithPaths(flat.get(sourceGuid)?.code.children ?? [])) merged.push(guid)
  }
  return {
    kind: 'merge', sourceGuid, targetGuid, targetName: flat.get(targetGuid)?.path ?? '', mode,
    mergedGuids: merged, passages: countPassages(sources, merged)
  }
}

/**
 * The entries for a set of changes. Merges turn the deletion of the merged
 * codes into "merged into …"; an imported codebook turns new codes into
 * "imported"; deleted codes say how many coded passages they had.
 */
export function changesToEntries(
  changes: CodeChange[],
  ctx: { user: string; at: string; intents: readonly CodeIntent[]; undoing?: 'undo' | 'redo'; passagesOf: (guid: string) => number }
): HistoryEntry[] {
  const merge = [...ctx.intents].reverse().find((i): i is Extract<CodeIntent, { kind: 'merge' }> => i.kind === 'merge')
  const importIntent = ctx.intents.find((i): i is Extract<CodeIntent, { kind: 'import' }> => i.kind === 'import')
  const importing = !!importIntent
  const projectMerge = ctx.intents.some((i) => i.kind === 'projectMerge')
  const baseOrigin: HistoryOrigin = ctx.undoing ?? (projectMerge ? 'projectMerge' : merge ? 'merge' : importing ? (importIntent?.from === 'zotero' ? 'zotero' : 'import') : 'edit')
  return changes.map((c): HistoryEntry => {
    const entry: HistoryEntry = {
      id: newEntryId(), at: ctx.at, user: ctx.user, action: c.action, origin: baseOrigin,
      codeGuid: c.codeGuid, codeName: c.codeName, path: c.path
    }
    if (c.before !== undefined) entry.before = c.before
    if (c.after !== undefined) entry.after = c.after
    if (c.action === 'moved') {
      entry.fromParentGuid = c.fromParentGuid ?? null
      entry.toParentGuid = c.parentGuid ?? null
    } else if (c.parentGuid !== undefined) {
      entry.parentGuid = c.parentGuid
    }
    if (c.action === 'deleted' && merge && merge.mergedGuids.includes(c.codeGuid)) {
      entry.action = 'merged'
      entry.after = merge.targetName
      entry.targetGuid = merge.targetGuid
      entry.targetName = merge.targetName
      if (c.codeGuid === merge.sourceGuid) entry.passages = merge.passages
    } else if (c.action === 'deleted') {
      entry.passages = ctx.passagesOf(c.codeGuid)
    } else if (c.action === 'created' && importing && !ctx.undoing) {
      entry.action = 'imported'
    }
    return entry
  })
}

// ── What belongs to one code's history ────────────────────────────────

/**
 * How an entry concerns one code, seen from that code:
 * - `own`: a change to the code itself (or, with subcodes included, to one of them);
 * - `existed`: the start of the record (or a resume) when the code already existed;
 * - `mergedIn`: another code was merged into it;
 * - `childIn` / `childOut`: a subcode was moved into it / out of it;
 * - `childCreated` / `childDeleted`: a subcode was created in it / deleted from it.
 */
export type CodeRelation = 'own' | 'existed' | 'mergedIn' | 'childIn' | 'childOut' | 'childCreated' | 'childDeleted'

/**
 * Which entries concern a code and how. Entries recorded before the parent
 * codes were kept by guid are matched by the code's path (the parent's path
 * is what they show before and after), following the code through its moves
 * and renames.
 */
export function codeRelations(
  history: CodeHistory,
  codeGuid: string,
  codes: Code[],
  opts: { includeSubcodes?: boolean } = {}
): (e: HistoryEntry) => CodeRelation | null {
  const flat = flattenWithPaths(codes)
  const guids = new Set([codeGuid])
  if (opts.includeSubcodes) {
    const self = flat.get(codeGuid)
    if (self) for (const [g] of flattenWithPaths(self.code.children ?? [])) guids.add(g)
  }
  // Paths a code had over time: its current path and those its own entries show.
  const paths = new Map<string, Set<string>>()
  for (const g of guids) paths.set(g, new Set(flat.get(g) ? [flat.get(g)!.path] : []))
  for (const e of history.entries) {
    if (!e.codeGuid || !guids.has(e.codeGuid) || !e.path) continue
    const set = paths.get(e.codeGuid)!
    set.add(e.path)
    const cut = e.path.lastIndexOf(PATH_SEPARATOR)
    const parent = cut >= 0 ? e.path.slice(0, cut) : ''
    const own = cut >= 0 ? e.path.slice(cut + PATH_SEPARATOR.length) : e.path
    // Where it was before a move, and its name before a rename.
    if (e.action === 'moved' && e.before !== undefined) set.add(e.before ? `${e.before}${PATH_SEPARATOR}${own}` : own)
    if (e.action === 'renamed' && e.before) set.add(parent ? `${parent}${PATH_SEPARATOR}${e.before}` : e.before)
  }
  const isOne = (g: string | null | undefined) => !!g && guids.has(g)
  const byPath = (p: string | undefined) => !!p && [...paths.values()].some((set) => set.has(p))
  return (e) => {
    if (isOne(e.codeGuid)) return 'own'
    if (isOne(e.targetGuid)) return 'mergedIn'
    if (e.codes) return e.codes.some((c) => guids.has(c.guid)) ? 'existed' : null
    if (e.action === 'moved') {
      if ('fromParentGuid' in e || 'toParentGuid' in e) {
        if (isOne(e.toParentGuid)) return 'childIn'
        return isOne(e.fromParentGuid) ? 'childOut' : null
      }
      if (byPath(e.after)) return 'childIn'
      return byPath(e.before) ? 'childOut' : null
    }
    if (e.action === 'created' || e.action === 'imported' || e.action === 'deleted') {
      let under: boolean
      if ('parentGuid' in e) under = isOne(e.parentGuid)
      else {
        // Older entries: the parent is the path above the code's own name.
        const cut = e.path?.lastIndexOf(PATH_SEPARATOR) ?? -1
        under = cut > 0 && byPath(e.path!.slice(0, cut))
      }
      if (!under) return null
      return e.action === 'deleted' ? 'childDeleted' : 'childCreated'
    }
    return null
  }
}

/**
 * The entries that concern one code, as "History of this code" shows them
 * and the report lists them under the code: its own changes (and their
 * undo/redo), the start of the record when it already existed, and changes
 * it received (a code merged into it, a subcode created in it, moved into
 * it or out of it). With `includeSubcodes`, its current subcodes' too.
 */
export function entriesForCode(
  history: CodeHistory,
  codeGuid: string,
  codes: Code[],
  opts: { includeSubcodes?: boolean } = {}
): HistoryEntry[] {
  const relationOf = codeRelations(history, codeGuid, codes, opts)
  return history.entries.filter((e) => relationOf(e) !== null)
}
