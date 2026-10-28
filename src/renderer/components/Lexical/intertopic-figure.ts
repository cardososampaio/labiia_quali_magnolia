/**
 * LDA intertopic distance map as labiia_lex saves it (9 x 8 in at the
 * theme's 120 dpi, cropped to the content): equal-aspect axes laid out by tight_layout, grid,
 * zero lines, translucent circles, comma decimals, left-aligned title and a
 * footnote.
 */
import type { IntertopicFigure } from '../../models/lexical-figures'
import { autoTicks, type FigureKit } from './bar-figure'

export function buildIntertopic(f: IntertopicFigure, k: FigureKit) {
  const { font, measure, esc, fmt } = k
  const W = f.figW * f.dpi, H = f.figH * f.dpi, pt = f.dpi / 72
  const pad = 1.08 * 10 * pt
  const tickLen = 3.5 * pt, tickPad = 3.5 * pt, tickSize = 9 * pt, labelSize = 12 * pt, titleSize = 15 * pt
  const comma = (v: number): string => v.toFixed(2).replace('.', ',')
  const yLabelWidth = Math.max(...[f.ylim[0], f.ylim[1], 0].map((v) => measure(comma(v), tickSize).width))
  const tm = measure(f.title, titleSize, true)
  const line = (size: number): number => measure('l', size).ascent + measure('p', size).descent

  // tight_layout(rect=(0, 0.03, 1, 1)): margins from the decorations plus the pad.
  const decoL = tickLen + tickPad + yLabelWidth + 4 * pt + line(labelSize)
  const decoB = tickLen + tickPad + line(tickSize) + 4 * pt + line(labelSize)
  const decoT = 6 * pt + tm.ascent + tm.descent
  const cellL = decoL + pad, cellR = W - pad - measure(comma(f.xlim[1]), tickSize).width / 2
  const cellT = decoT + pad, cellB = H * (1 - 0.03) - (decoB + pad)
  // Equal aspect: the panel shrinks to the data's proportions, centred in its cell.
  const dx = f.xlim[1] - f.xlim[0], dy = f.ylim[1] - f.ylim[0]
  const scale = Math.min((cellR - cellL) / dx, (cellB - cellT) / dy)
  const axW = dx * scale, axH = dy * scale
  const axL = (cellL + cellR - axW) / 2, axR = axL + axW
  const axT = (cellT + cellB - axH) / 2, axB = axT + axH
  const px = (x: number): number => axL + (x - f.xlim[0]) * scale
  const py = (y: number): number => axB - (y - f.ylim[0]) * scale

  const P: string[] = [`<rect x="${fmt(axL)}" y="${fmt(axT)}" width="${fmt(axW)}" height="${fmt(axH)}" fill="#FFFFFF"/>`]
  const xt = autoTicks(f.xlim[0], f.xlim[1], Math.max(1, Math.min(9, Math.floor(axW / pt / 27))))
  const yt = autoTicks(f.ylim[0], f.ylim[1], Math.max(1, Math.min(9, Math.floor(axH / pt / 18))))
  P.push(`<g stroke="#E5E5E5" stroke-opacity="0.7" stroke-width="${fmt(0.6 * pt)}">`)
  for (const t of xt) P.push(`<line x1="${fmt(px(t))}" y1="${fmt(axT)}" x2="${fmt(px(t))}" y2="${fmt(axB)}"/>`)
  for (const t of yt) P.push(`<line x1="${fmt(axL)}" y1="${fmt(py(t))}" x2="${fmt(axR)}" y2="${fmt(py(t))}"/>`)
  P.push('</g>')
  P.push(`<g stroke="#9AA0A6" stroke-width="${fmt(0.8 * pt)}"><line x1="${fmt(axL)}" y1="${fmt(py(0))}" x2="${fmt(axR)}" y2="${fmt(py(0))}"/><line x1="${fmt(px(0))}" y1="${fmt(axT)}" x2="${fmt(px(0))}" y2="${fmt(axB)}"/></g>`)

  for (const t of f.topics) {
    P.push(`<circle cx="${fmt(px(t.x))}" cy="${fmt(py(t.y))}" r="${fmt(t.r * scale)}" fill="#0E74B8" fill-opacity="0.28" stroke="#0B4F7D" stroke-opacity="0.28" stroke-width="${fmt(1.2 * pt)}"/>`)
  }
  for (const t of f.topics) {
    const cx = px(t.x), cy = py(t.y)
    const idSize = 13 * pt
    const im = measure(String(t.id), idSize, true)
    P.push(`<text x="${fmt(cx)}" y="${fmt(cy - im.descent)}" font-family="${font}" font-weight="700" font-size="${fmt(idSize)}" fill="#1A1A1A" text-anchor="middle">${t.id}</text>`)
    const ls = 8.5 * pt
    const lh = 1.1 * 1.164 * ls
    t.lines.forEach((l, j) => {
      const base = cy + measure('l', ls).ascent + j * lh
      P.push(`<text x="${fmt(cx)}" y="${fmt(base)}" font-family="${font}" font-size="${fmt(ls)}" fill="#1A1A1A" text-anchor="middle">${esc(l)}</text>`)
    })
  }

  P.push(`<rect x="${fmt(axL)}" y="${fmt(axT)}" width="${fmt(axW)}" height="${fmt(axH)}" fill="none" stroke="#C8CCD0" stroke-width="${fmt(0.5 * pt)}"/>`)
  P.push(`<g stroke="#5F6368" stroke-width="${fmt(0.8 * pt)}">`)
  for (const t of xt) P.push(`<line x1="${fmt(px(t))}" y1="${fmt(axB)}" x2="${fmt(px(t))}" y2="${fmt(axB + tickLen)}"/>`)
  for (const t of yt) P.push(`<line x1="${fmt(axL - tickLen)}" y1="${fmt(py(t))}" x2="${fmt(axL)}" y2="${fmt(py(t))}"/>`)
  P.push(`</g><g font-family="${font}" font-size="${fmt(tickSize)}" fill="#5F6368">`)
  for (const t of xt) {
    const m = measure(comma(t), tickSize)
    P.push(`<text x="${fmt(px(t))}" y="${fmt(axB + tickLen + tickPad + m.ascent)}" text-anchor="middle">${comma(t)}</text>`)
  }
  for (const t of yt) {
    const m = measure(comma(t), tickSize)
    P.push(`<text x="${fmt(axL - tickLen - tickPad)}" y="${fmt(py(t) + (m.ascent - m.descent) / 2)}" text-anchor="end">${comma(t)}</text>`)
  }
  P.push('</g>')
  const xl = measure('CP1', labelSize)
  P.push(`<text x="${fmt((axL + axR) / 2)}" y="${fmt(axB + tickLen + tickPad + line(tickSize) + 4 * pt + xl.ascent)}" font-family="${font}" font-size="${fmt(labelSize)}" fill="#4D4D4D" text-anchor="middle">CP1</text>`)
  const ylx = axL - tickLen - tickPad - yLabelWidth - 4 * pt - measure('CP2', labelSize).descent
  const yly = (axT + axB) / 2
  P.push(`<text x="${fmt(ylx)}" y="${fmt(yly)}" transform="rotate(-90 ${fmt(ylx)} ${fmt(yly)})" font-family="${font}" font-size="${fmt(labelSize)}" fill="#4D4D4D" text-anchor="middle">CP2</text>`)
  P.push(`<text x="${fmt(axL)}" y="${fmt(axT - 6 * pt)}" font-family="${font}" font-weight="700" font-size="${fmt(titleSize)}" fill="#1A1A1A">${esc(f.title)}</text>`)
  const fm = measure(f.footnote, 9 * pt)
  P.push(`<text x="${fmt(0.01 * W)}" y="${fmt(H * (1 - 0.01))}" font-family="${font}" font-size="${fmt(9 * pt)}" fill="#5F6368">${esc(f.footnote)}</text>`)
  // labiia_lex's theme saves with bbox="tight": crop to the drawn content plus the pad.
  const xr = measure(comma(xt[xt.length - 1]), tickSize).width / 2
  const x0 = Math.min(0.01 * W, ylx - measure('CP2', labelSize).ascent)
  const x1 = Math.max(axR, px(xt[xt.length - 1]) + xr, 0.01 * W + fm.width, axL + tm.width)
  const y0 = Math.min(axT - 6 * pt - tm.ascent, py(yt[yt.length - 1]) - tickSize)
  const y1 = H * (1 - 0.01) + fm.descent
  const padPx = k.padInches * f.dpi
  const x = Math.floor(x0 - padPx), y = Math.floor(y0 - padPx)
  return { svgBody: P.join(''), x, y, width: Math.ceil(x1 + padPx) - x, height: Math.ceil(y1 + padPx) - y, background: '#FFFFFF' }
}
