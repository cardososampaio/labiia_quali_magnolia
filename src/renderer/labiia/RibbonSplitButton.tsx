/**
 * A split button for labiia_quali's ribbon (Word's "Paste" style): the icon
 * runs the main action, the label with ▾ opens a list of choices loaded each
 * time it opens (e.g. Open → the recent projects, then Browse…).
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, faChevronDown } from '../components/Icon'
import { t } from '../i18n'
import type { RibbonButtonDef, RibbonMenuItem } from '../components/Toolbar/Ribbon'

export function RibbonSplitButton({ def, onDone }: { def: RibbonButtonDef; onDone: () => void }): JSX.Element {
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
        <span className="ribbon-tile">{def.icon && <Icon icon={def.icon} style={def.iconStyle} />}</span>
      </button>
      <button
        type="button"
        className="ribbon-split-more"
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('labiia.ribbon.moreOptionsFor', { name: def.label })}
        onClick={() => void toggle()}
      >
        <span className="ribbon-label">{def.label}</span>
        <Icon icon={faChevronDown} className="ribbon-split-chevron" />
      </button>
      {open && createPortal(
        <div ref={menuRef} className="ribbon-menu" role="menu" style={{ left: pos.left, top: pos.top }}>
          {items === null ? (
            <div className="ribbon-menu-empty">{t('labiia.ribbon.loading')}</div>
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
