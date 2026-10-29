/**
 * Start button and menu — the project entry point of the Windows look,
 * modelled on the Windows Start menu: actions on the left (new, open,
 * save as, import sources, merge projects), recent projects on the right.
 * Opens with a click or Alt+Home; closes with Esc, a click outside, or
 * after an action is chosen.
 */
import { useEffect, useRef, useState } from 'react'
import {
  Icon, faFilePlus, faFolderOpen, faSaveAll, faSquareArrowRightEnter, faGitMerge, faFileAlt,
  type IconComponent
} from '../Icon'
import { t } from '../../i18n'

interface Props {
  iconUrl: string
  onNewProject: () => void
  onOpenProject: () => void
  onSaveProjectAs: () => void
  onImportSources: () => void
  onMergeProject: () => void
  onOpenRecent: (path: string) => void
  /** Set while another person has the project checked out. */
  importLockedReason?: string
}

interface StartAction {
  id: string
  label: string
  hint: string
  icon: IconComponent
  family: string
  run: () => void
  iconStyle?: React.CSSProperties
}

export function StartMenu(props: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState<{ name: string; path: string }[]>([])
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.altKey && e.key === 'Home') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    window.api.getRecentProjects().then((list) => setRecent(list ?? [])).catch(() => setRecent([]))
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    // Focus the first action so the menu works from the keyboard.
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus())
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (run: () => void): void => {
    setOpen(false)
    run()
  }

  const actions: StartAction[] = [
    { id: 'new', label: t("New project"), hint: t("Start an empty project"), icon: faFilePlus, family: 'neutral', run: props.onNewProject },
    { id: 'open', label: t("Open project…"), hint: t("Open a .qdpx file"), icon: faFolderOpen, family: 'neutral', run: props.onOpenProject },
    { id: 'save-as', label: t("Save as…"), hint: t("Save a copy under another name"), icon: faSaveAll, family: 'neutral', run: props.onSaveProjectAs },
    { id: 'import', label: t("Import sources…"), hint: props.importLockedReason ?? t("Texts, PDFs, images, audio, video and surveys"), icon: faSquareArrowRightEnter, family: 'sources', run: props.onImportSources },
    // git-merge flipped both ways: projects merge toward the open project.
    { id: 'merge', label: t("Merge projects…"), hint: t("Bring another copy's work into this project"), icon: faGitMerge, family: 'query', run: props.onMergeProject, iconStyle: { transform: 'scale(-1, -1)' } }
  ]

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="start-button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("Start (Alt+Home)")}
        aria-label={t("Start")}
        onClick={() => setOpen((v) => !v)}
      >
        <img src={props.iconUrl} alt="" draggable={false} />
      </button>
      {open && (
        <div ref={panelRef} className="start-menu" role="menu" aria-label={t("Start")}>
          <div className="start-menu-actions">
            {actions.map((a) => (
              <button
                key={a.id}
                type="button"
                role="menuitem"
                className="start-menu-action"
                data-family={a.family}
                aria-disabled={a.id === 'import' && !!props.importLockedReason ? true : undefined}
                onClick={() => choose(a.run)}
              >
                <span className="ribbon-tile"><Icon icon={a.icon} style={a.iconStyle} /></span>
                <span className="start-menu-text">
                  <span className="start-menu-label">{a.label}</span>
                  <span className="start-menu-hint">{a.hint}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="start-menu-recent">
            <div className="start-menu-heading">{t("Recent projects")}</div>
            {recent.length === 0 ? (
              <div className="start-menu-empty">{t("Projects you open appear here.")}</div>
            ) : (
              recent.slice(0, 8).map((p) => (
                <button
                  key={p.path}
                  type="button"
                  role="menuitem"
                  className="start-menu-recent-item"
                  title={p.path}
                  onClick={() => choose(() => props.onOpenRecent(p.path))}
                >
                  <Icon icon={faFileAlt} />
                  <span className="start-menu-text">
                    <span className="start-menu-label">{p.name}</span>
                    <span className="start-menu-hint">{p.path}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </>
  )
}
