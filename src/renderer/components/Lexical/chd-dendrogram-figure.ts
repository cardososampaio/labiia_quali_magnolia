/**
 * The CHD dendrogram as labiia_lex draws it (matplotlib, axes hidden, 160 dpi,
 * tight crop): tree lines, class names, rounded boxes with the class share,
 * and the words of each class in the class colour.
 */
import type { ChdDendrogramFigure } from '../../models/lexical-figures'
import type { FigureKit } from './bar-figure'

const BOX = { left: 0.125, right: 0.9, bottom: 0.11, top: 0.88 }

export function buildChdDendrogram(f: ChdDendrogramFigure, k: FigureKit) {
  const { font, measure, esc, fmt } = k
  const W = f.figW * f.dpi, H = f.figH * f.dpi, pt = f.dpi / 72
  const n = f.classes.length
  const axL = BOX.left * W, axR = BOX.right * W, axT = (1 - BOX.top) * H, axB = (1 - BOX.bottom) * H
  const x0d = 0.35, x1d = n + 0.65
  const px = (x: number): number => axL + ((x - x0d) / (x1d - x0d)) * (axR - axL)
  const py = (y: number): number => axB - y * (axB - axT)
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity
  const grow = (a: number, b: number, c: number, d: number): void => { bx0 = Math.min(bx0, a); by0 = Math.min(by0, b); bx1 = Math.max(bx1, c); by1 = Math.max(by1, d) }
  const P: string[] = []

  P.push(`<g stroke="#2D2D2D" stroke-width="${fmt(1.8 * pt)}" stroke-linecap="round">`)
  for (const [x1, y1, x2, y2] of f.lines) {
    P.push(`<line x1="${fmt(px(x1))}" y1="${fmt(py(y1))}" x2="${fmt(px(x2))}" y2="${fmt(py(y2))}"/>`)
    grow(Math.min(px(x1), px(x2)), Math.min(py(y1), py(y2)), Math.max(px(x1), px(x2)), Math.max(py(y1), py(y2)))
  }
  P.push('</g>')

  // A text line placed like matplotlib: va center or top against the "lp" box.
  const lp = (size: number) => measure('lp', size)
  for (const c of f.classes) {
    const cx = px(c.x)
    const ls = 11 * pt
    const lm = measure(`classe ${c.id}`, ls, true)
    const lb = py(0.6) + (lp(ls).ascent - lp(ls).descent) / 2
    P.push(`<text x="${fmt(cx)}" y="${fmt(lb)}" font-family="${font}" font-weight="700" font-size="${fmt(ls)}" fill="${c.color}" text-anchor="middle">classe ${c.id}</text>`)
    grow(cx - lm.width / 2, lb - lm.ascent, cx + lm.width / 2, lb + lm.descent)

    // FancyBboxPatch(round, pad 0.008, rounding 0.006) in data units.
    const pad = 0.008, h = 0.065
    const rl = px(c.x - f.rectW / 2 - pad), rr = px(c.x + f.rectW / 2 + pad)
    const rt = py(0.515 + h / 2 + pad), rb = py(0.515 - h / 2 - pad)
    const rx = px(0.006) - px(0), ry = py(0) - py(0.006)
    P.push(`<rect x="${fmt(rl)}" y="${fmt(rt)}" width="${fmt(rr - rl)}" height="${fmt(rb - rt)}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="${c.color}" stroke="#1F1F1F" stroke-width="${fmt(pt)}"/>`)
    grow(rl, rt, rr, rb)
    const ps = 10 * pt
    const pb = py(0.515) + (lp(ps).ascent - lp(ps).descent) / 2
    P.push(`<text x="${fmt(cx)}" y="${fmt(pb)}" font-family="${font}" font-weight="700" font-size="${fmt(ps)}" fill="#FFFFFF" text-anchor="middle">${c.percent.toFixed(1)}%</text>`)

    let y = 0.43
    const stepY = Math.min(0.036, Math.max(0.019, 0.405 / Math.max(1, c.words.length)))
    const left = px(c.x - f.rectW / 2)
    c.words.forEach((w, rank) => {
      if (y < 0.035) return
      const size = Math.max(7.2, Math.min(11.4, 11 - rank * 0.055)) * pt
      const m = measure(w, size)
      const base = py(y) + lp(size).ascent
      P.push(`<text x="${fmt(left)}" y="${fmt(base)}" font-family="${font}" font-size="${fmt(size)}" fill="${c.color}">${esc(w)}</text>`)
      grow(left, py(y), left + m.width, base + m.descent)
      y -= stepY
    })
  }

  const ts = 14 * pt
  const tm = measure(f.title, ts, true)
  const tb = axT - 14 * pt
  const tx = (axL + axR) / 2
  P.push(`<text x="${fmt(tx)}" y="${fmt(tb)}" font-family="${font}" font-weight="700" font-size="${fmt(ts)}" fill="#2D2D2D" text-anchor="middle">${esc(f.title)}</text>`)
  grow(tx - tm.width / 2, tb - tm.ascent, tx + tm.width / 2, tb + tm.descent)

  const padPx = k.padInches * f.dpi
  const x = Math.floor(bx0 - padPx), y = Math.floor(by0 - padPx)
  return { svgBody: P.join(''), x, y, width: Math.ceil(bx1 + padPx) - x, height: Math.ceil(by1 + padPx) - y, background: '#FFFFFF' }
}
