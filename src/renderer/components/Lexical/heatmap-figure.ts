/**
 * LDA document x topic heatmap as labiia_lex draws it: matplotlib imshow
 * with the YlGnBu colour map, values in the cells, a colour bar, and the
 * legend panel with the topic labels.
 */
import type { HeatmapFigure } from '../../models/lexical-figures'
import { autoTicks, tickLabels, type FigureKit } from './bar-figure'
import { chartAndLegendBoxes, drawLegendPanel, legendWidth } from './legend-panel'

// matplotlib's YlGnBu segment data (ColorBrewer), sampled into its 256-entry table.
const STOPS: [number, number, number][] = [
  [1.0, 1.0, 0.85098], [0.929412, 0.972549, 0.694118], [0.780392, 0.913725, 0.705882], [0.498039, 0.803922, 0.733333],
  [0.254902, 0.713725, 0.768627], [0.113725, 0.568627, 0.752941], [0.133333, 0.368627, 0.658824], [0.145098, 0.203922, 0.580392],
  [0.031373, 0.113725, 0.345098]
]
const LUT: string[] = Array.from({ length: 256 }, (_v, i) => {
  const x = (i / 255) * 8
  const k = Math.min(7, Math.floor(x))
  const t = x - k
  const c = STOPS[k].map((a, j) => a + (STOPS[k + 1][j] - a) * t)
  return '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
})
export function ylGnBu(norm: number): string {
  const i = norm >= 1 ? 255 : Math.max(0, Math.floor(norm * 256))
  return LUT[Math.min(255, i)]
}

