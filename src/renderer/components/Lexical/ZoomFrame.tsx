/**
 * Frame for a result picture (an R image or a window-drawn figure) with zoom:
 * "Fit to window" shows it whole; − and + (or Ctrl + mouse wheel) shrink or
 * enlarge it in steps, and the frame scrolls when it is bigger than the view.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { t } from '../../i18n'

const STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]

export function ZoomFrame({ natural, tools, children }: {
  /** Size at 100 %; for an image it is read from the image itself. */
  natural?: { width: number; height: number }
  /** Other buttons shown after the zoom controls (export). */
  tools?: ReactNode
  /** The picture, given its size when zoomed (undefined when fitted). */
  children: (style: CSSProperties | undefined) => ReactNode
}) {
  // null: fitted to the window.
  const [zoom, setZoom] = useState<number | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  const naturalSize = (): { width: number; height: number } | null => {
    if (natural) return natural
    const img = frameRef.current?.querySelector('img')
    return img && img.naturalWidth ? { width: img.naturalWidth, height: img.naturalHeight } : null
  }
  // The scale the picture is shown at now, so − and + start from what the user sees.
  const currentScale = (): number => {
    if (zoom !== null) return zoom
    const size = naturalSize()
    const el = frameRef.current?.querySelector('img, svg')
    if (!size || !el) return 1
    return el.getBoundingClientRect().width / size.width
  }
  const step = (dir: 1 | -1): void => {
    const now = currentScale()
    const next = dir > 0 ? STEPS.find((s) => s > now + 0.001) : [...STEPS].reverse().find((s) => s < now - 0.001)
    setZoom(next ?? (dir > 0 ? STEPS[STEPS.length - 1] : STEPS[0]))
  }

  // Ctrl + wheel zooms the picture instead of the page.
  const stepRef = useRef(step)
  stepRef.current = step
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      stepRef.current(e.deltaY < 0 ? 1 : -1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const size = zoom !== null ? naturalSize() : null
  const style = zoom !== null && size ? { width: Math.round(size.width * zoom), height: Math.round(size.height * zoom), maxWidth: 'none', maxHeight: 'none' } : undefined

  return (
    <div className="lex-figure">
      <div className="lex-figure-tools">
        <div className="lex-zoom" role="group" aria-label={t('Zoom')}>
          <button className="secondary lex-small-btn" title={t('Zoom out')} onClick={() => step(-1)}>−</button>
          <span className="lex-zoom-value">{zoom === null ? t('Fitted') : `${Math.round(zoom * 100)}%`}</span>
          <button className="secondary lex-small-btn" title={t('Zoom in')} onClick={() => step(1)}>+</button>
          <button className="secondary lex-small-btn" disabled={zoom === null} onClick={() => setZoom(null)}>{t('Fit to window')}</button>
          <button className="secondary lex-small-btn" disabled={zoom === 1} onClick={() => setZoom(1)}>100%</button>
        </div>
        {tools}
      </div>
      <div ref={frameRef} className={`lex-figure-frame${zoom !== null ? ' actual' : ''}`} title={t('Ctrl + mouse wheel zooms')}>
        {children(style)}
      </div>
    </div>
  )
}
