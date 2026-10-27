/**
 * Applying a code to the user's pending selection, whatever kind of document
 * it is in. Used by the quick-coding bar and by the New Code dialog, so both
 * code a selection exactly the way dropping a code onto it does:
 *
 *   - text (plain text, Markdown, notes, PDF text, audio transcripts): a
 *     character range;
 *   - video transcript lines: a time range on the video timeline;
 *   - PDF / image box selections: a page region;
 *   - survey answers: one coding per selected cell.
 *
 * A selection with the same bounds is reused, so applying several codes to
 * one passage stacks them on a single coded segment, and applying the same
 * code twice does nothing.
 */
import type { Code } from '../models/types'
import type { PendingSelection } from '../stores/pending-selection-store'
import { useDocumentStore } from '../stores/document-store'
import { t, formatNumber } from '../i18n'
import { sourceTypeFromFilename } from './format-registry'

/** Coded segments are named after their text, shortened to this length. */
const SEGMENT_NAME_MAX = 60

function segmentName(text: string): string {
  return text.length > SEGMENT_NAME_MAX ? text.slice(0, SEGMENT_NAME_MAX - 3) + '...' : text
}

/** Region selections match an existing one within half a pixel, as the
 *  PDF and image viewers do, so repeated codings stack on one region. */
function sameRegion(a: { page: number; x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.page === b.page &&
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
}

export function applyCodeToSelection(ps: PendingSelection, codeGuid: string): void {
  const ds = useDocumentStore.getState()
  const src = ds.sources.find((s) => s.guid === ps.sourceGuid)
  if (!src) return

  const codeOnto = (selectionGuid: string, codings: { codeGuid: string }[]): void => {
    if (!codings.some((c) => c.codeGuid === codeGuid)) ds.addCodingToSelection(ps.sourceGuid, selectionGuid, codeGuid)
  }

  if (ps.kind === 'text' && ps.timeRange) {
    const { startTime, endTime, startLine, endLine } = ps.timeRange
    const existing = src.selections.find(
      (s) => s.timeRange && s.timeRange.startTime === startTime && s.timeRange.endTime === endTime
    )
    if (existing) codeOnto(existing.guid, existing.codings)
    else ds.addCodingToSelection(ps.sourceGuid, ds.addTimeRangeSelection(ps.sourceGuid, startTime, endTime, startLine, endLine), codeGuid)
    return
  }

  if (ps.kind === 'text') {
    const existing = src.selections.find(
      (s) => !s.timeRange && !s.pdfRegion && s.startPosition === ps.startCp && s.endPosition === ps.endCp
    )
    if (existing) codeOnto(existing.guid, existing.codings)
    else ds.addCodingToSelection(ps.sourceGuid, ds.addSelection(ps.sourceGuid, ps.startCp, ps.endCp, segmentName(ps.selectedText)), codeGuid)
    return
  }

  if (ps.kind === 'region') {
    const r = ps.pdfRegion
    const existing = src.selections.find((s) => s.pdfRegion && sameRegion(s.pdfRegion, r))
    if (existing) { codeOnto(existing.guid, existing.codings); return }
    const name = sourceTypeFromFilename(src.name) === 'image' ? t('Region') : t('Region p{{page}}', { page: r.page })
    ds.addCodingToSelection(ps.sourceGuid, ds.addSelection(ps.sourceGuid, 0, 0, name, r), codeGuid)
    return
  }

  for (const cell of ps.cells) {
    const current = useDocumentStore.getState().sources.find((s) => s.guid === ps.sourceGuid)
    const existing = current?.selections.find(
      (s) =>
        s.surveyCell &&
        s.surveyCell.respondentId === cell.respondentId &&
        s.surveyCell.questionId === cell.questionId &&
        s.startPosition === cell.start &&
        s.endPosition === cell.end
    )
    if (existing) codeOnto(existing.guid, existing.codings)
    else {
      const selGuid = ds.addSelection(
        ps.sourceGuid,
        cell.start,
        cell.end,
        segmentName(cell.selectedText),
        undefined,
        { respondentId: cell.respondentId, questionId: cell.questionId }
      )
      ds.addCodingToSelection(ps.sourceGuid, selGuid, codeGuid)
    }
  }
}

/** The selected text, when the selection has any (not for box regions). */
export function selectionText(ps: PendingSelection): string {
  if (ps.kind === 'text') return ps.selectedText
  if (ps.kind === 'survey-cell') return ps.cells.map((c) => c.selectedText).join(' ')
  return ''
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

/** Where the selection is, in the quick-coding bar: character positions for
 *  text, times for video, the page for PDF regions, the answer count for
 *  surveys. */
export function selectionPositionLabel(ps: PendingSelection): string {
  if (ps.kind === 'text' && ps.timeRange) return `${clock(ps.timeRange.startTime)}–${clock(ps.timeRange.endTime)}`
  if (ps.kind === 'text') return `${formatNumber(ps.startCp)}–${formatNumber(ps.endCp)}`
  if (ps.kind === 'region') {
    const src = useDocumentStore.getState().sources.find((s) => s.guid === ps.sourceGuid)
    // Images have a single "page", so only PDFs name the page.
    return src && sourceTypeFromFilename(src.name) === 'image' ? t('Region') : t('Region p{{page}}', { page: ps.pdfRegion.page })
  }
  return ps.cells.length === 1 ? t('1 answer') : t('{{count}} answers', { count: formatNumber(ps.cells.length) })
}

/** Name for an in vivo code: the selected words themselves, with line breaks
 *  and repeated spaces collapsed and surrounding quotes and punctuation
 *  dropped, shortened at a word boundary so it fits in the code list. */
export const IN_VIVO_MAX = 60

export function inVivoCodeName(text: string): string {
  const clean = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s"'“”‘’«».,;:!?()[\]{}—–-]+|[\s"'“”‘’«».,;:!?()[\]{}—–-]+$/g, '')
  if (clean.length <= IN_VIVO_MAX) return clean
  const cut = clean.slice(0, IN_VIVO_MAX - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > IN_VIVO_MAX / 2 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…'
}

export interface FlatCode {
  code: Code
  depth: number
  /** Ancestor names, outermost first — shown to tell same-named codes apart. */
  path: string[]
}

/** Depth-first list of the code tree, in the order the Code Browser shows it. */
export function flattenCodeTree(codes: Code[], depth = 0, path: string[] = []): FlatCode[] {
  const out: FlatCode[] = []
  for (const code of codes) {
    out.push({ code, depth, path })
    if (code.children?.length) out.push(...flattenCodeTree(code.children, depth + 1, [...path, code.name]))
  }
  return out
}

/** Accent- and case-insensitive match, so "educacao" finds "Educação". */
export function foldForSearch(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}
