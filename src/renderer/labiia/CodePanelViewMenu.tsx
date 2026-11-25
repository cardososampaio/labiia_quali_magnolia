/**
 * The view button in the Codes panel header and its menu: order of the
 * codes, subcodes added up in the parent code, and text size of the list.
 * The text size can also be changed with Ctrl + mouse wheel over the list
 * (see useCodePanelWheelZoom). The menu also opens the history of the codes.
 */
import { useEffect, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, faSlidersHorizontal, faAArrowUp, faAArrowDown, faCheck } from '../components/Icon'
import { useClampedMenuPosition } from '../utils/use-clamped-menu-position'
import {
  useCodePanelView,
  CODE_SORTS,
  CODE_FONT_SCALE_DEFAULT,
  CODE_FONT_SCALE_MIN,
  CODE_FONT_SCALE_MAX,
  CODE_FONT_SCALE_STEP,
  SUBCODE_SUMS,
  subcodeSumOf
} from './code-panel-view'
import { openCodeHistory } from './code-history-store'

export function CodePanelViewButton() {
  const { t } = useTranslation()
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const menuPos = useClampedMenuPosition(anchor)
  const sort = useCodePanelView((s) => s.sort)
  const aggregateSubcodes = useCodePanelView((s) => s.aggregateSubcodes)
  const fontScale = useCodePanelView((s) => s.fontScale)
  const setSort = useCodePanelView((s) => s.setSort)
  const setAggregateSubcodes = useCodePanelView((s) => s.setAggregateSubcodes)
  const setFontScale = useCodePanelView((s) => s.setFontScale)

  useEffect(() => {
    if (!anchor) return
    const handleDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.labiia-code-view-menu') && !target.closest('.labiia-code-view-button')) setAnchor(null)
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAnchor(null) }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [anchor])

  const check = (on: boolean) => (
    <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>
      {on && <Icon icon={faCheck} />}
    </span>
  )
  const smallButton: React.CSSProperties = { padding: '2px 8px', minWidth: 0, fontSize: 'var(--font-size-sm)' }

  return (
    <>
      <button
        className="panel-header-search labiia-code-view-button"
        onClick={(e) => {
          if (anchor) { setAnchor(null); return }
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          setAnchor({ x: r.left, y: r.bottom + 2 })
        }}
        title={t('labiia.codesView.button')}
        aria-label={t('labiia.codesView.button')}
        aria-expanded={anchor !== null}
        style={sort !== 'manual' || aggregateSubcodes ? { color: 'var(--accent)' } : undefined}
      >
        <Icon icon={faSlidersHorizontal} />
      </button>
      {anchor && (
        <div
          ref={menuPos.ref}
          className="context-menu labiia-code-view-menu"
          style={{ left: menuPos.x, top: menuPos.y, minWidth: 250 }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--text-muted)' }}>{t('labiia.codesView.sortTitle')}</div>
          {CODE_SORTS.map((s) => (
            <div
              key={s}
              className="context-menu-item"
              role="menuitemradio"
              aria-checked={sort === s}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setSort(s)}
            >
              {check(sort === s)}
              {t(`labiia.codesView.sort.${s}`)}
            </div>
          ))}
          <div className="context-menu-separator" />
          <div
            className="context-menu-item"
            role="menuitemcheckbox"
            aria-checked={aggregateSubcodes}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}
            title={t('labiia.codesView.aggregateHint')}
            onClick={() => {
              // The panel's choice replaces what each code chose on its own.
              const own = Object.keys(useCodePanelView.getState().subcodeSums).length
              if (own > 0 && !window.confirm(t('labiia.codesView.subcodeSum.replaceConfirm', { count: own }))) return
              setAggregateSubcodes(!aggregateSubcodes)
            }}
          >
            {check(aggregateSubcodes)}
            <span>{t('labiia.codesView.aggregate')}</span>
          </div>
          <div className="context-menu-separator" />
          <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--text-muted)' }}>{t('labiia.codesView.textSize')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 12px 6px' }}>
            <button
              className="secondary"
              style={smallButton}
              disabled={fontScale <= CODE_FONT_SCALE_MIN}
              onClick={() => setFontScale(fontScale - CODE_FONT_SCALE_STEP)}
              title={t('labiia.codesView.smaller')}
              aria-label={t('labiia.codesView.smaller')}
            >
              <Icon icon={faAArrowDown} />
            </button>
            <span style={{ minWidth: 44, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.round(fontScale * 100)}%</span>
            <button
              className="secondary"
              style={smallButton}
              disabled={fontScale >= CODE_FONT_SCALE_MAX}
              onClick={() => setFontScale(fontScale + CODE_FONT_SCALE_STEP)}
              title={t('labiia.codesView.larger')}
              aria-label={t('labiia.codesView.larger')}
            >
              <Icon icon={faAArrowUp} />
            </button>
            <button
              className="secondary"
              style={{ ...smallButton, marginInlineStart: 'auto' }}
              disabled={fontScale === CODE_FONT_SCALE_DEFAULT}
              onClick={() => setFontScale(CODE_FONT_SCALE_DEFAULT)}
            >
              {t('labiia.codesView.resetSize')}
            </button>
          </div>
          <div style={{ padding: '0 12px 6px', fontSize: 11, color: 'var(--text-muted)', maxWidth: 260 }}>
            {t('labiia.codesView.wheelHint')}
          </div>
          <div className="context-menu-separator" />
          <div className="context-menu-item" role="menuitem" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => { setAnchor(null); openCodeHistory() }}>
            <span style={{ width: 16, flexShrink: 0 }} />
            <span>{t('labiia.codeHistory.open')}</span>
          </div>
        </div>
      )}
    </>
  )
}

/** Ctrl + mouse wheel over the code list changes its text size, instead of
 *  zooming the whole window. */
export function useCodePanelWheelZoom(ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      e.stopPropagation()
      const { fontScale, setFontScale } = useCodePanelView.getState()
      setFontScale(fontScale + (e.deltaY < 0 ? CODE_FONT_SCALE_STEP : -CODE_FONT_SCALE_STEP))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref])
}

/** The group in a code's right-click menu that chooses how its number adds
 *  up its subcodes (only the count changes, never the codes). */
export function SubcodeSumMenuItems({ codeGuid, onDone }: { codeGuid: string; onDone: () => void }) {
  const { t } = useTranslation()
  const mode = useCodePanelView((s) => subcodeSumOf(s, codeGuid))
  const setSubcodeSum = useCodePanelView((s) => s.setSubcodeSum)
  return (
    <>
      <div className="context-menu-separator" />
      <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--text-muted)' }}>{t('labiia.codesView.subcodeSum.title')}</div>
      {SUBCODE_SUMS.map((m) => (
        <div
          key={m}
          className="context-menu-item"
          role="menuitemradio"
          aria-checked={mode === m}
          title={t(`labiia.codesView.subcodeSum.${m}Hint`)}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => { setSubcodeSum(codeGuid, m); onDone() }}
        >
          <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center', flexShrink: 0 }}>{mode === m && <Icon icon={faCheck} />}</span>
          {t(`labiia.codesView.subcodeSum.${m}`)}
        </div>
      ))}
    </>
  )
}
