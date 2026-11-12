/**
 * Turns what the program found about itself (`labiia_diagnostics`, see
 * src-tauri/src/labiia/diagnostics.rs) into the checklist the diagnostics
 * window shows and the text report a researcher copies and sends.
 *
 * Each item says whether that part works and, when it does not, what to do.
 * The report ends with the raw data, so whoever fixes the problem sees
 * exactly what the program saw. It carries folder paths and versions, never
 * a project's text.
 */
import { t } from '../i18n'

export type CheckState = 'ok' | 'warn' | 'bad'

export interface DiagnosticItem {
  id: string
  state: CheckState
  title: string
  detail: string
  /** What to do about it; empty when nothing is needed. */
  advice: string
}

interface HelperReply<T> { ok?: T; error?: string }

interface SelfCheck {
  node?: string
  system?: { platform: string; release: string; arch: string }
  missingResources?: string[]
  dataWritable?: boolean
  tempDir?: string
  tempWritable?: boolean
  locale?: Record<string, string | null>
  r?: {
    found: boolean
    installation?: { rscript: string; version: string; libDir: string }
    configuredPath: string
    problem?: string
    searched?: Array<{ path: string; version: string | null }>
  }
  packages?: Record<string, boolean> | null
  packageError?: string | null
}

export interface DiagnosticsData {
  program: {
    version: string
    os: string
    osVersion: string
    arch: string
    machine: string
    executable: string | null
    resourceDir: string | null
    dataDir: string
    dataWritable: boolean
  }
  node: { found: string | null; lookedIn: string[] }
  helperScript: string | null
  lexicalResources: string | null
  ping: HelperReply<{ node?: string; missingResources?: string[] }>
  selfCheck: HelperReply<SelfCheck>
  libreOffice: string | null
  crash: string | null
  logs: { folder: string; program: string[]; helper: string[] }
}

const systemName = (os: string): string => (os === 'macos' ? 'macOS' : os === 'windows' ? 'Windows' : os)

/** Whether a helper error means the bundled program was stopped by the
 *  system (a Mac's security check, an antivirus) rather than missing. */
function blockedBySystem(error: string): boolean {
  return /permission denied|os error 13|operation not permitted|not permitted|killed|bad cpu type|os error 86/i.test(error)
}

