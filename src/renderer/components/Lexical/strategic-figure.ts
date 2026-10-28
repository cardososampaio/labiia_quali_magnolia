/**
 * Strategic diagram of themes as labiia_lex draws it (bibliometrix style):
 * matplotlib's default subplot box on a 10 x 7.4 in figure, no ticks, dashed
 * lines at the mean ranks, translucent bubbles with haloed labels, quadrant
 * names in the corners, saved with a tight crop.
 */
import type { StrategicFigure } from '../../models/lexical-figures'
import type { FigureKit } from './bar-figure'

const BOX = { left: 0.125, right: 0.9, bottom: 0.11, top: 0.88 }

export function buildStrategic(f: StrategicFigure, k: FigureKit) {
  const { font, measure, esc, fmt } = k
  const W = f.figW * f.dpi, H = f.figH * f.dpi, pt = f.dpi / 72
  const axL = BOX.left * W, axR = BOX.right * W, axT = (1 - BOX.top) * H, axB = (1 - BOX.bottom) * H
  const px = (x: number): number => axL + ((x - f.xlim[0]) / (f.xlim[1] - f.xlim[0])) * (axR - axL)
  const py = (y: number): number => axB - ((y - f.ylim[0]) / (f.ylim[1] - f.ylim[0])) * (axB - axT)
  let x0 = axL, y0 = axT, x1 = axR, y1 = axB
  const grow = (a: number, b: number, c: number, d: number): void => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d) }
  // A text block laid out like matplotlib: baselines `step` apart, the "lp" box giving ascent and descent.
  const block = (lines: string[], size: number, spacing: number) => {
    const lp = measure('lp', size)
    const step = spacing * (lp.ascent + lp.descent)
    return { ascent: lp.ascent, step, height: lp.ascent + lp.descent + (lines.length - 1) * step, width: Math.max(...lines.map((l) => measure(l, size).width)) }
  }

  const clip = 'lex-strategic-clip'
  const P: string[] = [
    `<defs><clipPath id="${clip}"><rect x="${fmt(axL)}" y="${fmt(axT)}" width="${fmt(axR - axL)}" height="${fmt(axB - axT)}"/></clipPath></defs>`,
    `<rect x="${fmt(axL)}" y="${fmt(axT)}" width="${fmt(axR - axL)}" height="${fmt(axB - axT)}" fill="#FFFFFF"/>`
  ]
  const dash = `${fmt(3.7 * 1.2 * pt)} ${fmt(1.6 * 1.2 * pt)}`
  P.push(`<g clip-path="url(#${clip})" stroke="#333333" stroke-width="${fmt(1.2 * pt)}" stroke-dasharray="${dash}">`)
  P.push(`<line x1="${fmt(px(f.meanX))}" y1="${fmt(axT)}" x2="${fmt(px(f.meanX))}" y2="${fmt(axB)}"/>`)
  P.push(`<line x1="${fmt(axL)}" y1="${fmt(py(f.meanY))}" x2="${fmt(axR)}" y2="${fmt(py(f.meanY))}"/>`)
  P.push('</g>')

  // Large bubbles behind small ones.
  const order = f.bubbles.map((_b, i) => i).sort((a, b) => f.bubbles[b].size - f.bubbles[a].size || a - b)
  P.push(`<g clip-path="url(#${clip})">`)
  for (const i of order) {
    const b = f.bubbles[i]
    const r = (Math.sqrt(b.size) / 2) * pt
    P.push(`<circle cx="${fmt(px(b.x))}" cy="${fmt(py(b.y))}" r="${fmt(r)}" fill="${b.color}" fill-opacity="0.42" stroke="${b.color}" stroke-opacity="0.42" stroke-width="${fmt(pt)}"/>`)
  }
  P.push('</g>')

  const ls = 10.5 * pt
  for (const b of f.bubbles) {
    const bl = block(b.lines, ls, 1.05)
    const cx = px(b.x), top = py(b.y) - bl.height / 2
    b.lines.forEach((line, j) => {
      P.push(`<text x="${fmt(cx)}" y="${fmt(top + bl.ascent + j * bl.step)}" font-family="${font}" font-size="${fmt(ls)}" fill="#1A1A1A" text-anchor="middle" stroke="#FFFFFF" stroke-width="${fmt(2.6 * pt)}" stroke-linejoin="round" paint-order="stroke">${esc(line)}</text>`)
    })
    grow(cx - bl.width / 2, top, cx + bl.width / 2, top + bl.height)
  }

  P.push(`<rect x="${fmt(axL)}" y="${fmt(axT)}" width="${fmt(axR - axL)}" height="${fmt(axB - axT)}" fill="none" stroke="#C8CCD0" stroke-width="${fmt(0.5 * pt)}"/>`)

  const cs = 10 * pt
  const corner = (text: string, right: boolean, topSide: boolean): void => {
    const bl = block([text], cs, 1.2)
    const x = right ? axL + 0.99 * (axR - axL) : axL + 0.01 * (axR - axL)
    const yTop = topSide ? axT + 0.01 * (axB - axT) : axB - 0.01 * (axB - axT) - bl.height
    P.push(`<text x="${fmt(x)}" y="${fmt(yTop + bl.ascent)}" font-family="${font}" font-size="${fmt(cs)}" fill="#8A8F98" text-anchor="${right ? 'end' : 'start'}">${esc(text)}</text>`)
  }
  corner(f.corners.topRight, true, true)
  corner(f.corners.topLeft, false, true)
  corner(f.corners.bottomRight, true, false)
  corner(f.corners.bottomLeft, false, false)

  // Axis labels sit 4 pt from the axes (there are no tick labels).
  const lab = 11 * pt
  const xl = block([f.xlabel], lab, 1.2)
  const xb = axB + 4 * pt + xl.ascent
  P.push(`<text x="${fmt((axL + axR) / 2)}" y="${fmt(xb)}" font-family="${font}" font-size="${fmt(lab)}" fill="#4D4D4D" text-anchor="middle">${esc(f.xlabel)}</text>`)
  grow((axL + axR) / 2 - xl.width / 2, axB, (axL + axR) / 2 + xl.width / 2, axB + 4 * pt + xl.height)
  const yl = block([f.ylabel], lab, 1.2)
  const yx = axL - 4 * pt - (yl.height - yl.ascent)
  const yy = (axT + axB) / 2
  P.push(`<text x="${fmt(yx)}" y="${fmt(yy)}" transform="rotate(-90 ${fmt(yx)} ${fmt(yy)})" font-family="${font}" font-size="${fmt(lab)}" fill="#4D4D4D" text-anchor="middle">${esc(f.ylabel)}</text>`)
  grow(axL - 4 * pt - yl.height, yy - yl.width / 2, axL, yy + yl.width / 2)

  const ts = 14 * pt
  const tm = measure(f.title, ts, true)
  const tb = axT - 6 * pt
  P.push(`<text x="${fmt(axL)}" y="${fmt(tb)}" font-family="${font}" font-weight="700" font-size="${fmt(ts)}" fill="#2D2D2D">${esc(f.title)}</text>`)
  grow(axL, tb - tm.ascent, axL + tm.width, tb + tm.descent)

  const pad = k.padInches * f.dpi
  const x = Math.floor(x0 - pad), y = Math.floor(y0 - pad)
  return { svgBody: P.join(''), x, y, width: Math.ceil(x1 + pad) - x, height: Math.ceil(y1 + pad) - y, background: '#FFFFFF' }
}
