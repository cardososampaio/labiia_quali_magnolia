/**
 * Timelines in labiia_lex's matplotlib theme (create_figure + style_axes):
 * grey panel with horizontal grid, lines with round markers, a legend in the
 * upper right, slanted date labels, tight crop. Dates are labelled in the
 * Brazilian order (dd/mm/yyyy) at the dates present in the data.
 */
import type { TimelineFigure } from '../../models/lexical-figures'
import { autoTicks, tickLabels, type FigureKit } from './bar-figure'

export function buildTimeline(f: TimelineFigure, k: FigureKit) {
  const { font, measure, esc, fmt } = k
  const W = f.figW * f.dpi, H = f.figH * f.dpi, pt = f.dpi / 72
  const [bl, br, bb, bt] = f.box
  const axL = bl * W, axR = br * W, axT = (1 - bt) * H, axB = (1 - bb) * H
  const xs = f.dates.map((d) => d.x)
  let x0 = Math.min(...xs), x1 = Math.max(...xs)
  if (x0 === x1) { x0 -= 1; x1 += 1 }
  const xm = (x1 - x0) * 0.05
  x0 -= xm; x1 += xm
  const all = f.series.flatMap((s) => s.values)
  let y0: number, y1: number
  if (f.ylim) [y0, y1] = f.ylim
  else {
    y0 = Math.min(...all); y1 = Math.max(...all)
    if (y0 === y1) { y0 -= 0.05; y1 += 0.05 }
    const ym = (y1 - y0) * 0.05
    y0 -= ym; y1 += ym
  }
  const px = (x: number): number => axL + ((x - x0) / (x1 - x0)) * (axR - axL)
  const py = (y: number): number => axB - ((y - y0) / (y1 - y0)) * (axB - axT)
  let bx0 = axL, by0 = axT, bx1 = axR, by1 = axB
  const grow = (a: number, b: number, c: number, d: number): void => { bx0 = Math.min(bx0, a); by0 = Math.min(by0, b); bx1 = Math.max(bx1, c); by1 = Math.max(by1, d) }
  const P: string[] = [`<rect x="${fmt(axL)}" y="${fmt(axT)}" width="${fmt(axR - axL)}" height="${fmt(axB - axT)}" fill="#FAFAFA"/>`]

  const nbins = Math.max(1, Math.min(9, Math.floor((bt - bb) * f.figH * 72 / 18)))
  const yt = autoTicks(y0, y1, nbins).filter((t) => t >= y0 - 1e-9 && t <= y1 + 1e-9)
  const { labels: yl } = tickLabels(yt)
  P.push(`<g stroke="#E5E5E5" stroke-opacity="0.7" stroke-width="${fmt(0.6 * pt)}">`)
  for (const t of yt) P.push(`<line x1="${fmt(axL)}" y1="${fmt(py(t))}" x2="${fmt(axR)}" y2="${fmt(py(t))}"/>`)
  P.push('</g>')

  const clip = 'lex-timeline-clip'
  P.push(`<defs><clipPath id="${clip}"><rect x="${fmt(axL)}" y="${fmt(axT)}" width="${fmt(axR - axL)}" height="${fmt(axB - axT)}"/></clipPath></defs><g clip-path="url(#${clip})">`)
  for (const s of f.series) {
    const pts = s.values.map((v, i) => `${fmt(px(xs[i]))},${fmt(py(v))}`).join(' ')
    P.push(`<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${fmt(f.lineWidth * pt)}" stroke-linejoin="round" stroke-linecap="square"/>`)
    for (let i = 0; i < s.values.length; i++) P.push(`<circle cx="${fmt(px(xs[i]))}" cy="${fmt(py(s.values[i]))}" r="${fmt((f.markerSize / 2) * pt)}" fill="${s.color}"/>`)
  }
  P.push('</g>')
  P.push(`<g stroke="#CCCCCC" stroke-width="${fmt(0.5 * pt)}"><line x1="${fmt(axL)}" y1="${fmt(axB)}" x2="${fmt(axR)}" y2="${fmt(axB)}"/><line x1="${fmt(axL)}" y1="${fmt(axT)}" x2="${fmt(axL)}" y2="${fmt(axB)}"/></g>`)

  const tickLen = 3 * pt, pad = 3.5 * pt, ts = 9 * pt
  // At most ~12 date labels, evenly picked among the dates.
  const step = Math.max(1, Math.ceil(f.dates.length / 12))
  const shown = f.dates.filter((_d, i) => i % step === 0)
  P.push(`<g stroke="#666666" stroke-width="${fmt(0.5 * pt)}">`)
  for (const t of yt) P.push(`<line x1="${fmt(axL - tickLen)}" y1="${fmt(py(t))}" x2="${fmt(axL)}" y2="${fmt(py(t))}"/>`)
  for (const d of shown) P.push(`<line x1="${fmt(px(d.x))}" y1="${fmt(axB)}" x2="${fmt(px(d.x))}" y2="${fmt(axB + tickLen)}"/>`)
  P.push(`</g><g font-family="${font}" font-size="${fmt(ts)}" fill="#666666">`)
  let labelsLeft = axL
  yt.forEach((t, i) => {
    const m = measure(yl[i], ts)
    const right = axL - tickLen - pad
    const base = py(t) + (m.ascent - m.descent) / 2
    P.push(`<text x="${fmt(right)}" y="${fmt(base)}" text-anchor="end">${esc(yl[i])}</text>`)
    grow(right - m.width, base - m.ascent, right, base + m.descent)
    labelsLeft = Math.min(labelsLeft, right - m.width)
  })
  const rad = (f.rotation * Math.PI) / 180
  let labelsBottom = axB + tickLen
  for (const d of shown) {
    const m = measure(d.label, ts)
    // ha="right": the text ends at the tick and slopes down to the left.
    const ax = px(d.x), ay = axB + tickLen + pad + m.ascent * Math.cos(rad)
    P.push(`<text x="${fmt(ax)}" y="${fmt(ay)}" text-anchor="end" transform="rotate(${fmt(-f.rotation)} ${fmt(ax)} ${fmt(ay)})">${esc(d.label)}</text>`)
    const dx = m.width * Math.cos(rad), dy = m.width * Math.sin(rad)
    grow(ax - dx - m.ascent, ay - m.ascent, ax + m.descent, ay + dy + m.descent)
    labelsBottom = Math.max(labelsBottom, ay + dy + m.descent)
  }
  P.push('</g>')

  const labSize = 10 * pt
  const ylm = measure(f.ylabel, labSize)
  const lx = labelsLeft - 4 * pt - ylm.descent, ly = (axT + axB) / 2
  P.push(`<text x="${fmt(lx)}" y="${fmt(ly)}" transform="rotate(-90 ${fmt(lx)} ${fmt(ly)})" font-family="${font}" font-size="${fmt(labSize)}" fill="#4D4D4D" text-anchor="middle">${esc(f.ylabel)}</text>`)
  grow(lx - ylm.ascent, ly - ylm.width / 2, lx + ylm.descent, ly + ylm.width / 2)
  if (f.xlabel) {
    const xlm = measure(f.xlabel, labSize)
    const xb = labelsBottom + 4 * pt + xlm.ascent
    P.push(`<text x="${fmt((axL + axR) / 2)}" y="${fmt(xb)}" font-family="${font}" font-size="${fmt(labSize)}" fill="#4D4D4D" text-anchor="middle">${esc(f.xlabel)}</text>`)
    grow((axL + axR) / 2 - xlm.width / 2, xb - xlm.ascent, (axL + axR) / 2 + xlm.width / 2, xb + xlm.descent)
  }

  // Legend in the upper right (matplotlib: border pad 0.4, handle 2.0, gap 0.8, label spacing 0.5, axes pad 0.5, in font sizes).
  const ls = f.legendFontSize * pt
  const em = ls
  const lp = measure('lp', ls)
  const rowH = lp.ascent + lp.descent
  const textW = Math.max(...f.series.map((s) => measure(s.label, ls).width))
  const boxW = 0.4 * em * 2 + 2 * em + 0.8 * em + textW
  const boxH = 0.4 * em * 2 + f.series.length * rowH + (f.series.length - 1) * 0.5 * em
  const bxR = axR - 0.5 * em, bxT = axT + 0.5 * em
  const bxL = bxR - boxW
  P.push(`<rect x="${fmt(bxL)}" y="${fmt(bxT)}" width="${fmt(boxW)}" height="${fmt(boxH)}" rx="${fmt(0.2 * em)}" fill="#FFFFFF" fill-opacity="0.9" stroke="#DDDDDD" stroke-width="${fmt(0.8 * pt)}"/>`)
  f.series.forEach((s, i) => {
    const cy = bxT + 0.4 * em + i * (rowH + 0.5 * em) + rowH / 2
    const hx = bxL + 0.4 * em
    P.push(`<line x1="${fmt(hx)}" y1="${fmt(cy)}" x2="${fmt(hx + 2 * em)}" y2="${fmt(cy)}" stroke="${s.color}" stroke-width="${fmt(f.lineWidth * pt)}"/>`)
    P.push(`<circle cx="${fmt(hx + em)}" cy="${fmt(cy)}" r="${fmt((f.markerSize / 2) * pt)}" fill="${s.color}"/>`)
    P.push(`<text x="${fmt(hx + 2.8 * em)}" y="${fmt(cy + (lp.ascent - lp.descent) / 2)}" font-family="${font}" font-size="${fmt(ls)}" fill="#444444">${esc(s.label)}</text>`)
  })

  const tSize = 13 * pt
  const tm = measure(f.title, tSize, true)
  const tBase = axT - 6 * pt, cx = (axL + axR) / 2
  P.push(`<text x="${fmt(cx)}" y="${fmt(tBase)}" font-family="${font}" font-weight="700" font-size="${fmt(tSize)}" fill="#2D2D2D" text-anchor="middle">${esc(f.title)}</text>`)
  grow(cx - tm.width / 2, tBase - tm.ascent, cx + tm.width / 2, tBase + tm.descent)

  const padPx = k.padInches * f.dpi
  const x = Math.floor(bx0 - padPx), y = Math.floor(by0 - padPx)
  return { svgBody: P.join(''), x, y, width: Math.ceil(bx1 + padPx) - x, height: Math.ceil(by1 + padPx) - y, background: '#FFFFFF' }
}
