/**
 * recent-codes-store — the codes the user applied most recently, newest
 * first. Feeds the quick-coding bar's "Last" button and code shortcuts and
 * the "Recent" section of the code picker, so codes used again and again
 * are one click away.
 *
 * Fed from document-store's addCodingToSelection, so every way of applying
 * a code counts (drag and drop, hotkeys, context menu, the quick-coding bar).
 * Kept in memory only: guids belong to one project, and stale ones are
 * filtered out against the current code tree wherever the list is shown.
 */
import { create } from 'zustand'

/** Longest list kept; the bar shows fewer when space is short. */
export const MAX_RECENT_CODES = 8

interface RecentCodesState {
  codeGuids: string[]
  noteUsed: (codeGuid: string) => void
  clear: () => void
}

export function withRecentCode(list: string[], codeGuid: string, max = MAX_RECENT_CODES): string[] {
  return [codeGuid, ...list.filter((g) => g !== codeGuid)].slice(0, max)
}

export const useRecentCodesStore = create<RecentCodesState>((set) => ({
  codeGuids: [],
  noteUsed: (codeGuid) => set((state) => ({ codeGuids: withRecentCode(state.codeGuids, codeGuid) })),
  clear: () => set({ codeGuids: [] })
}))
