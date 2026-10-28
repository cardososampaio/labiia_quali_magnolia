/**
 * Vertical bar charts in labiia_lex's matplotlib theme (create_figure +
 * style_axes(grid_axis="y") + add_bar_labels(horizontal=False)), as in its
 * sentiment distribution.
 */
import type { VBarFigure } from '../../models/lexical-figures'
import { autoTicks, tickLabels, type FigureKit } from './bar-figure'

// matplotlib's default subplot box.
const BOX = { left: 0.125, right: 0.9, bottom: 0.11, top: 0.88 }

export function buildVBars(f: VBarFigure, k: FigureKit) {
  const { font, measure, esc, fmt } = k
  const W = f.figW * f.dpi, H = f.figH * f.dpi, pt = f.dpi / 72
  const axL = BOX.left * W, axR = BOX.right * W, axT = (1 - BOX.top) * H, axB = (1 - BOX.bottom) * H
  const n = f.bars.length
  const half = f.barWidth / 2
  const span = Math.max(n - 1, 0) + f.barWidth
  const x0 = -half - 0.05 * span, x1 = n - 1 + half + 0.05 * span
  const px = (x: number): number => axL + ((x - x0) / (x1 - x0)) * (axR - axL)
  const py = (y: number): number => axB - (y / f.ymax) * (axB - axT)
  let bx0 = axL, by0 = axT, bx1 = axR, by1 = axB
  const grow = (a: number, b: number, c: number, d: number): void => {
    bx0 = Math.min(bx0, a); by0 = Math.min(by0, b); bx1 = Math.max(bx1, c); by1 = Math.max(by1, d)
  }
  const P: string[] = [`<rect x="${fmt(axL)}" y="${fmt(axT)}" width="${fmt(axR - axL)}" height="${fmt(axB - axT)}" fill="#FAFAFA"/>`]

  // Value ticks: matplotlib's vertical tick space is the axes height / (2 x 9 pt), at most 9.
  const nbins = Math.max(1, Math.min(9, Math.floor((BOX.top - BOX.bottom) * f.figH * 72 / 18)))
  const ticks = autoTicks(0, f.ymax, nbins)
  const { labels } = tickLabels(ticks)
  P.push(`<g stroke="#E5E5E5" stroke-opacity="0.7" stroke-width="${fmt(0.6 * pt)}">`)
  for (const t of ticks) P.push(`<line x1="${fmt(axL)}" y1="${fmt(py(t))}" x2="${fmt(axR)}" y2="${fmt(py(t))}"/>`)
  P.push('</g>')

  f.bars.forEach((b, i) => {
    const l = px(i - half), r = px(i + half)
    P.push(`<rect x="${fmt(l)}" y="${fmt(py(b.value))}" width="${fmt(r - l)}" height="${fmt(py(0) - py(b.value))}" fill="${b.color}" fill-opacity="${f.alpha}" stroke="${f.edgeColor}" stroke-opacity="${f.alpha}" stroke-width="${fmt(f.edgeWidth * pt)}"/>`)
  })
  P.push(`<g stroke="#CCCCCC" stroke-width="${fmt(0.5 * pt)}"><line x1="${fmt(axL)}" y1="${fmt(axB)}" x2="${fmt(axR)}" y2="${fmt(axB)}"/><line x1="${fmt(axL)}" y1="${fmt(axT)}" x2="${fmt(axL)}" y2="${fmt(axB)}"/></g>`)

  const tickLen = 3 * pt, pad = 3.5 * pt, tickSize = 9 * pt
  P.push(`<g stroke="#666666" stroke-width="${fmt(0.5 * pt)}">`)
  for (const t of ticks) P.push(`<line x1="${fmt(axL - tickLen)}" y1="${fmt(py(t))}" x2="${fmt(axL)}" y2="${fmt(py(t))}"/>`)
  f.bars.forEach((_b, i) => P.push(`<line x1="${fmt(px(i))}" y1="${fmt(axB)}" x2="${fmt(px(i))}" y2="${fmt(axB + tickLen)}"/>`))
  P.push(`</g><g font-family="${font}" font-size="${fmt(tickSize)}" fill="#666666">`)
  let labelsLeft = axL - tickLen - pad
  ticks.forEach((t, i) => {
    const m = measure(labels[i], tickSize)
    const right = axL - tickLen - pad
    const base = py(t) + (m.ascent - m.descent) / 2
    P.push(`<text x="${fmt(right)}" y="${fmt(base)}" text-anchor="end">${esc(labels[i])}</text>`)
    grow(right - m.width, base - m.ascent, right, base + m.descent)
    labelsLeft = Math.min(labelsLeft, right - m.width)
  })
  f.bars.forEach((b, i) => {
    const m = measure(b.label, tickSize)
    const base = axB + tickLen + pad + m.ascent
    P.push(`<text x="${fmt(px(i))}" y="${fmt(base)}" text-anchor="middle">${esc(b.label)}</text>`)
    grow(px(i) - m.width / 2, base - m.ascent, px(i) + m.width / 2, base + m.descent)
  })
  P.push('</g>')

  const maxVal = Math.max(0, ...f.bars.map((b) => b.value)) || 1
  const annSize = 8.5 * pt
  f.bars.forEach((b, i) => {
    const m = measure(b.text, annSize)
    const base = py(b.value + maxVal * 0.03) - m.descent
    P.push(`<text x="${fmt(px(i))}" y="${fmt(base)}" font-family="${font}" font-size="${fmt(annSize)}" fill="#555555" text-anchor="middle">${esc(b.text)}</text>`)
    grow(px(i) - m.width / 2, base - m.ascent, px(i) + m.width / 2, base + m.descent)
  })

  // Value axis label, rotated, 4 pt left of the tick labels.
  const labSize = 10 * pt
  const lm = measure(f.ylabel, labSize)
  const lx = labelsLeft - 4 * pt - lm.descent
  const ly = (axT + axB) / 2
  P.push(`<text x="${fmt(lx)}" y="${fmt(ly)}" transform="rotate(-90 ${fmt(lx)} ${fmt(ly)})" font-family="${font}" font-size="${fmt(labSize)}" fill="#4D4D4D" text-anchor="middle">${esc(f.ylabel)}</text>`)
  grow(lx - lm.ascent, ly - lm.width / 2, lx + lm.descent, ly + lm.width / 2)

  const tSize = 13 * pt
  const tm = measure(f.title, tSize, true)
  const tBase = axT - 6 * pt
  const cx = (axL + axR) / 2
  P.push(`<text x="${fmt(cx)}" y="${fmt(tBase)}" font-family="${font}" font-weight="700" font-size="${fmt(tSize)}" fill="#2D2D2D" text-anchor="middle">${esc(f.title)}</text>`)
  grow(cx - tm.width / 2, tBase - tm.ascent, cx + tm.width / 2, tBase + tm.descent)

  const padPx = k.padInches * f.dpi
  const x = Math.floor(bx0 - padPx), y = Math.floor(by0 - padPx)
  return { svgBody: P.join(''), x, y, width: Math.ceil(bx1 + padPx) - x, height: Math.ceil(by1 + padPx) - y, background: '#FFFFFF' }
}
