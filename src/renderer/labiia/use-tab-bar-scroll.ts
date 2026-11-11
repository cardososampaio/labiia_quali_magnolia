/**
 * Document tabs when there are more than fit: the active tab (a newly
 * opened one is added at the right end) scrolls into view, pushing the
 * others aside, and the mouse wheel scrolls the tabs sideways, since they
 * only overflow horizontally. A thin scrollbar shows that more tabs are
 * hidden (labiia-shell.css).
 */
import { useEffect, useRef } from 'react'

export function useTabBarScroll(activeTab: string | null, tabCount: number) {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bar = barRef.current
    const el = bar?.querySelector<HTMLElement>('.tab-item.active')
    if (bar && el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTab, tabCount])

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const onWheel = (e: WheelEvent): void => {
      if (bar.scrollWidth <= bar.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      bar.scrollLeft += e.deltaY
    }
    bar.addEventListener('wheel', onWheel, { passive: false })
    return () => bar.removeEventListener('wheel', onWheel)
  }, [])

  return barRef
}
