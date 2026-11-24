/**
 * How the Codes panel lists the codes: order, whether subcodes add up in
 * their parent code, and the size of the panel's text. These are viewing
 * choices of the person at this computer, not part of the project, so they
 * stay in the window's local storage and every project opens the same way.
 *
 * The text size here multiplies the general interface scale (Preferences),
 * so both can be used together.
 */
import { create } from 'zustand'
import type { Code } from '../models/types'

/** `manual` keeps the order the codes were arranged in (drag and drop). */
export type CodeSort = 'manual' | 'countDesc' | 'countAsc' | 'nameAsc' | 'nameDesc'

export const CODE_SORTS: CodeSort[] = ['manual', 'countDesc', 'countAsc', 'nameAsc', 'nameDesc']

/** Text size of the code list. 1.3 is 30% larger than the font Magnolia uses
 *  in its panels, which is small to read for long sessions. */
export const CODE_FONT_SCALE_DEFAULT = 1.3
export const CODE_FONT_SCALE_MIN = 0.8
export const CODE_FONT_SCALE_MAX = 2.5
export const CODE_FONT_SCALE_STEP = 0.1

const STORAGE_KEY = 'labiia.codePanelView'

interface SavedView {
  sort: CodeSort
  aggregateSubcodes: boolean
  fontScale: number
}

const DEFAULT_VIEW: SavedView = {
  sort: 'manual',
  aggregateSubcodes: false,
  fontScale: CODE_FONT_SCALE_DEFAULT
}

export function clampFontScale(scale: number): number {
  if (!Number.isFinite(scale)) return CODE_FONT_SCALE_DEFAULT
  const rounded = Math.round(scale * 10) / 10
  return Math.min(CODE_FONT_SCALE_MAX, Math.max(CODE_FONT_SCALE_MIN, rounded))
}

/** Reads what was saved, falling back to the defaults for anything missing
 *  or unreadable (storage can be empty or unavailable). */
export function parseSavedView(raw: string | null): SavedView {
  if (!raw) return { ...DEFAULT_VIEW }
  try {
    const v = JSON.parse(raw) as Partial<SavedView>
    return {
      sort: CODE_SORTS.includes(v.sort as CodeSort) ? (v.sort as CodeSort) : DEFAULT_VIEW.sort,
      aggregateSubcodes: typeof v.aggregateSubcodes === 'boolean' ? v.aggregateSubcodes : DEFAULT_VIEW.aggregateSubcodes,
      fontScale: typeof v.fontScale === 'number' ? clampFontScale(v.fontScale) : DEFAULT_VIEW.fontScale
    }
  } catch {
    return { ...DEFAULT_VIEW }
  }
}

function readSaved(): SavedView {
  try { return parseSavedView(localStorage.getItem(STORAGE_KEY)) } catch { return { ...DEFAULT_VIEW } }
}

function writeSaved(view: SavedView): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(view)) } catch { /* viewing convenience only */ }
}

interface CodePanelViewState extends SavedView {
  setSort: (sort: CodeSort) => void
  setAggregateSubcodes: (on: boolean) => void
  setFontScale: (scale: number) => void
}

export const useCodePanelView = create<CodePanelViewState>((set, get) => {
  const save = () => {
    const { sort, aggregateSubcodes, fontScale } = get()
    writeSaved({ sort, aggregateSubcodes, fontScale })
  }
  return {
    ...readSaved(),
    setSort: (sort) => { set({ sort }); save() },
    setAggregateSubcodes: (aggregateSubcodes) => { set({ aggregateSubcodes }); save() },
    setFontScale: (scale) => { set({ fontScale: clampFontScale(scale) }); save() }
  }
})

// The Codes panel can be popped out into its own window: a change made in
// one window shows up in the other.
try {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) useCodePanelView.setState(parseSavedView(e.newValue))
  })
} catch { /* no window (tests) */ }

/** How often each code was applied and in how many documents. */
export interface CodeUsage {
  /** Applications (coded passages). */
  count: number
  /** Documents with at least one application. */
  documents: number
}

interface SourceLike {
  guid: string
  selections: { guid?: string; codings: { codeGuid: string }[] }[]
}

/**
 * Usage of every code. With `aggregateSubcodes`, a code's numbers cover its
 * own passages and those of all its subcodes. A passage coded with the
 * parent and a subcode (or with two subcodes) counts once, so the number
 * matches the passages listed when the parent code is opened with its
 * subcodes.
 */
export function computeCodeUsage(codes: Code[], sources: SourceLike[], aggregateSubcodes: boolean): Map<string, CodeUsage> {
  // For each code, the codes whose passages it counts.
  const owners = new Map<string, string[]>()
  const walk = (list: Code[], ancestors: string[]) => {
    for (const c of list) {
      owners.set(c.guid, aggregateSubcodes ? [c.guid, ...ancestors] : [c.guid])
      walk(c.children, aggregateSubcodes ? [c.guid, ...ancestors] : ancestors)
    }
  }
  walk(codes, [])

  const count = new Map<string, number>()
  const docs = new Map<string, number>()
  for (const source of sources) {
    const inThisDoc = new Set<string>()
    for (const sel of source.selections) {
      const countedHere = new Set<string>()
      for (const coding of sel.codings) {
        // A code no longer in the tree still counts for itself.
        for (const owner of owners.get(coding.codeGuid) ?? [coding.codeGuid]) {
          if (aggregateSubcodes) {
            if (countedHere.has(owner)) continue
            countedHere.add(owner)
          }
          count.set(owner, (count.get(owner) || 0) + 1)
          inThisDoc.add(owner)
        }
      }
    }
    for (const g of inThisDoc) docs.set(g, (docs.get(g) || 0) + 1)
  }

  const usage = new Map<string, CodeUsage>()
  for (const [g, n] of count) usage.set(g, { count: n, documents: docs.get(g) || 0 })
  return usage
}

/** Orders the codes at every level of the tree; subcodes stay under their
 *  parent. Ties keep the manual order. Names compare as Portuguese text,
 *  ignoring case and accents, with numbers in numeric order. */
export function sortCodeTree(codes: Code[], sort: CodeSort, usage: Map<string, CodeUsage>, locale?: string): Code[] {
  if (sort === 'manual') return codes
  const collator = new Intl.Collator(locale || 'pt-BR', { sensitivity: 'base', numeric: true })
  const countOf = (c: Code) => usage.get(c.guid)?.count ?? 0
  const compare = (a: Code, b: Code): number => {
    switch (sort) {
      case 'countDesc': return countOf(b) - countOf(a) || collator.compare(a.name, b.name)
      case 'countAsc': return countOf(a) - countOf(b) || collator.compare(a.name, b.name)
      case 'nameAsc': return collator.compare(a.name, b.name)
      case 'nameDesc': return collator.compare(b.name, a.name)
      default: return 0
    }
  }
  const sortLevel = (list: Code[]): Code[] =>
    list
      .map((c, i) => ({ c, i }))
      .sort((x, y) => compare(x.c, y.c) || x.i - y.i)
      .map(({ c }) => (c.children.length > 0 ? { ...c, children: sortLevel(c.children) } : c))
  return sortLevel(codes)
}
