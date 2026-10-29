/**
 * Frame for a result picture (an R image or a window-drawn figure) with zoom:
 * "Fit to window" shows it whole; − and + (or Ctrl + mouse wheel) shrink or
 * enlarge it in steps, and the frame scrolls when it is bigger than the view.
 * A zoomed picture larger than the view can be dragged with the mouse (the
 * hand tool), so any area of it can be brought into view without the
 * scrollbars.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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

  // Hand tool: available while the zoomed picture overflows the frame.
  const [canPan, setCanPan] = useState(false)
  const [panning, setPanning] = useState(false)
  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return
    const update = (): void => setCanPan(zoom !== null && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    // An image's size is only known once it has loaded.
    const img = el.querySelector('img')
    img?.addEventListener('load', update)
    return () => { observer.disconnect(); img?.removeEventListener('load', update) }
  }, [zoom])

  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    // Left button drags; the middle button drags too, as in most viewers.
    if (!canPan || (e.button !== 0 && e.button !== 1)) return
    const el = e.currentTarget
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false }
    el.setPointerCapture(e.pointerId)
    if (e.button === 1) e.preventDefault()
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    // A few pixels of slack keep a plain click a click.
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return
    if (!d.moved) { d.moved = true; setPanning(true) }
    e.currentTarget.scrollLeft = d.left - dx
    e.currentTarget.scrollTop = d.top - dy
  }
  const endDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return
    const moved = drag.current.moved
    drag.current = null
    setPanning(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    // After a drag, swallow the click so nothing in the figure reacts to it.
    if (moved) e.currentTarget.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true })
  }

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
      <div
        ref={frameRef}
        className={`lex-figure-frame${zoom !== null ? ' actual' : ''}${canPan ? ' pannable' : ''}${panning ? ' panning' : ''}`}
        title={canPan ? t('Drag to move the picture · Ctrl + mouse wheel zooms') : t('Ctrl + mouse wheel zooms')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // The browser's own image drag would steal the gesture.
        onDragStart={(e) => { if (canPan) e.preventDefault() }}
      >
        {children(style)}
      </div>
    </div>
  )
}
