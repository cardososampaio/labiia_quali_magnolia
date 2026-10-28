/**
 * R status for the lexical analyses.
 *
 * RStatusPanel sits in a test's tab: it says whether R was found and which
 * of the test's packages are missing, and offers to install them (with the
 * user's confirmation, since it downloads from CRAN). RSettingsPanel is the
 * "R" page of Preferences: where R is, choosing another Rscript, and the
 * packages of every lexical test.
 */
import { useEffect, useMemo } from 'react'
import { Icon, faExclamationTriangle, faCheck, faCircleInfo } from '../Icon'
import { t, tn } from '../../i18n'
import { useLexicalRStore } from './lexical-r-store'
import { LEXICAL_TESTS } from './lexical-catalog'
import { requestPreferencesCategory } from '../Preferences/PreferencesWindow'
import { useDocumentStore } from '../../stores/document-store'
import { PREFERENCES_TAB_ID } from '../../utils/tab-ids'

const R_DOWNLOAD_URL = 'https://cran.r-project.org/'

function problemText(problem?: string): string {
  if (problem === 'not-runnable') return t('The Rscript chosen in Preferences could not be run.')
  if (problem === 'too-old') return t('This R is too old. The lexical analyses need R 4.0 or newer.')
  return t('R was not found on this computer. The tests marked "R" need R 4.0 or newer.')
}

function useRPackages(packages: string[]) {
  const { status, checking, packages: known, refresh, checkPackages } = useLexicalRStore()
  const key = packages.join(',')
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (status?.found && packages.some((p) => known[p] === undefined)) void checkPackages(packages)
    // Re-check when R changes or new packages are asked about.
  }, [status, key])
  const missing = packages.filter((p) => known[p] === false)
  const pending = status?.found === true && packages.some((p) => known[p] === undefined)
  return { status, checking, missing, pending }
}

function InstallButton({ missing }: { missing: string[] }) {
  const { install, installPackages, cancelInstall } = useLexicalRStore()
  if (install.running) {
    const p = install.progress
    const pct = p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
    return (
      <div className="lex-install">
        <div className="lex-progress"><div className="lex-progress-bar" style={{ width: `${pct}%` }} /></div>
        <div className="lex-install-line">
          {p?.current ? t('Installing {{name}}…', { name: p.current }) : t('Installing R packages…')}
          {p ? ` (${p.done}/${p.total})` : ''}
        </div>
        <button className="secondary lex-small-btn" onClick={cancelInstall}>{t('Cancel')}</button>
      </div>
    )
  }
  return (
    <button
      className="lex-small-btn"
      onClick={() => {
        const ok = window.confirm(t(
          'labiia_quali will download and install these R packages from CRAN: {{list}}.\n\nThis needs internet and can take several minutes. The packages go to a folder of labiia_quali and do not change your other R projects.',
          { list: missing.join(', ') }
        ))
        if (ok) void installPackages(missing)
      }}
    >
      {t('Install missing packages')}
    </button>
  )
}

function InstallOutcome() {
  const install = useLexicalRStore((s) => s.install)
  if (install.running) return null
  if (install.error === 'busy') return <div className="lex-note">{t('Another installation is already running.')}</div>
  if (install.error) return <div className="lex-note lex-note-error">{t('The installation could not start: {{error}}', { error: install.error })}</div>
  if (!install.result) return null
  if (install.result.cancelled) return <div className="lex-note">{t('Installation cancelled.')}</div>
  if (install.result.failed.length > 0) {
    return (
      <div className="lex-note lex-note-error">
        {t('These packages could not be installed: {{list}}. Check the internet connection and try again.', { list: install.result.failed.join(', ') })}
      </div>
    )
  }
  return null
}

