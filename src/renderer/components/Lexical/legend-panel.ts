/**
 * labiia_lex's legend panel (chart_theme.draw_legend_panel) and the figure
 * layout that hosts it (create_figure with a legend panel: a 1 x 2 gridspec,
 * chart then legend).
 */
import type { FigureKit } from './bar-figure'

export interface LegendSpec {
  title: string
  entries: { code: string; label: string; color: string }[]
  fontScale?: number
  compact?: boolean
  /** create_figure's legend_width_scale and legend_gap. */
  widthScale?: number
  gap?: number
}

type Box = { l: number; r: number; t: number; b: number }

/** Width (inches) labiia_lex gives the legend panel, from its longest label. */
export function legendWidth(spec: LegendSpec): number {
  const maxLen = Math.max(10, ...spec.entries.map((e) => e.label.length))
  const w = Math.max(3, Math.min(6, maxLen * 0.115))
  return Math.min(10, w * Math.max(1, spec.widthScale ?? 1))
}

/**
 * matplotlib GridSpec(1, 2, width_ratios=[chart, legend], wspace,
 * left=0.07, right=0.98, top=0.96, bottom=0.12): the two boxes in pixels.
 */
export function chartAndLegendBoxes(W: number, H: number, chartIn: number, legendIn: number, gap: number): { chart: Box; legend: Box } {
  const left = 0.07 * W, right = 0.98 * W, top = (1 - 0.96) * H, bottom = (1 - 0.12) * H
  const wspace = Math.max(0.04, gap)
  const cellW = (right - left) / (2 + wspace)
  const sep = wspace * cellW
  const norm = (cellW * 2) / (chartIn + legendIn)
  const w1 = chartIn * norm, w2 = legendIn * norm
  return { chart: { l: left, r: left + w1, t: top, b: bottom }, legend: { l: left + w1 + sep, r: left + w1 + sep + w2, t: top, b: bottom } }
}

/** labiia_lex's wrapping of "a / b / c" topic labels: two terms on the first line, then as many as fit. */
function wrapTermLabel(label: string, chars: number): string {
  const terms = label.split(' / ').map((t) => t.trim()).filter(Boolean)
  if (terms.length < 2) {
    const lines: string[] = []
    let line = ''
    for (const w of label.split(/\s+/).filter(Boolean)) {
      if (!line) line = w
      else if (line.length + 1 + w.length <= chars) line += ' ' + w
      else { lines.push(line); line = w }
    }
    if (line) lines.push(line)
    return lines.join('\n')
  }
  const lines = [`${terms[0]} / ${terms[1]}`]
  for (const term of terms.slice(2)) {
    const candidate = `${lines[lines.length - 1]} / ${term}`
    if (candidate.length <= chars) lines[lines.length - 1] = candidate
    else { lines[lines.length - 1] += ' /'; lines.push(term) }
  }
  return lines.join('\n')
}

/** Draws the panel inside `box` (pixels); returns its markup. */
export function drawLegendPanel(box: Box, spec: LegendSpec, dpi: number, k: FigureKit): string {
  const { font, measure, esc, fmt } = k
  const pt = dpi / 72
  const fs = spec.fontScale ?? 1
  const W = box.r - box.l, H = box.b - box.t
  const ax = (x: number): number => box.l + x * W
  const ay = (y: number): number => box.b - y * H
  const P: string[] = []
  // Rounded outer box (FancyBboxPatch round, pad 0.02 in panel units).
  const pad = 0.02
  P.push(`<rect x="${fmt(ax(0.03 - pad))}" y="${fmt(ay(0.98 + pad))}" width="${fmt((0.94 + 2 * pad) * W)}" height="${fmt((0.96 + 2 * pad) * H)}" rx="${fmt(pad * Math.min(W, H))}" fill="#F5F9FF" stroke="#CCCCCC" stroke-width="${fmt(1 * pt)}"/>`)
  const titleSize = 10 * fs * pt
  const tm = measure(spec.title, titleSize, true)
  P.push(`<text x="${fmt(ax(0.5))}" y="${fmt(ay(0.956) + tm.ascent)}" font-family="${font}" font-weight="700" font-size="${fmt(titleSize)}" fill="#2D2D2D" text-anchor="middle">${esc(spec.title)}</text>`)
  P.push(`<line x1="${fmt(ax(0.07))}" y1="${fmt(ay(0.91))}" x2="${fmt(ax(0.93))}" y2="${fmt(ay(0.91))}" stroke="#DDDDDD" stroke-width="${fmt(0.8 * pt)}"/>`)

  const panelWIn = W / dpi, panelHIn = H / dpi
  const chars = Math.max(10, Math.floor((panelWIn * 0.56) / (0.095 * Math.max(fs, 1))))
  const wrapped = spec.entries.map((e) => wrapTermLabel(e.label, chars))
  const lineCounts = wrapped.map((w) => w.split('\n').length)
  const totalLines = Math.max(1, lineCounts.reduce((a, b) => a + b, 0))
  const marginTop = 0.885, marginBottom = 0.04
  const usable = marginTop - marginBottom
  const fitting = (usable * panelHIn * 72) / (totalLines * 1.35)
  let textSize = Math.max(5, Math.min(9 * fs, fitting))
  const codeSize = Math.max(5, Math.min(10 * fs, fitting))
  let lineH = usable / totalLines
  if (spec.compact) lineH = Math.min(lineH, ((textSize * 1.35) / 72 / Math.max(panelHIn, 1e-6)) * 1.25)
  const swatchH = Math.min(lineH * 0.72, 0.055)
  // Labels shrink if the widest would overflow the zone right of the codes.
  const zone = W * (0.95 - 0.38)
  const widest = Math.max(...wrapped.flatMap((w) => w.split('\n').map((l) => measure(l, textSize * pt).width)))
  if (widest > zone && zone > 0) textSize = Math.max(5, textSize * (zone / widest) * 0.97)

  let cursor = marginTop
  spec.entries.forEach((e, i) => {
    const block = lineH * lineCounts[i]
    const yc = cursor - block / 2
    cursor -= block
    P.push(`<rect x="${fmt(ax(0.07))}" y="${fmt(ay(yc + swatchH / 2))}" width="${fmt(0.09 * W)}" height="${fmt(swatchH * H)}" rx="${fmt(0.003 * Math.min(W, H))}" fill="${e.color}"/>`)
    const cs = codeSize * pt
    const cm = measure(e.code, cs, true)
    P.push(`<text x="${fmt(ax(0.21))}" y="${fmt(ay(yc) + (cm.ascent - cm.descent) / 2)}" font-family="${font}" font-weight="700" font-size="${fmt(cs)}" fill="#2D2D2D">${esc(e.code)}</text>`)
    const ts = textSize * pt
    const lines = wrapped[i].split('\n')
    const lh = 1.2 * ts
    lines.forEach((line, j) => {
      const base = ay(yc) - ((lines.length - 1) * lh) / 2 + j * lh + 0.346 * ts
      P.push(`<text x="${fmt(ax(0.38))}" y="${fmt(base)}" font-family="${font}" font-size="${fmt(ts)}" fill="#444444">${esc(line)}</text>`)
    })
  })
  return P.join('')
}
