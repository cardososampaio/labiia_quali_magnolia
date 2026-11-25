/**
 * The history of the codes taken out of the program, for a methods appendix
 * or for review by other researchers:
 *
 * - a spreadsheet (CSV), one row per change, that opens in Excel with its
 *   accents (the save adds a UTF-8 BOM);
 * - a report (Markdown) that reads step by step like the history window:
 *   a summary, the timeline in tables by day, the codes when the record
 *   began, each current code with its own history, and the codes that no
 *   longer exist.
 */
import { t } from '../i18n'
import type { Code } from '../models/types'
import { toCsv } from '../components/Analysis/analysis-helpers'
import { type CodeHistory, type HistoryEntry, HISTORY_ACTIONS, PATH_SEPARATOR, entriesForCode, flattenWithPaths } from './code-history-model'

/** Local date and time, as the researcher reads it. */
export function formatWhen(iso: string): string {
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
    formatWhen(e.at), e.user, actionLabel(e), originLabel(e), e.codeName, e.path, e.before, e.after,
    e.codes ? e.codes.map((c) => c.path).join(' | ') : entryDetails(e), e.justification, e.codeGuid
  ].map(cell))
  return toCsv([header, ...rows])
}

function mdEscape(s: string): string {
  return s.replace(/([\\`*_[\]|<>])/g, '\\$1').replace(/\r?\n/g, ' ')
}

/** Text safe inside a Markdown table cell: one line, no column breaks. */
function cellText(s: string | undefined): string {
  return (s ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n').map((l) => l.trim()).filter(Boolean).join(' / ')
    .replace(/([\\`*_[\]<>|])/g, '\\$1')
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

function tableRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`
}

/** One table of entries, oldest first: one line per step of the coding. */
function entriesTable(entries: HistoryEntry[], focusGuid?: string): string[] {
  const head = ['date', 'user', 'action', 'code', 'change', 'details', 'justification'].map((k) => t(`labiia.codeHistory.column.${k}`))
  const out = [tableRow(head), tableRow(head.map(() => '---'))]
  for (const e of entries) {
    const action = e.origin !== 'edit' && e.origin !== 'undo' && e.origin !== 'redo'
      ? `**${cellText(actionLabel(e))}** (${cellText(originLabel(e))})`
      : `**${cellText(actionLabel(e))}**`
    let code = ''
    if (e.codes) {
      const was = focusGuid ? e.codes.find((c) => c.guid === focusGuid) : undefined
      code = was ? cellText(t('labiia.codeHistory.alreadyExisted', { path: was.path })) : ''
    } else if (e.codeName) {
      code = cellText(e.codeName)
      if (e.path && e.path !== e.codeName) code += ` (${cellText(e.path)})`
    }
    out.push(tableRow([formatWhen(e.at), cellText(e.user) || '—', action, code, cellText(changeText(e)), cellText(entryDetails(e)), cellText(e.justification)]))
  }
  return out
}

/** The codes as a nested list, from their paths. */
function codeList(codes: { path: string }[]): string[] {
  return codes.map((c) => {
    const parts = c.path.split(PATH_SEPARATOR)
    return `${'  '.repeat(parts.length - 1)}- ${mdEscape(parts[parts.length - 1])}`
  })
}

export function historyToMarkdown(history: CodeHistory, projectName: string, codes: Code[], now = new Date()): string {
  const out: string[] = []
  const entries = history.entries
  const changes = entries.filter((e) => !['start', 'paused', 'resumed'].includes(e.action))
  const flat = flattenWithPaths(codes)

  out.push(`# ${t('labiia.codeHistory.reportTitle', { project: mdEscape(projectName) })}`, '')
  if (entries.length > 0) {
    out.push(`- ${t('labiia.codeHistory.reportPeriod', { from: formatWhen(entries[0].at), to: formatWhen(entries[entries.length - 1].at) })}`)
  }
  out.push(`- ${t('labiia.codeHistory.reportExported', { when: formatWhen(now.toISOString()) })}`)
  const people = [...new Set(changes.map((e) => e.user).filter(Boolean))]
  if (people.length) out.push(`- ${t('labiia.codeHistory.reportPeople', { names: people.map(mdEscape).join(', ') })}`)
  out.push(`- ${t('labiia.codeHistory.reportCurrentCodes', { count: flat.size })}`)
  out.push(`- ${t('labiia.codeHistory.reportCount', { count: changes.length })}`, '')

  // Summary: how many changes of each kind.
  out.push(`## ${t('labiia.codeHistory.reportSummary')}`, '')
  out.push(tableRow([t('labiia.codeHistory.column.action'), t('labiia.codeHistory.reportHowMany')]), tableRow(['---', '---:']))
  for (const a of HISTORY_ACTIONS) {
    if (a === 'start' || a === 'paused' || a === 'resumed') continue
    const n = changes.filter((e) => e.action === a && e.origin !== 'undo' && e.origin !== 'redo').length
    if (n > 0) out.push(tableRow([t(`labiia.codeHistory.action.${a}`), String(n)]))
  }
  const undone = changes.filter((e) => e.origin === 'undo' || e.origin === 'redo').length
  if (undone > 0) out.push(tableRow([t('labiia.codeHistory.reportUndoRedo'), String(undone)]))
  out.push('')

  // Timeline, step by step, one table per day.
  out.push(`## ${t('labiia.codeHistory.reportTimeline')}`, '')
  if (entries.length === 0) out.push(t('labiia.codeHistory.emptyHistory'), '')
  const days = new Map<string, HistoryEntry[]>()
  for (const e of entries) {
    const d = formatWhen(e.at).slice(0, 10)
    days.set(d, [...(days.get(d) ?? []), e])
  }
  for (const [day, list] of days) out.push(`### ${day}`, '', ...entriesTable(list), '')

  // The codes when the record began, and at each resume.
  const snapshots = entries.filter((e) => e.codes)
  if (snapshots.length > 0) {
    out.push(`## ${t('labiia.codeHistory.reportSnapshots')}`, '')
    for (const e of snapshots) {
      out.push(`### ${actionLabel(e)} — ${formatWhen(e.at)}`, '')
      out.push(...(e.codes!.length ? codeList(e.codes!) : [t('labiia.codeHistory.reportNoCodes')]), '')
    }
  }

  // Each current code, in the order of the tree, with its own history.
  out.push(`## ${t('labiia.codeHistory.reportByCode')}`, '')
  for (const [guid, { path }] of flat) {
    out.push(`### ${mdEscape(path)}`, '')
    const own = entriesForCode(history, guid, codes).filter((e) => !e.codes)
    if (own.length === 0) out.push(t('labiia.codeHistory.reportNoChanges'), '')
    else out.push(...entriesTable(own, guid), '')
  }

  // Codes that no longer exist: deleted or merged into another.
  const gone = new Map<string, string>()
  for (const e of entries) {
    if (e.codeGuid && !flat.has(e.codeGuid) && (e.action === 'deleted' || e.action === 'merged')) gone.set(e.codeGuid, e.path || e.codeName || '')
  }
  if (gone.size > 0) {
    out.push(`## ${t('labiia.codeHistory.reportGone')}`, '')
    for (const [guid, path] of gone) {
      out.push(`### ${mdEscape(path)}`, '')
      out.push(...entriesTable(entries.filter((e) => e.codeGuid === guid)), '')
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
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
    data: toBase64(historyToMarkdown(history, projectName, codes))
  })
}
