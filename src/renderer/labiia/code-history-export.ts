/**
 * The history of the codes taken out of the program, for a methods appendix
 * or for review by other researchers:
 *
 * - a spreadsheet (CSV), one row per change, that opens in Excel with its
 *   accents (the save adds a UTF-8 BOM);
 * - a report (Markdown) for a methods appendix (see code-history-report.ts).
 */
import { formatDateTime, t } from '../i18n'
import type { Code } from '../models/types'
import { toCsv } from '../components/Analysis/analysis-helpers'
import { historyToMarkdown } from './code-history-report'
import { computeCodeUsage } from './code-panel-view'
import { useDocumentStore } from '../stores/document-store'
import type { CodeHistory, CodeRelation, HistoryEntry } from './code-history-model'

/** Date and time as the researcher reads them, in the program's language
 *  (24/11/2026 20:37 in Portuguese). */
export function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return formatDateTime(d, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')
}

/** Year-month-day hour:minute, for the spreadsheet, which sorts it as text. */
export function sortableWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function actionLabel(e: HistoryEntry): string {
  const base = t(`labiia.codeHistory.action.${e.action}`)
  if (e.origin === 'undo') return t('labiia.codeHistory.undone', { action: base })
  if (e.origin === 'redo') return t('labiia.codeHistory.redone', { action: base })
  return base
}

/** The change as one code sees it: a subcode moved into it reads
 *  "Subcode added", a code merged into it "Received a merge". */
export function relationLabel(e: HistoryEntry, rel: CodeRelation | null): string {
  if (!rel || rel === 'own') return actionLabel(e)
  const base = t(`labiia.codeHistory.relation.${rel}`)
  if (e.origin === 'undo') return t('labiia.codeHistory.undone', { action: base })
  if (e.origin === 'redo') return t('labiia.codeHistory.redone', { action: base })
  return base
}

/** "Before → after" as one code sees it. */
export function relationChange(e: HistoryEntry, rel: CodeRelation | null): string {
  const top = t('labiia.codeHistory.relation.topLevel')
  switch (rel) {
    case 'childIn': return t('labiia.codeHistory.relation.cameFrom', { from: e.before || top })
    case 'childOut': return t('labiia.codeHistory.relation.wentTo', { to: e.after || top })
    case 'mergedIn': case 'childCreated': case 'childDeleted': case 'existed': return ''
    default: return changeText(e)
  }
}

export function originLabel(e: HistoryEntry): string {
  return t(`labiia.codeHistory.origin.${e.origin}`)
}

/** What the entry says beyond the code's name: the codes recorded at the
 *  start or on resuming, the passages of a merge or deletion. */
export function entryDetails(e: HistoryEntry): string {
  if (e.codes) return t('labiia.codeHistory.codesAtThatMoment', { count: e.codes.length })
  if (e.passages !== undefined) return t('labiia.codeHistory.passages', { count: e.passages })
  return ''
}

/** Spreadsheet programs read a cell starting with = + @ as a formula. */
function cell(v: string | undefined): string {
  const s = (v ?? '').replace(/\r\n?/g, '\n')
  return /^[=+@]/.test(s) ? `'${s}` : s
}

export function historyToCsv(history: CodeHistory): string {
  const header = ['date', 'user', 'action', 'origin', 'code', 'path', 'before', 'after', 'details', 'justification', 'codeGuid'].map((k) => t(`labiia.codeHistory.column.${k}`))
  const rows = history.entries.map((e) => [
    sortableWhen(e.at), e.user, actionLabel(e), originLabel(e), e.codeName, e.path, e.before, e.after,
    e.codes ? e.codes.map((c) => c.path).join(' | ') : entryDetails(e), e.justification, e.codeGuid
  ].map(cell))
  return toCsv([header, ...rows])
}

/** What a line shows under "Before → after", as in the history window. */
export function changeText(e: HistoryEntry): string {
  const empty = t('labiia.codeHistory.empty')
  if (e.action === 'merged') return `→ ${e.targetName ?? ''}`
  if (e.before !== undefined && e.after !== undefined) return `${e.before || empty} → ${e.after || empty}`
  if (e.after !== undefined) return e.after
  if (e.before !== undefined) return e.before
  return ''
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function safeName(name: string): string {
  return (name || 'projeto').replace(/[\\/:*?"<>|]+/g, '_').trim()
}

export async function exportHistoryCsv(history: CodeHistory, projectName: string): Promise<void> {
  await window.api.exportCsv(historyToCsv(history), `${safeName(projectName)} - ${t('labiia.codeHistory.fileName')}.csv`)
}

export async function exportHistoryMarkdown(history: CodeHistory, projectName: string, codes: Code[]): Promise<void> {
  await window.api.lexical.saveFile({
    name: `${safeName(projectName)} - ${t('labiia.codeHistory.fileName')}.md`,
    mime: 'text/markdown',
    // The coded passages of each code now, so the report shows the weight of each one.
    data: toBase64(historyToMarkdown(history, projectName, codes, computeCodeUsage(codes, useDocumentStore.getState().sources as never[], false), new Date(), __APP_VERSION__))
  })
}
