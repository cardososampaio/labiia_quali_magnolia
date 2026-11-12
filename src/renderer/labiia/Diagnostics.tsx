/**
 * Help → Program diagnostics, and the notice shown when the program opens
 * with a part missing or after it closed unexpectedly.
 *
 * The window lists each part of the program with ✓ (works), ! (works, with
 * a caveat) or ✗ (does not work) and what to do. "Copy report" and "Save
 * report…" produce a text a researcher can send to whoever maintains the
 * program, so a problem on a computer nobody on the team can reach (a Mac,
 * say) can still be fixed. The report holds versions, folder paths and
 * error messages, never a project's text.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { t } from '../i18n'
import { LEXICAL_R_PACKAGES } from '../models/lexical-api'
import { diagnosticItems, diagnosticReport, type DiagnosticItem, type DiagnosticsData } from './diagnostics-report'

// ── Opening the window from anywhere (Start menu, Help menu, error messages) ──

let open = false
const listeners = new Set<() => void>()
const setOpen = (v: boolean): void => {
  open = v
  for (const l of listeners) l()
}
export const openDiagnostics = (): void => setOpen(true)
const useOpen = (): boolean =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => open)

/** A "See diagnostics" button, for error messages. */
export function DiagnosticsButton(): JSX.Element {
  return (
    <button type="button" className="secondary lex-small-btn" onClick={openDiagnostics}>
      {t('labiia.diagnostics.seeDiagnostics')}
    </button>
  )
}

const ALL_PACKAGES = [...new Set(Object.values(LEXICAL_R_PACKAGES).flat())].sort()

function base64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Some webviews refuse the clipboard API; the old way still works there.
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}

const MARK = { ok: '✓', warn: '!', bad: '✗' } as const

function ItemRow({ item }: { item: DiagnosticItem }): JSX.Element {
  return (
    <li className={`labiia-diag-item labiia-diag-${item.state}`} data-check={item.id} data-state={item.state}>
      <span className="labiia-diag-mark" aria-hidden>{MARK[item.state]}</span>
      <div className="labiia-diag-text">
        <div className="labiia-diag-title">{item.title}</div>
        {item.detail && <div className="labiia-diag-detail">{item.detail}</div>}
        {item.advice && <div className="labiia-diag-advice">{item.advice}</div>}
      </div>
    </li>
  )
}

function DiagnosticsDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [data, setData] = useState<DiagnosticsData | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const load = (): void => {
    setData(null)
    setFailed(null)
    setNote('')
    invoke<DiagnosticsData>('labiia_diagnostics', { packages: ALL_PACKAGES })
      .then(setData)
      .catch((e) => setFailed(String(e)))
  }
  useEffect(load, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const items = data ? diagnosticItems(data) : []
  const report = data ? diagnosticReport(data, items) : failed ? `${t('labiia.diagnostics.reportTitle')}\n${failed}\n` : ''

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal labiia-diag" role="dialog" aria-label={t('labiia.diagnostics.title')} onClick={(e) => e.stopPropagation()}>
        <h2>{t('labiia.diagnostics.title')}</h2>
        <p className="labiia-diag-intro">{t('labiia.diagnostics.intro')}</p>
        {!data && !failed && <p className="labiia-diag-wait">{t('labiia.diagnostics.checking')}</p>}
        {failed && <p className="labiia-diag-bad">{failed}</p>}
        {data && (
          <ul className="labiia-diag-list">
            {items.map((i) => <ItemRow key={i.id} item={i} />)}
          </ul>
        )}
        {note && <p className="labiia-diag-note" role="status">{note}</p>}
        <div className="labiia-diag-buttons">
          <button type="button" disabled={!report} onClick={() => {
            void copyText(report).then((ok) => setNote(ok ? t('labiia.diagnostics.copied') : t('labiia.diagnostics.copyFailed')))
          }}>
            {t('labiia.diagnostics.copyReport')}
          </button>
          <button type="button" className="secondary" disabled={!report} onClick={() => {
            void window.api.lexical
              .saveFile({ name: 'labiia_quali-diagnostico.txt', mime: 'text/plain', data: base64(report) })
              .then((saved) => { if (saved) setNote(t('labiia.diagnostics.saved')) })
              .catch((e) => setNote(String(e)))
          }}>
            {t('labiia.diagnostics.saveReport')}
          </button>
          <button type="button" className="secondary" onClick={() => { void invoke('labiia_open_logs_folder').catch((e) => setNote(String(e))) }}>
            {t('labiia.diagnostics.openLogs')}
          </button>
          <button type="button" className="secondary" disabled={!data && !failed} onClick={load}>
            {t('labiia.diagnostics.checkAgain')}
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="secondary" onClick={onClose}>{t('labiia.diagnostics.close')}</button>
        </div>
      </div>
    </div>
  )
}

interface StartupCheck { problem: string | null; crash: string | null }

// Checked once per window: the main window reopens with each project.
let startupCheck: Promise<StartupCheck> | null = null

/** A notice along the top: a part of the program that did not start, or a crash last time. */
function StartupNotice(): JSX.Element | null {
  const [check, setCheck] = useState<StartupCheck | null>(null)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    // After the window has settled, so the check does not slow the opening.
    const timer = setTimeout(() => {
      startupCheck ??= invoke<StartupCheck>('labiia_startup_check').catch((e) => ({ problem: String(e), crash: null }))
      void startupCheck.then(setCheck)
    }, 1500)
    return () => clearTimeout(timer)
  }, [])
  if (hidden || !check || (!check.problem && !check.crash)) return null
  const problem = !!check.problem
  return (
    <div className={`labiia-startup-notice ${problem ? 'is-bad' : ''}`} role="alert" data-notice={problem ? 'problem' : 'crash'}>
      <span aria-hidden className="labiia-startup-mark">⚠</span>
      <div className="labiia-startup-text">
        <strong>{t(problem ? 'labiia.diagnostics.startupProblem' : 'labiia.diagnostics.startupCrash')}</strong>
        <span>{t(problem ? 'labiia.diagnostics.startupProblemText' : 'labiia.diagnostics.startupCrashText')}</span>
      </div>
      <button type="button" onClick={() => { setHidden(true); openDiagnostics() }}>{t('labiia.diagnostics.seeDiagnostics')}</button>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          setHidden(true)
          if (!problem) void invoke('labiia_dismiss_crash')
        }}
      >
        {t(problem ? 'labiia.diagnostics.close' : 'labiia.diagnostics.dontShowAgain')}
      </button>
    </div>
  )
}

/** Mounted once in the main window: the notice, the window, and Help → Program diagnostics. */
export function LabiiaDiagnostics(): JSX.Element {
  const isOpen = useOpen()
  useEffect(() => window.api.onMenuAction((action) => { if (action === 'labiia-diagnostics') openDiagnostics() }), [])
  return (
    <>
      <StartupNotice />
      {isOpen && <DiagnosticsDialog onClose={() => setOpen(false)} />}
    </>
  )
}