export function diagnosticItems(d: DiagnosticsData): DiagnosticItem[] {
  const items: DiagnosticItem[] = []
  const mac = d.program.os === 'macos'
  const self = d.selfCheck.ok

  items.push({
    id: 'program',
    state: 'ok',
    title: t('labiia.diagnostics.program'),
    detail: `labiia_quali ${d.program.version} · ${systemName(d.program.os)} ${d.program.osVersion} · ${d.program.machine}`,
    advice: ''
  })

  items.push({
    id: 'data',
    state: d.program.dataWritable ? 'ok' : 'bad',
    title: t('labiia.diagnostics.dataFolder'),
    detail: d.program.dataDir,
    advice: d.program.dataWritable ? '' : t('labiia.diagnostics.dataFolderNotWritable')
  })

  // The helper: the bundled Node, its script and the lexical files.
  let helperState: CheckState = 'ok'
  let helperDetail = d.ping.ok?.node ? t('labiia.diagnostics.helperRunning', { version: d.ping.ok.node }) : ''
  let helperAdvice = ''
  if (!d.node.found) {
    helperState = 'bad'
    helperDetail = t('labiia.diagnostics.nodeMissing')
    helperAdvice = t('labiia.diagnostics.reinstall')
  } else if (!d.helperScript || !d.lexicalResources) {
    helperState = 'bad'
    helperDetail = t('labiia.diagnostics.helperFilesMissing')
    helperAdvice = t('labiia.diagnostics.reinstall')
  } else if (d.ping.error) {
    helperState = 'bad'
    helperDetail = d.ping.error
    helperAdvice = blockedBySystem(d.ping.error)
      ? t(mac ? 'labiia.diagnostics.helperBlockedMac' : 'labiia.diagnostics.helperBlockedWindows')
      : t('labiia.diagnostics.reinstall')
  }
  items.push({ id: 'helper', state: helperState, title: t('labiia.diagnostics.helper'), detail: helperDetail, advice: helperAdvice })

  const missing = self?.missingResources ?? d.ping.ok?.missingResources ?? []
  if (helperState === 'ok') {
    items.push({
      id: 'resources',
      state: missing.length ? 'bad' : 'ok',
      title: t('labiia.diagnostics.resources'),
      detail: missing.length ? t('labiia.diagnostics.resourcesMissing', { list: missing.join(', ') }) : d.lexicalResources ?? '',
      advice: missing.length ? t('labiia.diagnostics.reinstall') : ''
    })
    if (self && self.tempWritable === false) {
      items.push({
        id: 'temp',
        state: 'bad',
        title: t('labiia.diagnostics.tempFolder'),
        detail: self.tempDir ?? '',
        advice: t('labiia.diagnostics.tempFolderNotWritable')
      })
    }
  }

  // R and its packages.
  const r = self?.r
  if (!self) {
    items.push({
      id: 'r',
      state: 'warn',
      title: 'R',
      detail: t('labiia.diagnostics.rNotChecked'),
      advice: ''
    })
  } else if (r?.found && r.installation) {
    items.push({
      id: 'r',
      state: 'ok',
      title: 'R',
      detail: `R ${r.installation.version} — ${r.installation.rscript}`,
      advice: ''
    })
    const absent = Object.entries(self.packages ?? {}).filter(([, ok]) => !ok).map(([p]) => p)
    items.push({
      id: 'packages',
      state: self.packageError || absent.length ? 'warn' : 'ok',
      title: t('labiia.diagnostics.rPackages'),
      detail: self.packageError
        ? self.packageError
        : absent.length
          ? t('labiia.diagnostics.packagesMissing', { n: absent.length, list: absent.join(', ') })
          : t('labiia.diagnostics.packagesAllPresent'),
      advice: absent.length || self.packageError ? t('labiia.diagnostics.packagesAdvice') : ''
    })
  } else {
    const looked = (r?.searched ?? []).length
    items.push({
      id: 'r',
      state: 'bad',
      title: 'R',
      detail: r?.problem === 'not-runnable'
        ? t('labiia.lexical.theRscriptChosenInPreferences')
        : r?.problem === 'too-old'
          ? t('labiia.lexical.thisRIsTooOld')
          : t('labiia.diagnostics.rNotFound', { places: looked }),
      advice: t(mac ? 'labiia.diagnostics.rAdviceMac' : 'labiia.diagnostics.rAdviceWindows')
    })
  }

  items.push({
    id: 'libreoffice',
    state: d.libreOffice ? 'ok' : 'warn',
    title: 'LibreOffice',
    detail: d.libreOffice ?? t('labiia.diagnostics.libreOfficeMissing'),
    advice: ''
  })

  if (d.crash) {
    items.push({
      id: 'crash',
      state: 'warn',
      title: t('labiia.diagnostics.lastCrash'),
      detail: d.crash.split('\n')[0],
      advice: t('labiia.diagnostics.lastCrashAdvice')
    })
  }
  return items
}

const MARK: Record<CheckState, string> = { ok: '✓', warn: '!', bad: '✗' }

/** The text the Copy and Save buttons produce. */
export function diagnosticReport(d: DiagnosticsData, items: DiagnosticItem[], when: Date = new Date()): string {
  const lines: string[] = [
    t('labiia.diagnostics.reportTitle'),
    `${when.toISOString()}`,
    ''
  ]
  for (const i of items) {
    lines.push(`${MARK[i.state]} ${i.title}: ${i.detail}`)
    if (i.advice) lines.push(`    → ${i.advice}`)
  }
  const r = d.selfCheck.ok?.r
  if (r?.searched?.length) {
    lines.push('', t('labiia.diagnostics.rLookedIn'))
    for (const s of r.searched) lines.push(`  ${s.version ? `R ${s.version}` : '—'}  ${s.path}`)
  }
  if (!d.node.found) {
    lines.push('', t('labiia.diagnostics.nodeLookedIn'))
    for (const p of d.node.lookedIn) lines.push(`  ${p}`)
  }
  if (d.crash) lines.push('', '── crash ──', d.crash.trim())
  lines.push('', `── ${t('labiia.diagnostics.programLog')} ──`, ...(d.logs.program.length ? d.logs.program : ['—']))
  lines.push('', `── ${t('labiia.diagnostics.helperLog')} ──`, ...(d.logs.helper.length ? d.logs.helper : ['—']))
  lines.push('', `── ${t('labiia.diagnostics.technicalData')} ──`, JSON.stringify({ ...d, logs: { folder: d.logs.folder } }, null, 2))
  return lines.join('\n') + '\n'
}
