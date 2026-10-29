/**
 * Ribbon — the Office-style tabbed toolbar of the Windows look. Each tab
 * holds named groups of large buttons; a button's coloured tile tells the
 * family of the action (sources, coding, queries, analyses, lexical,
 * affect), always the same colour, so the strip is colourful without
 * every button shouting its own hue.
 *
 * A button with a menu is a split button, as Word's "Paste": the icon runs
 * the main action, the label with ▾ opens a list of choices.
 *
 * Double-clicking a tab (or Ctrl+F1) collapses the ribbon to its tab row;
 * the choice is remembered on this computer. While collapsed, a click on
 * a tab opens it temporarily, as Office does.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, faChevronUp, faChevronDown, type IconComponent } from '../Icon'
import { t } from '../../i18n'

export type RibbonFamily = 'sources' | 'coding' | 'query' | 'analysis' | 'lexical' | 'affect' | 'neutral'
  // Each group of the Analyses and Lexical analyses tabs has its own colour.
  | 'codes' | 'results' | 'reports' | 'explore' | 'structure' | 'keywords'

export interface RibbonButtonDef {
  id: string
  label: string
  icon: IconComponent
  family: RibbonFamily
  onClick: () => void
  title?: string
  /** Dimmed with an explanation, e.g. while another person has the project checked out. */
  disabledReason?: string
  /** Toggle buttons (panels, theme) show their on state. */
  pressed?: boolean
  /** Small dot on the tile, e.g. "a new version is available". */
  badge?: boolean
  iconStyle?: React.CSSProperties
  /** Makes a split button: the choices listed when the label is clicked,
   *  loaded each time the list opens. */
  menu?: () => Promise<RibbonMenuItem[]>
}

export interface RibbonMenuItem {
  id: string
  label: string
  hint?: string
  icon?: IconComponent
  onClick: () => void
  /** Starts a new section with a line above it. */
  separated?: boolean
}

export interface RibbonGroupDef {
  label: string
  buttons: RibbonButtonDef[]
}

export interface RibbonTabDef {
  id: string
  label: string
  groups: RibbonGroupDef[]
}

const COLLAPSED_KEY = 'labiia.ribbonCollapsed'
const TAB_KEY = 'labiia.ribbonTab'

function readStored(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeStored(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* private storage — keep the session value */ }
}