export function RStatusPanel({ packages }: { packages: string[] }) {
  const { status, checking, missing, pending } = useRPackages(packages)

  const openRPreferences = (): void => {
    requestPreferencesCategory('r')
    useDocumentStore.getState().openToolTab(PREFERENCES_TAB_ID)
  }

  let body: JSX.Element
  if (!status || checking) {
    body = <span className="lex-muted">{t('Looking for R…')}</span>
  } else if (!status.found) {
    body = (
      <>
        <div className="lex-r-line lex-r-bad">
          <Icon icon={faExclamationTriangle} style={{ fontSize: 13 }} />
          <span>{problemText(status.problem)}</span>
        </div>
        <div className="lex-r-actions">
          <button className="secondary lex-small-btn" onClick={() => window.open(R_DOWNLOAD_URL)}>{t('Download R')}</button>
          <button className="secondary lex-small-btn" onClick={openRPreferences}>{t('Choose where R is…')}</button>
        </div>
      </>
    )
  } else if (pending) {
    body = <span className="lex-muted">{t('Checking R packages…')}</span>
  } else if (missing.length > 0) {
    body = (
      <>
        <div className="lex-r-line lex-r-bad">
          <Icon icon={faExclamationTriangle} style={{ fontSize: 13 }} />
          <span>{tn(missing.length, 'This test needs an R package that is not installed: {{list}}.', 'This test needs R packages that are not installed: {{list}}.', { list: missing.join(', ') })}</span>
        </div>
        <InstallButton missing={missing} />
        <InstallOutcome />
      </>
    )
  } else {
    body = (
      <div className="lex-r-line lex-r-ok">
        <Icon icon={faCheck} style={{ fontSize: 13 }} />
        <span>{t('R {{version}} and the packages this test needs are ready.', { version: status.installation?.version ?? '' })}</span>
      </div>
    )
  }

  return <div className="analysis-section lex-section lex-r-panel">{body}</div>
}

export function RSettingsPanel() {
  const { status, checking, packages: known, refresh, setPath, checkPackages } = useLexicalRStore()
  const allPackages = useMemo(() => [...new Set(LEXICAL_TESTS.flatMap((d) => d.rPackages))].sort(), [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { if (status?.found) void checkPackages(allPackages) }, [status])

  const missing = allPackages.filter((p) => known[p] === false)
  const installation = status?.installation

  const choose = async (): Promise<void> => {
    const picked = await window.api.lexical.pickRPath()
    if (picked) await setPath(picked)
  }

  return (
    <div className="lex-r-settings">
      <h3>{t('R for the lexical analyses')}</h3>
      <p className="lex-muted">
        {t('Word Cloud, Descending Hierarchical Classification, Similarity Analysis, Emotions and LDA Topics run in R. labiia_quali uses the newest R installed on this computer, unless you choose another one below.')}
      </p>

      <div className="lex-r-row">
        <span className="lex-label">{t('R in use')}</span>
        {checking || !status
          ? <span className="lex-muted">{t('Looking for R…')}</span>
          : installation && status.found
            ? <span>R {installation.version} — <code>{installation.rscript}</code></span>
            : <span className="lex-r-bad">{problemText(status.problem)}</span>}
      </div>
      <div className="lex-r-row">
        <span className="lex-label">{t('Location')}</span>
        <span>{status?.configuredPath ? t('Chosen by you') : t('Found automatically')}</span>
        <div className="lex-r-actions">
          <button className="secondary lex-small-btn" onClick={() => void choose()}>{t('Choose Rscript…')}</button>
          {status?.configuredPath && (
            <button className="secondary lex-small-btn" onClick={() => void setPath('')}>{t('Find automatically')}</button>
          )}
          <button className="secondary lex-small-btn" onClick={() => void refresh(true)}>{t('Look again')}</button>
        </div>
      </div>
      {installation && (
        <div className="lex-r-row">
          <span className="lex-label">{t('Package folder')}</span>
          <code className="lex-path">{installation.libDir}</code>
        </div>
      )}

      {status?.found && (
        <>
          <h4>{t('Packages')}</h4>
          <div className="lex-pkg-grid">
            {allPackages.map((p) => (
              <span key={p} className={`lex-pkg ${known[p] === true ? 'ok' : known[p] === false ? 'missing' : ''}`}>
                <Icon icon={known[p] === true ? faCheck : known[p] === false ? faExclamationTriangle : faCircleInfo} style={{ fontSize: 11 }} />
                {p}
              </span>
            ))}
          </div>
          {missing.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <InstallButton missing={missing} />
              <InstallOutcome />
            </div>
          )}
        </>
      )}
      {!status?.found && !checking && (
        <div className="lex-r-actions" style={{ marginTop: 10 }}>
          <button className="lex-small-btn" onClick={() => window.open(R_DOWNLOAD_URL)}>{t('Download R')}</button>
        </div>
      )}
    </div>
  )
}
