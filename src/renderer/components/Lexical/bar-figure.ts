/**
 * Horizontal bar charts as labiia_lex draws them with matplotlib
 * (chart_theme create_figure + style_axes + add_bar_labels): grey panel,
 * vertical grid lines at the value ticks, bottom and left spines, value
 * labels to the right of the bars, bold title.
 */
import type { BarFigure } from '../../models/lexical-figures'

export interface FigureKit {
  font: string
  measure: (text: string, px: number, bold?: boolean) => { width: number; ascent: number; descent: number }
  esc: (s: string) => string
  fmt: (n: number) => string
  padInches: number
}

/** matplotlib's AutoLocator (MaxNLocator with steps 1, 2, 2.5, 5, 10). */
export function autoTicks(vmin: number, vmax: number, nbins: number): number[] {
  const steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20]
  const dv = Math.abs(vmax - vmin) || 1
  const scale = 10 ** Math.floor(Math.log10(dv / nbins))
  const scaled = steps.map((x) => x * scale)
  const rawStep = (vmax - vmin) / nbins
  let istep = scaled.findIndex((x) => x >= rawStep)
  if (istep < 0) istep = scaled.length - 1
  const tol = 1e-10
  let ticks: number[] = []
  for (let k = istep; k >= 0; k--) {
    const step = scaled[k]
    const best = Math.floor(vmin / step) * step
    const le = (x: number): number => { const d = Math.floor(x / step); return Math.abs((x - d * step) / step - 1) < tol ? d + 1 : d }
    const ge = (x: number): number => { const d = Math.floor(x / step); return Math.abs((x - d * step) / step) < tol ? d : d + 1 }
    ticks = []
    for (let i = le(vmin - best); i <= ge(vmax - best); i++) ticks.push(i * step + best)
    if (ticks.filter((t) => t <= vmax && t >= vmin).length >= 2) break
  }
  return ticks.filter((t) => t >= vmin - 1e-9 * dv && t <= vmax + 1e-9 * dv)
}

/** matplotlib's ScalarFormatter: the decimals the ticks need, and a "1eN" offset for very large or small values. */
export function tickLabels(locs: number[]): { labels: string[]; offsetText: string } {
  if (locs.length === 0) return { labels: [], offsetText: '' }
  const maxAbs = Math.max(...locs.map(Math.abs))
  const oom = maxAbs > 0 ? Math.floor(Math.log10(maxAbs)) : 0
  const sci = maxAbs > 0 && (oom >= 6 || oom <= -5)
  const vals = sci ? locs.map((v) => v / 10 ** oom) : locs
  const range = Math.max(...vals) - Math.min(...vals)
  const rangeOom = Math.floor(Math.log10(range || 1))
  const thresh = 1e-3 * 10 ** rangeOom
  let sig = Math.max(0, 3 - rangeOom)
  while (sig >= 0) {
    const r = 10 ** sig
    if (Math.max(...vals.map((v) => Math.abs(v - Math.round(v * r) / r))) < thresh) sig--
    else break
  }
  sig++
  return { labels: vals.map((v) => v.toFixed(sig)), offsetText: sci ? `1e${oom}` : '' }
}