export function Ribbon({ tabs }: { tabs: RibbonTabDef[] }): JSX.Element {
  const [activeId, setActiveId] = useState(() => {
    const saved = readStored(TAB_KEY)
    return tabs.some((tab) => tab.id === saved) ? saved! : tabs[0].id
  })
  const [collapsed, setCollapsed] = useState(() => readStored(COLLAPSED_KEY) === '1')
  // While collapsed, clicking a tab shows its body until the next click elsewhere.
  const [peek, setPeek] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const setCollapsedStored = (value: boolean): void => {
    setCollapsed(value)
    setPeek(false)
    writeStored(COLLAPSED_KEY, value ? '1' : '0')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'F1' && e.ctrlKey) {
        e.preventDefault()
        setCollapsedStored(!collapsed)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapsed])

  useEffect(() => {
    if (!peek) return
    const onDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setPeek(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [peek])

  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0]
  const bodyVisible = !collapsed || peek

  const selectTab = (id: string): void => {
    setActiveId(id)
    writeStored(TAB_KEY, id)
    if (collapsed) setPeek(true)
  }

  // Arrow keys move between tabs, as in any Windows tab list.
  const onTabKeyDown = (e: React.KeyboardEvent, index: number): void => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = (index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
    selectTab(tabs[next].id)
    const buttons = rootRef.current?.querySelectorAll<HTMLButtonElement>('.ribbon-tab')
    buttons?.[next]?.focus()
  }

  return (
    <div ref={rootRef} className={`ribbon${bodyVisible ? '' : ' ribbon-collapsed'}${peek ? ' ribbon-peek' : ''}`}>
      <div className="ribbon-tabs" role="tablist" aria-label={t("Ribbon")}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="ribbon-tab"
            aria-selected={tab.id === active.id}
            tabIndex={tab.id === active.id ? 0 : -1}
            onClick={() => selectTab(tab.id)}
            onDoubleClick={() => setCollapsedStored(!collapsed)}
            onKeyDown={(e) => onTabKeyDown(e, index)}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          className="ribbon-collapse"
          onClick={() => setCollapsedStored(!collapsed)}
          title={collapsed ? t("Show the ribbon (Ctrl+F1)") : t("Collapse the ribbon (Ctrl+F1)")}
          aria-label={collapsed ? t("Show the ribbon (Ctrl+F1)") : t("Collapse the ribbon (Ctrl+F1)")}
        >
          <Icon icon={collapsed ? faChevronDown : faChevronUp} />
        </button>
      </div>
      {bodyVisible && (
        <div className="ribbon-body" role="tabpanel" aria-label={active.label}>
          {active.groups.map((group) => (
            <div key={group.label} className="ribbon-group" role="group" aria-label={group.label}>
              <div className="ribbon-group-buttons">
                {group.buttons.map((b) => (
                  <RibbonButton key={b.id} def={b} onDone={() => setPeek(false)} />
                ))}
              </div>
              <div className="ribbon-group-label">{group.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RibbonButton({ def, onDone }: { def: RibbonButtonDef; onDone: () => void }): JSX.Element {
  const disabled = !!def.disabledReason
  if (def.menu) return <RibbonSplitButton def={def} onDone={onDone} />
  return (
    <button
      type="button"
      className="ribbon-btn"
      data-family={def.family}
      aria-pressed={def.pressed}
      aria-disabled={disabled || undefined}
      title={def.disabledReason ?? def.title ?? def.label}
      onClick={() => {
        // A locked action still runs: it explains why it cannot proceed.
        def.onClick()
        onDone()
      }}
    >
      <span className="ribbon-tile">
        <Icon icon={def.icon} style={def.iconStyle} />
        {def.badge && <span className="ribbon-badge" aria-hidden />}
      </span>
      <span className="ribbon-label">{def.label}</span>
    </button>
  )
}

function RibbonSplitButton({ def, onDone }: { def: RibbonButtonDef; onDone: () => void }): JSX.Element {
  const [items, setItems] = useState<RibbonMenuItem[] | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const open = pos !== null

  const close = (): void => { setPos(null); setItems(null) }
  const toggle = async (): Promise<void> => {
    if (open) { close(); return }
    const r = anchorRef.current!.getBoundingClientRect()
    // Below the button, kept inside the window.
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 368)), top: r.bottom + 4 })
    setItems(await def.menu!())
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      close()
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus())
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const choose = (item: RibbonMenuItem): void => { close(); item.onClick(); onDone() }

  return (
    <div ref={anchorRef} className="ribbon-split" data-family={def.family}>
      <button
        type="button"
        className="ribbon-btn ribbon-split-main"
        data-family={def.family}
        title={def.title ?? def.label}
        onClick={() => { def.onClick(); onDone() }}
      >
        <span className="ribbon-tile"><Icon icon={def.icon} style={def.iconStyle} /></span>
      </button>
      <button
        type="button"
        className="ribbon-split-more"
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("More options for {{name}}", { name: def.label })}
        onClick={() => void toggle()}
      >
        <span className="ribbon-label">{def.label}</span>
        <Icon icon={faChevronDown} className="ribbon-split-chevron" />
      </button>
      {open && createPortal(
        <div ref={menuRef} className="ribbon-menu" role="menu" style={{ left: pos.left, top: pos.top }}>
          {items === null ? (
            <div className="ribbon-menu-empty">{t("Loading…")}</div>
          ) : items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`ribbon-menu-item${item.separated ? ' ribbon-menu-separated' : ''}`}
              title={item.hint}
              onClick={() => choose(item)}
            >
              {item.icon && <Icon icon={item.icon} className="ribbon-menu-icon" />}
              <span className="ribbon-menu-text">
                <span className="ribbon-menu-label">{item.label}</span>
                {item.hint && <span className="ribbon-menu-hint">{item.hint}</span>}
              </span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
