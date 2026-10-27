import { Markdown } from '../Markdown'
import { t } from '../../i18n'

export interface UpdateAvailableInfo {
  version: string
  currentVersion: string
  releaseDate: string | null
  releaseNotes: string
}

/**
 * Sparkle-style "a new version is available" modal. Shown when the auto-updater
 * has downloaded an update (main process → `onUpdateAvailable`). Offers the
 * three standard choices, each routed back to the main process:
 *   - Skip This Version → remember it, don't prompt again until a newer one
 *   - Remind Me Later   → dismiss; re-prompts on the next check / install on quit
 *   - Install Now       → quit, install, relaunch on the new version
 */
export function UpdateDialog({
  info,
  onDismiss
}: {
  info: UpdateAvailableInfo | null
  onDismiss: () => void
}): JSX.Element | null {
  if (!info) return null

  const install = (): void => {
    // The app will quit + install + relaunch; nothing more to do here.
    window.api.installUpdate()
  }
  const skip = (): void => {
    window.api.skipUpdateVersion(info.version)
    onDismiss()
  }
  const later = (): void => {
    window.api.remindUpdateLater()
    onDismiss()
  }

  const released =
    info.releaseDate && !Number.isNaN(Date.parse(info.releaseDate))
      ? new Date(info.releaseDate).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : null

  return (
    // Clicking the backdrop is the least-committal action: treat it as "later".
    <div className="modal-overlay" onClick={later}>
      <div
        className="modal"
        style={{ width: 560, maxWidth: '92vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>
          {t("A new version of labiia_quali is available")}
        </h2>
        <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
          {t("labiia_quali")}{' '}{info.version} {t("is now available—you have")}{' '}{info.currentVersion}{t(". Would you like to install it")}
          {released ? t(" (released {{released}})", { released: released }) : ''}?
        </p>

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
          {t("Release notes")}
        </div>
        <div
          style={{
            overflowY: 'auto',
            flex: 1,
            minHeight: 90,
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 14px',
            background: 'var(--bg-primary)',
            fontSize: 'var(--font-size-sm)'
          }}
        >
          {info.releaseNotes ? (
            <Markdown text={info.releaseNotes} />
          ) : (
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
              {t("No release notes were provided for this version.")}
            </p>
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="secondary" onClick={skip} style={{ marginRight: 'auto' }}>
            {t("Skip This Version")}
          </button>
          <button className="secondary" onClick={later}>
            {t("Remind Me Later")}
          </button>
          <button onClick={install}>{t("Install Now")}</button>
        </div>
      </div>
    </div>
  )
}