export function buildBars(f: BarFigure, k: FigureKit): { svgBody: string; x: number; y: number; width: number; height: number; background: string } {
  const { font, measure, esc, fmt } = k
  const W = f.figW * f.dpi
  const H = f.figH * f.dpi
  const pt = f.dpi / 72
  const axL = f.box.left * W, axR = f.box.right * W, axT = (1 - f.box.top) * H, axB = (1 - f.box.bottom) * H
  const n = f.bars.length
  const half = f.barHeight / 2
  const span = Math.max(n - 1, 0) + f.barHeight
  // matplotlib's 5% data margins on the category axis.
  const y0 = -half - 0.05 * span, y1 = n - 1 + half + 0.05 * span
  const px = (x: number): number => axL + (x / f.xmax) * (axR - axL)
  const py = (y: number): number => axB - ((y - y0) / (y1 - y0)) * (axB - axT)
  let bx0 = axL, by0 = axT, bx1 = axR, by1 = axB
  const grow = (a: number, b: number, c: number, d: number): void => {
    bx0 = Math.min(bx0, a); by0 = Math.min(by0, b); bx1 = Math.max(bx1, c); by1 = Math.max(by1, d)
  }
  const parts: string[] = [`<rect x="${fmt(axL)}" y="${fmt(axT)}" width="${fmt(axR - axL)}" height="${fmt(axB - axT)}" fill="#FAFAFA"/>`]

  // As many value ticks as fit at 9 pt labels (matplotlib's tick space: width / (3 x font size)), at most 9.
  const nbins = Math.max(1, Math.min(9, Math.floor(((f.box.right - f.box.left) * f.figW * 72) / 27)))
  const ticks = autoTicks(0, f.xmax, nbins)
  const { labels: tickText, offsetText } = tickLabels(ticks)
  parts.push(`<g stroke="#E5E5E5" stroke-opacity="0.7" stroke-width="${fmt(0.6 * pt)}">`)
  for (const t of ticks) parts.push(`<line x1="${fmt(px(t))}" y1="${fmt(axT)}" x2="${fmt(px(t))}" y2="${fmt(axB)}"/>`)
  parts.push('</g>')

  f.bars.forEach((b, i) => {
    const top = py(i + half), bottom = py(i - half)
    parts.push(`<rect x="${fmt(px(0))}" y="${fmt(top)}" width="${fmt(Math.max(0, px(b.value) - px(0)))}" height="${fmt(bottom - top)}" fill="${b.color}"/>`)
  })

  parts.push(`<g stroke="#CCCCCC" stroke-width="${fmt(0.5 * pt)}"><line x1="${fmt(axL)}" y1="${fmt(axB)}" x2="${fmt(axR)}" y2="${fmt(axB)}"/><line x1="${fmt(axL)}" y1="${fmt(axT)}" x2="${fmt(axL)}" y2="${fmt(axB)}"/></g>`)

  const tickLen = 3 * pt
  const pad = 3.5 * pt
  const tickSize = 9 * pt
  parts.push(`<g stroke="#666666" stroke-width="${fmt(0.5 * pt)}">`)
  for (const t of ticks) parts.push(`<line x1="${fmt(px(t))}" y1="${fmt(axB)}" x2="${fmt(px(t))}" y2="${fmt(axB + tickLen)}"/>`)
  f.bars.forEach((_b, i) => parts.push(`<line x1="${fmt(axL - tickLen)}" y1="${fmt(py(i))}" x2="${fmt(axL)}" y2="${fmt(py(i))}"/>`))
  parts.push(`</g><g font-family="${font}" font-size="${fmt(tickSize)}" fill="#666666">`)
  let labelsBottom = axB + tickLen + pad
  ticks.forEach((t, i) => {
    const m = measure(tickText[i], tickSize)
    const top = axB + tickLen + pad
    const base = top + m.ascent
    parts.push(`<text x="${fmt(px(t))}" y="${fmt(base)}" text-anchor="middle">${esc(tickText[i])}</text>`)
    grow(px(t) - m.width / 2, top, px(t) + m.width / 2, base + m.descent)
    labelsBottom = Math.max(labelsBottom, base + m.descent)
  })
  // Category labels (wrapped lines) centred on their bar, right-aligned before the ticks.
  const lineH = 1.2 * tickSize
  f.bars.forEach((b, i) => {
    const lines = b.label.split('\n')
    const firstBase = py(i) - ((lines.length - 1) * lineH) / 2 + tickSize * 0.36
    const right = axL - tickLen - pad
    lines.forEach((line, j) => {
      const m = measure(line, tickSize)
      const base = firstBase + j * lineH
      parts.push(`<text x="${fmt(right)}" y="${fmt(base)}" text-anchor="end">${esc(line)}</text>`)
      grow(right - m.width, base - m.ascent, right, base + m.descent)
    })
  })
  parts.push('</g>')

  const maxVal = Math.max(0, ...f.bars.map((b) => b.value)) || 1
  const annSize = 8.5 * pt
  parts.push(`<g font-family="${font}" font-size="${fmt(annSize)}" fill="#555555">`)
  f.bars.forEach((b, i) => {
    const x = px(b.value + maxVal * 0.03)
    const m = measure(b.text, annSize)
    const base = py(i) + (m.ascent - m.descent) / 2
    parts.push(`<text x="${fmt(x)}" y="${fmt(base)}">${esc(b.text)}</text>`)
    grow(x, base - m.ascent, x + m.width, base + m.descent)
  })
  parts.push('</g>')

  if (offsetText) {
    const m = measure(offsetText, tickSize)
    const base = labelsBottom + m.ascent + 2 * pt
    parts.push(`<text x="${fmt(axR)}" y="${fmt(base)}" font-family="${font}" font-size="${fmt(tickSize)}" fill="#666666" text-anchor="end">${esc(offsetText)}</text>`)
    grow(axR - m.width, base - m.ascent, axR, base + m.descent)
  }

  const labSize = 10 * pt
  const lm = measure(f.xlabel, labSize)
  const labBase = labelsBottom + 4 * pt + lm.ascent
  const cx = (axL + axR) / 2
  parts.push(`<text x="${fmt(cx)}" y="${fmt(labBase)}" font-family="${font}" font-size="${fmt(labSize)}" fill="#4D4D4D" text-anchor="middle">${esc(f.xlabel)}</text>`)
  grow(cx - lm.width / 2, labBase - lm.ascent, cx + lm.width / 2, labBase + lm.descent)

  // Title: 13 pt semibold (bold in DejaVu), matplotlib's 6 pt title pad.
  const tSize = 13 * pt
  const tm = measure(f.title, tSize, true)
  const tBase = axT - 6 * pt
  parts.push(`<text x="${fmt(cx)}" y="${fmt(tBase)}" font-family="${font}" font-weight="700" font-size="${fmt(tSize)}" fill="#2D2D2D" text-anchor="middle">${esc(f.title)}</text>`)
  grow(cx - tm.width / 2, tBase - tm.ascent, cx + tm.width / 2, tBase + tm.descent)

  const padPx = k.padInches * f.dpi
  const x = Math.floor(bx0 - padPx)
  const y = Math.floor(by0 - padPx)
  return { svgBody: parts.join(''), x, y, width: Math.ceil(bx1 + padPx) - x, height: Math.ceil(by1 + padPx) - y, background: '#FFFFFF' }
}
