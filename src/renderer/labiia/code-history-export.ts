/**
 * The history of the codes taken out of the program, for a methods appendix
 * or for review by other researchers:
 *
 * - a spreadsheet (CSV), one row per change, that opens in Excel with its
 *   accents (the save adds a UTF-8 BOM);
 * - a report (Markdown) with the project, the period covered, a timeline
 *   grouped by day and, at the end, each current code with its own history.
 */
import { t } from '../i18n'
import type { Code } from '../models/types'
import { toCsv } from '../components/Analysis/analysis-helpers'
import { type CodeHistory, type HistoryEntry, flattenWithPaths } from './code-history-model'

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

function describeLine(e: HistoryEntry): string {
  const who = e.user ? ` — ${mdEscape(e.user)}` : ''
  const time = formatWhen(e.at).slice(11)
  const parts = [`**${actionLabel(e)}**`]
  if (e.path) parts.push(mdEscape(e.path))
  if (e.before !== undefined && e.after !== undefined && e.action !== 'merged') {
    parts.push(`(${mdEscape(e.before || t('labiia.codeHistory.empty'))} → ${mdEscape(e.after || t('labiia.codeHistory.empty'))})`)
  } else if (e.action === 'merged' && e.targetName) {
    parts.push(`→ ${mdEscape(e.targetName)}`)
  }
  const details = entryDetails(e)
  if (details) parts.push(`· ${details}`)
  if (e.origin !== 'edit' && e.origin !== 'undo' && e.origin !== 'redo') parts.push(`· ${originLabel(e)}`)
  let line = `- ${time}${who}: ${parts.join(' ')}`
  if (e.justification) line += `\n  - ${t('labiia.codeHistory.column.justification')}: ${mdEscape(e.justification)}`
  return line
}

export function historyToMarkdown(history: CodeHistory, projectName: string, codes: Code[]): string {
  const out: string[] = []
  out.push(`# ${t('labiia.codeHistory.reportTitle', { project: projectName })}`, '')
  const entries = history.entries
  if (entries.length > 0) {
    out.push(t('labiia.codeHistory.reportPeriod', { from: formatWhen(entries[0].at), to: formatWhen(entries[entries.length - 1].at) }))
  }
  const changes = entries.filter((e) => !['start', 'paused', 'resumed'].includes(e.action)).length
  out.push(t('labiia.codeHistory.reportCount', { count: changes }), '')
  out.push(`## ${t('labiia.codeHistory.reportTimeline')}`, '')
  let day = ''
  for (const e of entries) {
    const d = formatWhen(e.at).slice(0, 10)
    if (d !== day) {
      day = d
      out.push('', `### ${d}`, '')
    }
    out.push(describeLine(e))
    if (e.codes && e.codes.length > 0) {
      for (const c of e.codes) out.push(`  - ${mdEscape(c.path)}`)
    }
  }
  out.push('', `## ${t('labiia.codeHistory.reportByCode')}`, '')
  for (const [guid, { path }] of flattenWithPaths(codes)) {
    const own = entries.filter((e) => e.codeGuid === guid || e.targetGuid === guid)
    out.push(`### ${mdEscape(path)}`, '')
    if (own.length === 0) out.push(t('labiia.codeHistory.reportNoChanges'))
    for (const e of own) out.push(`- ${formatWhen(e.at)}: ${describeLine(e).replace(/^- \S+ /, '')}`)
    out.push('')
  }
  return out.join('\n') + '\n'
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
