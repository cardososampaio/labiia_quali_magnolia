/**
 * The history of the codes as a report for a methods appendix or an audit
 * trail. Someone who did not take part in the analysis should be able to
 * tell, from the report alone, which codes the analysis started and ended
 * with, redo each decision in order (who, when and why), and see where each
 * final code came from.
 *
 * It reads from the general to the detail: a record sheet, a funnel, where
 * each final code came from, the steps in order, the trees of the codes
 * now and at the start, and the codes that left. It is read both as plain
 * text and converted (Word, Obsidian, GitHub): no wide tables; drawings in
 * fixed-width blocks; steps as short numbered lists.
 *
 * Every decision is a numbered step, cited by its number everywhere. Changes
 * made together (an import, a drag of several codes) are one step; an undone
 * change and its undo cite each other.
 */
import { t } from '../i18n'
import type { Code } from '../models/types'
import { type CodeHistory, type CodeRelation, type CodeSnapshot, type HistoryEntry, PATH_SEPARATOR, codeRelations, flattenWithPaths } from './code-history-model'
import { formatWhen } from './code-history-export'

const BATCH_MS = 2000
const NAME_MAX = 48

const width = (s: string) => Array.from(s).length
export const fit = (s: string, max = NAME_MAX) => {
  const chars = Array.from(s.replace(/\s+/g, ' ').trim())
  return chars.length <= max ? chars.join('') : chars.slice(0, max - 1).join('') + '…'
}
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - width(s)))
const md = (s: string) => s.replace(/\r?\n+/g, ' ').replace(/([\\`*_[\]<>|#])/g, '\\$1')
const isUndoRedo = (e: HistoryEntry) => e.origin === 'undo' || e.origin === 'redo'
const SNAPSHOT_ACTIONS = new Set(['start', 'paused', 'resumed'])

// ── Steps ─────────────────────────────────────────────────────────────

export interface Step {
  n: number
  entries: HistoryEntry[]
  /** Undo and redo steps: the decision they undo or redo. */
  reverses?: number
  /** A decision: the steps that undid and redid it. */
  undoneBy?: number[]
  redoneBy?: number[]
}

/**
 * The history as numbered steps. Entries of the same kind, by the same
 * person, from the same source, within two seconds of each other, are one
 * step (an import, several codes dragged at once). An undo step is tied to
 * the latest earlier decision that changed the same code; a redo step to
 * the decision whose latest undo it reverses. Both cite the decision, and
 * the decision cites them.
 */
export function historySteps(history: CodeHistory): Step[] {
  const steps: Step[] = []
  for (const e of history.entries) {
    const last = steps[steps.length - 1]?.entries
    const prev = last?.[last.length - 1]
    const together = prev && !SNAPSHOT_ACTIONS.has(e.action) && prev.action === e.action && prev.origin === e.origin &&
      prev.user === e.user && Math.abs(Date.parse(e.at) - Date.parse(prev.at)) <= BATCH_MS
    if (together) last!.push(e)
    else steps.push({ n: steps.length + 1, entries: [e] })
  }
  const guidsOf = (s: Step) => new Set(s.entries.map((e) => e.codeGuid).filter(Boolean) as string[])
  const isDecision = (s: Step) => !SNAPSHOT_ACTIONS.has(s.entries[0].action) && !isUndoRedo(s.entries[0])
  // A decision is "undone" while it has more undos than redos.
  const undone = (d: Step) => (d.undoneBy?.length ?? 0) > (d.redoneBy?.length ?? 0)
  for (const s of steps) {
    const origin = s.entries[0].origin
    if (origin !== 'undo' && origin !== 'redo') continue
    const mine = guidsOf(s)
    for (let i = s.n - 2; i >= 0; i--) {
      const d = steps[i]
      if (!isDecision(d) || ![...guidsOf(d)].some((g) => mine.has(g))) continue
      if (origin === 'undo' ? undone(d) : !undone(d)) continue
      s.reverses = d.n
      if (origin === 'undo') (d.undoneBy ??= []).push(s.n)
      else (d.redoneBy ??= []).push(s.n)
      break
    }
  }
  return steps
}

/** The step number of each entry. */
function stepOfEntry(steps: Step[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const s of steps) for (const e of s.entries) m.set(e.id, s.n)
  return m
}

// ── Labels ────────────────────────────────────────────────────────────

const R = (key: string, opts?: Record<string, unknown>): string => String(t(`labiia.codeHistory.report.${key}`, opts as never))

/** A counted phrase; zero takes the plural form ("0 códigos"), which some
 *  languages' rules would put in the singular. */
const tc = (key: string, count: number): string => String(t(count === 0 ? `${key}_other` : key, { count } as never))

function stepTitle(s: Step): string {
  const e = s.entries[0]
  let title = t(`labiia.codeHistory.action.${e.action}`)
  if (e.origin === 'undo') title = t('labiia.codeHistory.undone', { action: title })
  if (e.origin === 'redo') title = t('labiia.codeHistory.redone', { action: title })
  if (e.origin === 'zotero') title = R('fromZotero', { action: title })
  else if (e.origin === 'import') title = R('fromCodebook', { action: title })
  else if (e.origin === 'merge' && e.action !== 'merged') title = R('duringMerge', { action: title })
  else if (e.origin === 'projectMerge') title = R('fromProjectMerge', { action: title })
  if (s.entries.length > 1) title += ` (${tc('labiia.codeHistory.chart.codes', s.entries.length)})`
  return title
}

const parentText = (path: string | undefined) => (path ? path : R('topLevel'))

// ── Trees ─────────────────────────────────────────────────────────────

interface TreeNode { name: string; count?: number; children: TreeNode[] }

function drawTree(roots: TreeNode[]): string[] {
  const out: string[] = []
  const label = (n: TreeNode) => (n.count !== undefined ? `${fit(n.name)} (${n.count})` : fit(n.name))
  const walk = (list: TreeNode[], prefix: string) => {
    list.forEach((n, i) => {
      const last = i === list.length - 1
      out.push(`${prefix}${last ? '└── ' : '├── '}${label(n)}`)
      walk(n.children, prefix + (last ? '    ' : '│   '))
    })
  }
  for (const r of roots) {
    out.push(label(r))
    walk(r.children, '')
  }
  return out
}

/** The current codes, each with its coded passages now. */
export function currentTree(codes: Code[], usage?: Map<string, { count: number }>): string[] {
  const toNode = (c: Code): TreeNode => ({ name: c.name, count: usage ? usage.get(c.guid)?.count ?? 0 : undefined, children: (c.children ?? []).map(toNode) })
  return drawTree(codes.map(toNode))
}

/** A tree rebuilt from the paths a snapshot of the codes recorded. */
export function snapshotTree(codes: CodeSnapshot[]): string[] {
  const roots: TreeNode[] = []
  const byPath = new Map<string, TreeNode>()
  for (const c of codes) {
    const node: TreeNode = { name: c.name, children: [] }
    byPath.set(c.path, node)
    const cut = c.path.lastIndexOf(PATH_SEPARATOR)
    const parent = cut > 0 ? byPath.get(c.path.slice(0, cut)) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return drawTree(roots)
}

// ── Where each final code came from ──────────────────────────────────

/**
 * For each current code that something reached (a merge into it, a subcode
 * moved in or created in it) or that was renamed, what reached it and at
 * which step, nested: a subcode that itself received codes shows them under
 * it. A code already shown inside another is not repeated as a root.
 */
export function originsTree(history: CodeHistory, codes: Code[], steps: Step[], usage?: Map<string, { count: number }>): string[] {
  const flat = flattenWithPaths(codes)
  const stepOf = stepOfEntry(steps)
  type Arrival = { text: string; step: number; childGuid?: string }
  const arrivals = new Map<string, Arrival[]>()
  for (const [guid, { code }] of flat) {
    const rel = codeRelations(history, guid, codes)
    const list: Arrival[] = []
    for (const e of history.entries) {
      if (isUndoRedo(e)) continue
      const r: CodeRelation | null = rel(e)
      const step = stepOf.get(e.id) ?? 0
      const stillChild = (g?: string) => !!g && code.children.some((c) => c.guid === g)
      if (r === 'mergedIn') list.push({ text: `${fit(e.codeName ?? '')} ── ${R('arrowMerged')}${e.passages !== undefined ? ` · ${tc('labiia.codeHistory.passages', e.passages)}` : ''}`, step })
      else if (r === 'childIn' && stillChild(e.codeGuid)) list.push({ text: `${fit(e.codeName ?? '')} ── ${R('arrowMovedIn')}`, step, childGuid: e.codeGuid })
      else if (r === 'childCreated' && stillChild(e.codeGuid)) list.push({ text: `+ ${fit(e.codeName ?? '')} ── ${e.origin === 'zotero' ? R('arrowZotero') : e.action === 'imported' ? R('arrowImported') : R('arrowCreated')}`, step, childGuid: e.codeGuid })
      else if (r === 'own' && e.action === 'renamed') list.push({ text: `✎ ${R('arrowRenamed', { name: fit(e.before ?? '') })}`, step })
    }
    if (list.length) arrivals.set(guid, list)
  }
  if (arrivals.size === 0) return [R('noOrigins')]
  const nested = new Set<string>()
  for (const list of arrivals.values()) for (const a of list) if (a.childGuid && arrivals.has(a.childGuid)) nested.add(a.childGuid)
  const out: string[] = []
  const draw = (guid: string, prefix: string, seen: Set<string>) => {
    const list = arrivals.get(guid) ?? []
    list.forEach((a, i) => {
      const last = i === list.length - 1
      out.push(`${prefix}${last ? '└─◄ ' : '├─◄ '}${a.text} ── ${R('step', { n: a.step })}`)
      if (a.childGuid && arrivals.has(a.childGuid) && !seen.has(a.childGuid)) {
        draw(a.childGuid, prefix + (last ? '    ' : '│   '), new Set([...seen, a.childGuid]))
      }
    })
  }
  for (const [guid] of flat) {
    if (!arrivals.has(guid) || nested.has(guid)) continue
    const name = fit(flat.get(guid)!.code.name)
    const count = usage ? `   (${tc('labiia.codeHistory.passages', usage.get(guid)?.count ?? 0)})` : ''
    if (out.length) out.push('')
    out.push(name + count)
    draw(guid, '', new Set([guid]))
  }
  return out
}

// ── Funnel ────────────────────────────────────────────────────────────

export function funnel(history: CodeHistory, codes: Code[]): string[] {
  const start = history.entries.find((e) => e.codes)
  const ops = history.entries.filter((e) => !isUndoRedo(e))
  const n = (...a: string[]) => ops.filter((e) => a.includes(e.action)).length
  const now = flattenWithPaths(codes).size
  const last = history.entries[history.entries.length - 1]
  const left = [R('funnelStart'), tc('labiia.codeHistory.chart.codes', start?.codes?.length ?? 0), start ? formatWhen(start.at) : '']
  const right = [R('funnelNow'), tc('labiia.codeHistory.chart.codes', now), last ? formatWhen(last.at) : '']
  const middle = [
    `+ ${tc('labiia.codeHistory.chart.created', n('created', 'imported'))}   ⇉ ${tc('labiia.codeHistory.chart.merged', n('merged'))}`,
    '─'.repeat(30) + '►',
    `⇢ ${tc('labiia.codeHistory.chart.moved', n('moved'))}   ✎ ${tc('labiia.codeHistory.chart.renamed', n('renamed'))}   × ${tc('labiia.codeHistory.chart.deleted', n('deleted'))}`
  ]
  const lw = Math.max(...left.map(width)) + 2
  const rw = Math.max(...right.map(width)) + 2
  const mw = Math.max(...middle.map(width)) + 4
  const box = (lines: string[], w: number, i: number) => (i === 0 ? `┌${'─'.repeat(w)}┐` : i === 4 ? `└${'─'.repeat(w)}┘` : `│ ${pad(lines[i - 1], w - 1)}│`)
  const out: string[] = []
  for (let i = 0; i < 5; i++) {
    const mid = i >= 1 && i <= 3 ? `  ${pad(middle[i - 1], mw - 2)}` : ' '.repeat(mw)
    out.push(`${box(left, lw, i)}${mid}${box(right, rw, i)}`)
  }
  return out
}

// ── Steps section ─────────────────────────────────────────────────────

function stepLines(s: Step): string[] {
  const out: string[] = []
  const e0 = s.entries[0]
  for (const e of s.entries) {
    const name = md(e.codeName ?? '')
    switch (e.action) {
      case 'start':
      case 'resumed':
        out.push(`- ${tc('labiia.codeHistory.report.codesThen', e.codes?.length ?? 0)}`)
        break
      case 'paused':
        out.push(`- ${R('pausedNote')}`)
        break
      case 'merged':
        out.push(`- ${name} ──► ${md(e.targetName ?? '')}${e.passages !== undefined ? ` · ${tc('labiia.codeHistory.report.recoded', e.passages)}` : ''}`)
        break
      case 'moved':
        out.push(`- ${name}`, `  - ${R('from')}: ${md(parentText(e.before))}`, `  - ${R('to')}: ${md(parentText(e.after))}`)
        break
      case 'renamed':
        out.push(`- “${md(e.before ?? '')}” ══► “${md(e.after ?? '')}”`)
        break
      case 'described':
        out.push(`- ${name}`, `  - ${R('definitionBefore')}: ${md(e.before || t('labiia.codeHistory.empty'))}`, `  - ${R('definitionAfter')}: ${md(e.after || t('labiia.codeHistory.empty'))}`)
        break
      case 'created':
      case 'imported': {
        const cut = e.path?.lastIndexOf(PATH_SEPARATOR) ?? -1
        const where = cut > 0 ? ` (${R('inside', { parent: md(e.path!.slice(0, cut)) })})` : ''
        out.push(`- + ${name}${where}`)
        break
      }
      case 'deleted':
        out.push(`- ${name}${e.passages !== undefined ? ` · ${tc('labiia.codeHistory.passages', e.passages)}` : ''}`)
        break
    }
  }
  const reasons = s.entries.filter((e) => e.justification?.trim())
  // Undo and redo answer to the decision they reverse; only that decision asks for a reason.
  if (!SNAPSHOT_ACTIONS.has(e0.action) && !isUndoRedo(e0)) {
    if (reasons.length === 0) out.push(`- ${R('justification')}: ${R('noJustification')}`)
    else if (s.entries.length === 1) out.push(`- ${R('justification')}: ${md(reasons[0].justification!.trim())}`)
    else for (const e of reasons) out.push(`- ${R('justification')} (${md(e.codeName ?? '')}): ${md(e.justification!.trim())}`)
  } else {
    for (const e of reasons) out.push(`- ${R('justification')}: ${md(e.justification!.trim())}`)
  }
  return out
}

function stepsSection(steps: Step[]): string[] {
  const out: string[] = []
  for (const s of steps) {
    const e = s.entries[0]
    let head = `**${R('stepTitle', { n: s.n })} — ${md(stepTitle(s))}** · ${formatWhen(e.at)} · ${md(e.user || '—')}`
    if (s.undoneBy?.length) head += ` · ${R('undoneIn', { steps: s.undoneBy.join(', ') })}`
    if (s.redoneBy?.length) head += ` · ${R('redoneIn', { steps: s.redoneBy.join(', ') })}`
    if (s.reverses) head += ` · ${R(e.origin === 'undo' ? 'undoes' : 'redoes', { n: s.reverses })}`
    out.push(head, '', ...stepLines(s), '')
  }
  return out
}

// ── Codes that left ───────────────────────────────────────────────────

function goneSection(history: CodeHistory, codes: Code[], steps: Step[]): string[] {
  const flat = flattenWithPaths(codes)
  const stepOf = stepOfEntry(steps)
  const last = new Map<string, HistoryEntry>()
  for (const e of history.entries) {
    if (e.codeGuid && (e.action === 'deleted' || e.action === 'merged')) last.set(e.codeGuid, e)
  }
  const out: string[] = []
  for (const [guid, e] of last) {
    if (flat.has(guid)) continue
    const n = stepOf.get(e.id) ?? 0
    out.push(e.action === 'merged'
      ? `- ${md(e.codeName ?? '')}: ${R('goneMerged', { target: md(e.targetName ?? ''), n })}`
      : `- ${md(e.codeName ?? '')}: ${R('goneDeleted', { n })}${e.passages !== undefined ? ` · ${tc('labiia.codeHistory.passages', e.passages)}` : ''}`)
  }
  return out.length ? out : [R('noneGone')]
}

// ── The report ────────────────────────────────────────────────────────

const fence = (lines: string[]) => ['```text', ...lines, '```']

export function historyToMarkdown(
  history: CodeHistory,
  projectName: string,
  codes: Code[],
  usage?: Map<string, { count: number }>,
  now = new Date(),
  appVersion = ''
): string {
  const steps = historySteps(history)
  const entries = history.entries
  // Undo and redo are not decisions of their own: they are cited on the decision they reverse.
  const decisions = steps.filter((s) => !SNAPSHOT_ACTIONS.has(s.entries[0].action) && !isUndoRedo(s.entries[0]))
  const ops = entries.filter((e) => !SNAPSHOT_ACTIONS.has(e.action) && !isUndoRedo(e))
  const start = entries.find((e) => e.codes)
  const people = [...new Set(entries.map((e) => e.user).filter(Boolean))]
  const byAction = ['merged', 'moved', 'renamed', 'described', 'created', 'imported', 'deleted']
    .map((a) => [a, ops.filter((e) => e.action === a).length] as const)
    .filter(([, n]) => n > 0)
    .map(([a, n]) => `${t(`labiia.codeHistory.action.${a}`)}: ${n}`)

  const out: string[] = []
  out.push(`# ${t('labiia.codeHistory.reportTitle', { project: md(projectName) })}`, '')
  out.push(`> ${R('howToRead')}`, '')

  out.push(`## 1. ${R('sheet')}`, '')
  out.push(`- ${R('project')}: ${md(projectName)}`)
  if (entries.length) out.push(`- ${R('period', { from: formatWhen(entries[0].at), to: formatWhen(entries[entries.length - 1].at) })}`)
  out.push(`- ${R('people')}: ${people.length ? people.map(md).join(', ') : '—'}`)
  out.push(`- ${R('codesStartNow', { start: start?.codes?.length ?? 0, now: flattenWithPaths(codes).size })}`)
  out.push(`- ${tc('labiia.codeHistory.report.decisions', decisions.length)}${byAction.length ? ` (${byAction.join(', ')})` : ''}`)
  const undone = steps.filter((s) => (s.undoneBy?.length ?? 0) > (s.redoneBy?.length ?? 0)).length
  if (undone) out.push(`- ${R('undoneCount', { count: undone })}`)
  const unjustified = decisions.filter((s) => !s.entries.some((e) => e.justification?.trim())).length
  out.push(`- ${R('unjustified', { count: unjustified, total: decisions.length })}`)
  out.push(`- ${R('exported', { when: formatWhen(now.toISOString()) })}${appVersion ? ` · labiia_quali ${appVersion}` : ''}`)
  out.push(`- ${R('csvNote')}`, '')

  out.push(`## 2. ${R('funnel')}`, '', ...fence(funnel(history, codes)), '')

  out.push(`## 3. ${R('origins')}`, '', R('originsHelp'), '', ...fence(originsTree(history, codes, steps, usage)), '')

  out.push(`## 4. ${R('steps')}`, '')
  if (steps.length === 0) out.push(t('labiia.codeHistory.emptyHistory'), '')
  out.push(...stepsSection(steps))

  out.push(`## 5. ${R('treeNow', { count: flattenWithPaths(codes).size })}`, '')
  if (usage) out.push(R('treeNowHelp'), '')
  out.push(...fence(codes.length ? currentTree(codes, usage) : [t('labiia.codeHistory.reportNoCodes')]), '')

  out.push(`## 6. ${R('gone')}`, '', ...goneSection(history, codes, steps), '')

  out.push(`## ${R('appendixStart', { count: start?.codes?.length ?? 0 })}`, '')
  out.push(...fence(start?.codes?.length ? snapshotTree(start.codes) : [t('labiia.codeHistory.reportNoCodes')]), '')

  out.push(`## ${R('appendixLegend')}`, '', ...fence([
    `──►   ${pad(R('legendMerged'), 34)}└─◄   ${R('legendArrived')}`,
    `══►   ${pad(R('legendRenamed'), 34)}+     ${R('legendCreated')}`,
    `──×   ${pad(R('legendDeleted'), 34)}(n)   ${R('legendCount')}`
  ]), '')

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