export function buildHeatmap(f: HeatmapFigure, k: FigureKit) {
  const { font, measure, esc, fmt } = k
  const W = f.figW * f.dpi, H = f.figH * f.dpi, pt = f.dpi / 72
  const legIn = legendWidth(f.legend)
  const boxes = chartAndLegendBoxes(W, H, f.figW - legIn, legIn, f.legend.gap ?? 0.04)
  const parent = boxes.chart
  // fig.colorbar(fraction=0.035, pad=0.02): the colour bar takes room from the heatmap's right side.
  const pw = parent.r - parent.l
  const axL = parent.l, axR = parent.l + pw * (1 - 0.035 - 0.02)
  const axT = parent.t, axB = parent.b
  const cbW = pw * 0.035
  const cbH = Math.min(axB - axT, cbW * 20)
  const cbL = axR + pw * 0.02, cbT = (axT + axB) / 2 - cbH / 2
  const rows = f.matrix.length, cols = f.colLabels.length
  const cw = (axR - axL) / cols, ch = (axB - axT) / rows
  const span = Math.max(f.vmax - f.vmin, 1e-10)
  const P: string[] = []
  f.matrix.forEach((row, i) => row.forEach((v, j) => {
    P.push(`<rect x="${fmt(axL + j * cw)}" y="${fmt(axT + i * ch)}" width="${fmt(cw + 0.5)}" height="${fmt(ch + 0.5)}" fill="${ylGnBu((v - f.vmin) / span)}"/>`)
  }))
  const cell = f.cellFont * pt
  f.matrix.forEach((row, i) => row.forEach((v, j) => {
    const text = v.toFixed(2)
    const m = measure(text, cell)
    const color = (v - f.vmin) / span > 0.55 ? '#FFFFFF' : '#2D2D2D'
    P.push(`<text x="${fmt(axL + (j + 0.5) * cw)}" y="${fmt(axT + (i + 0.5) * ch + (m.ascent - m.descent) / 2)}" font-family="${font}" font-size="${fmt(cell)}" fill="${color}" text-anchor="middle">${text}</text>`)
  }))
  let x0 = axL, y0 = axT, x1 = cbL + cbW, y1 = axB
  const grow = (a: number, b: number, c: number, d: number): void => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d) }
  // Tick labels (no tick marks): topics below in bold, documents to the left.
  const xs = 16 * pt, ys = (f.cellFont + 1) * pt
  f.colLabels.forEach((l, j) => {
    const m = measure(l, xs, true)
    const base = axB + 3.5 * pt + m.ascent
    P.push(`<text x="${fmt(axL + (j + 0.5) * cw)}" y="${fmt(base)}" font-family="${font}" font-weight="700" font-size="${fmt(xs)}" fill="#666666" text-anchor="middle">${esc(l)}</text>`)
    grow(axL + (j + 0.5) * cw - m.width / 2, base - m.ascent, axL + (j + 0.5) * cw + m.width / 2, base + m.descent)
  })
  f.rowLabels.forEach((l, i) => {
    const m = measure(l, ys)
    const x = axL - 3.5 * pt
    P.push(`<text x="${fmt(x)}" y="${fmt(axT + (i + 0.5) * ch + (m.ascent - m.descent) / 2)}" font-family="${font}" font-size="${fmt(ys)}" fill="#666666" text-anchor="end">${esc(l)}</text>`)
    grow(x - m.width, axT + i * ch, x, axT + (i + 1) * ch)
  })
  // Colour bar: the colour ramp, its ticks and label.
  // A smooth gradient through the colour map's stops (bottom = lowest value).
  const stops = STOPS.map((c, i) => `<stop offset="${fmt(i / 8)}" stop-color="#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}"/>`).join('')
  P.push(`<defs><linearGradient id="lex-ylgnbu" x1="0" y1="1" x2="0" y2="0">${stops}</linearGradient></defs>`)
  P.push(`<rect x="${fmt(cbL)}" y="${fmt(cbT)}" width="${fmt(cbW)}" height="${fmt(cbH)}" fill="url(#lex-ylgnbu)"/>`)
  P.push(`<rect x="${fmt(cbL)}" y="${fmt(cbT)}" width="${fmt(cbW)}" height="${fmt(cbH)}" fill="none" stroke="#CCCCCC" stroke-width="${fmt(0.5 * pt)}"/>`)
  const ticks = autoTicks(f.vmin, f.vmax, Math.max(1, Math.min(9, Math.floor(cbH / pt / 24))))
  const { labels } = tickLabels(ticks)
  const ts = 12 * pt
  let labelRight = cbL + cbW
  ticks.forEach((t, i) => {
    const y = cbT + cbH - ((t - f.vmin) / span) * cbH
    const m = measure(labels[i], ts)
    P.push(`<line x1="${fmt(cbL + cbW)}" y1="${fmt(y)}" x2="${fmt(cbL + cbW + 3.5 * pt)}" y2="${fmt(y)}" stroke="#666666" stroke-width="${fmt(0.8 * pt)}"/>`)
    P.push(`<text x="${fmt(cbL + cbW + 7 * pt)}" y="${fmt(y + (m.ascent - m.descent) / 2)}" font-family="${font}" font-size="${fmt(ts)}" fill="#666666">${labels[i]}</text>`)
    labelRight = Math.max(labelRight, cbL + cbW + 7 * pt + m.width)
  })
  const ls = 14 * pt
  const lm = measure(f.colorbarLabel, ls)
  const lx = labelRight + 4 * pt + lm.ascent, ly = cbT + cbH / 2
  P.push(`<text x="${fmt(lx)}" y="${fmt(ly)}" transform="rotate(-90 ${fmt(lx)} ${fmt(ly)})" font-family="${font}" font-size="${fmt(ls)}" fill="#4D4D4D" text-anchor="middle">${esc(f.colorbarLabel)}</text>`)
  grow(cbL, cbT, lx + lm.descent, cbT + cbH)
  const tsz = 18 * pt
  const tm = measure(f.title, tsz, true)
  const tb = axT - 6 * pt
  P.push(`<text x="${fmt((axL + axR) / 2)}" y="${fmt(tb)}" font-family="${font}" font-weight="700" font-size="${fmt(tsz)}" fill="#2D2D2D" text-anchor="middle">${esc(f.title)}</text>`)
  grow((axL + axR) / 2 - tm.width / 2, tb - tm.ascent, (axL + axR) / 2 + tm.width / 2, tb + tm.descent)
  P.push(drawLegendPanel(boxes.legend, f.legend, f.dpi, k))
  grow(boxes.legend.l, boxes.legend.t, boxes.legend.r, boxes.legend.b)
  const pad = k.padInches * f.dpi
  const x = Math.floor(x0 - pad), y = Math.floor(y0 - pad)
  return { svgBody: P.join(''), x, y, width: Math.ceil(x1 + pad) - x, height: Math.ceil(y1 + pad) - y, background: '#FFFFFF' }
}
