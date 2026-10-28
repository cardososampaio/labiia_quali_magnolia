/**
 * Figures made of a grid of panels, as labiia_lex draws its keyword
 * associations: matplotlib's default style (white panels, black text, left
 * and bottom spines), fig.tight_layout(rect=(0, 0.02, 1, 0.97)) spacing the
 * panels so their labels fit, a bold suptitle and a grey footnote.
 */
import type { PanelBarsFigure, RadialFigure } from '../../models/lexical-figures'
import { autoTicks, tickLabels, type FigureKit } from './bar-figure'

type Box = { l: number; r: number; t: number; b: number }
type Deco = { left: number; right: number; top: number; bottom: number }

/** DejaVu Sans line box (ascender + descender) and baseline offset from its centre, in em. */
const LINE_EM = 1.164
const BASELINE_FROM_CENTRE_EM = 0.346

/** matplotlib tight_layout for a grid: margins and gaps from each panel's decorations. */
function gridBoxes(W: number, H: number, pt: number, rows: number, cols: number, deco: Deco[], suptitleHeight: number): Box[] {
  const pad = 1.08 * 10 * pt
  const at = (r: number, c: number): Deco => deco[r * cols + c] ?? { left: 0, right: 0, top: 0, bottom: 0 }
  const colMax = (c: number, k: keyof Deco): number => Math.max(0, ...Array.from({ length: rows }, (_, r) => at(r, c)[k]))
  const rowMax = (r: number, k: keyof Deco): number => Math.max(0, ...Array.from({ length: cols }, (_, c) => at(r, c)[k]))
  // First pass (no rect): margins from the outer panels' decorations plus the pad, and the
  // suptitle with its own pad on top. Then rect=(0, 0.02, 1, 0.97) is shrunk by those margins.
  const left = colMax(0, 'left') + pad
  const right = W - (colMax(cols - 1, 'right') + pad)
  const top = H * 0.03 + rowMax(0, 'top') + pad + suptitleHeight + pad
  const bottom = H * (1 - 0.02) - (rowMax(rows - 1, 'bottom') + pad)
  // Gaps between panels: the largest facing decorations in any one row or column, plus the pad.
  let hgap = 0
  for (let c = 0; c + 1 < cols; c++) for (let r = 0; r < rows; r++) hgap = Math.max(hgap, at(r, c).right + at(r, c + 1).left)
  hgap += pad
  let vgap = 0
  for (let r = 0; r + 1 < rows; r++) for (let c = 0; c < cols; c++) vgap = Math.max(vgap, at(r, c).bottom + at(r + 1, c).top)
  vgap += pad
  const axW = (right - left - (cols - 1) * hgap) / cols
  const axH = (bottom - top - (rows - 1) * vgap) / rows
  const boxes: Box[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const l = left + c * (axW + hgap)
    const t = top + r * (axH + vgap)
    boxes.push({ l, r: l + axW, t, b: t + axH })
  }
  return boxes
}

/** Height matplotlib gives a one-line 16 pt bold suptitle (its "lp" line metrics). */
function suptitleHeight(pt: number, k: FigureKit): number {
  const size = 16 * pt
  return k.measure('l', size, true).ascent + k.measure('p', size, true).descent
}

interface Canvas { parts: string[]; grow: (a: number, b: number, c: number, d: number) => void; bounds: () => Box }
function canvas(): Canvas {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  return {
    parts: [],
    grow: (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d) },
    bounds: () => ({ l: x0, t: y0, r: x1, b: y1 })
  }
}

function finish(cv: Canvas, f: { title: string; footnote: string; figW: number; figH: number; dpi: number }, k: FigureKit) {
  const { font, measure, esc, fmt } = k
  const W = f.figW * f.dpi, H = f.figH * f.dpi, pt = f.dpi / 72
  // Suptitle: 16 pt bold, top edge at 98% of the figure height.
  const sSize = 16 * pt
  const sm = measure(f.title, sSize, true)
  const sBase = H * 0.02 + sm.ascent
  cv.parts.push(`<text x="${fmt(W / 2)}" y="${fmt(sBase)}" font-family="${font}" font-weight="700" font-size="${fmt(sSize)}" fill="#000000" text-anchor="middle">${esc(f.title)}</text>`)
  cv.grow(W / 2 - sm.width / 2, sBase - sm.ascent, W / 2 + sm.width / 2, sBase + sm.descent)
  // Footnote: 10 pt grey, baseline at 0.5% of the height.
  const nSize = 10 * pt
  const nm = measure(f.footnote, nSize)
  const nBase = H * (1 - 0.005)
  cv.parts.push(`<text x="${fmt(W / 2)}" y="${fmt(nBase)}" font-family="${font}" font-size="${fmt(nSize)}" fill="#555555" text-anchor="middle">${esc(f.footnote)}</text>`)
  cv.grow(W / 2 - nm.width / 2, nBase - nm.ascent, W / 2 + nm.width / 2, nBase + nm.descent)
  const b = cv.bounds()
  const padPx = k.padInches * f.dpi
  const x = Math.floor(b.l - padPx), y = Math.floor(b.t - padPx)
  return { svgBody: cv.parts.join(''), x, y, width: Math.ceil(b.r + padPx) - x, height: Math.ceil(b.b + padPx) - y, background: '#FFFFFF' }
}

export function buildPanelBars(f: PanelBarsFigure, k: FigureKit) {
  const { font, measure, esc, fmt } = k
  const W = f.figW * f.dpi, H = f.figH * f.dpi, pt = f.dpi / 72
  const tickLen = 3.5 * pt, tickPad = 3.5 * pt
  const ySize = 12 * pt, xSize = 10 * pt, titleSize = 14 * pt, valSize = 10 * pt
  const spaceW = (size: number): number => measure('  ', size).width

  const layoutPanel = (p: PanelBarsFigure['panels'][number], box: Box | null): { deco: Deco; draw?: (cv: Canvas) => void } => {
    if ('empty' in p) {
      return {
        deco: { left: 0, right: 0, top: 0, bottom: 0 },
        draw: box ? (cv) => {
          const lines = p.empty.split('\n')
          const cx = (box.l + box.r) / 2, cy = (box.t + box.b) / 2
          const lh = 1.2 * ySize
          lines.forEach((line, j) => {
            const base = cy - ((lines.length - 1) * lh) / 2 + j * lh + BASELINE_FROM_CENTRE_EM * ySize
            cv.parts.push(`<text x="${fmt(cx)}" y="${fmt(base)}" font-family="${font}" font-size="${fmt(ySize)}" fill="#000000" text-anchor="middle">${esc(line)}</text>`)
          })
        } : undefined
      }
    }
    const labelW = Math.max(0, ...p.bars.map((b) => measure(b.label, ySize).width))
    const tm = measure(p.title, titleSize, true)
    const xm = measure(p.xlabel, xSize)
    const deco: Deco = {
      left: tickLen + tickPad + labelW,
      right: 0,
      top: 6 * pt + tm.ascent + tm.descent,
      bottom: tickLen + tickPad + LINE_EM * xSize + 4 * pt + LINE_EM * xSize
    }
    if (!box) return { deco }
    const n = p.bars.length
    const half = 0.4
    const span = Math.max(n - 1, 0) + 0.8
    const y0 = -half - 0.05 * span, y1 = n - 1 + half + 0.05 * span
    const px = (x: number): number => box.l + (x / p.xmax) * (box.r - box.l)
    const py = (y: number): number => box.b - ((y - y0) / (y1 - y0)) * (box.b - box.t)
    // Value labels may reach past the right edge; tight_layout makes room for them.
    deco.right = Math.max(0, ...p.bars.map((b) => px(b.value) + spaceW(valSize) + measure(b.text.trim(), valSize).width - box.r))
    return {
      deco,
      draw: (cv) => {
        const P = cv.parts
        p.bars.forEach((b, i) => {
          const top = py(i + half), bottom = py(i - half)
          P.push(`<rect x="${fmt(px(0))}" y="${fmt(top)}" width="${fmt(Math.max(0, px(b.value) - px(0)))}" height="${fmt(bottom - top)}" fill="${p.color}" fill-opacity="0.9"/>`)
        })
        P.push(`<g stroke="#000000" stroke-width="${fmt(0.8 * pt)}"><line x1="${fmt(box.l)}" y1="${fmt(box.b)}" x2="${fmt(box.r)}" y2="${fmt(box.b)}"/><line x1="${fmt(box.l)}" y1="${fmt(box.t)}" x2="${fmt(box.l)}" y2="${fmt(box.b)}"/>`)
        const nbins = Math.max(1, Math.min(9, Math.floor((box.r - box.l) / pt / 30)))
        const ticks = autoTicks(0, p.xmax, nbins)
        const { labels } = tickLabels(ticks)
        for (const t of ticks) P.push(`<line x1="${fmt(px(t))}" y1="${fmt(box.b)}" x2="${fmt(px(t))}" y2="${fmt(box.b + tickLen)}"/>`)
        p.bars.forEach((_b, i) => P.push(`<line x1="${fmt(box.l - tickLen)}" y1="${fmt(py(i))}" x2="${fmt(box.l)}" y2="${fmt(py(i))}"/>`))
        P.push(`</g><g font-family="${font}" fill="#000000">`)
        let xlBottom = box.b + tickLen + tickPad
        ticks.forEach((t, i) => {
          const m = measure(labels[i], xSize)
          const base = box.b + tickLen + tickPad + m.ascent
          P.push(`<text x="${fmt(px(t))}" y="${fmt(base)}" font-size="${fmt(xSize)}" text-anchor="middle">${esc(labels[i])}</text>`)
          cv.grow(px(t) - m.width / 2, base - m.ascent, px(t) + m.width / 2, base + m.descent)
          xlBottom = Math.max(xlBottom, base + m.descent)
        })
        p.bars.forEach((b, i) => {
          const m = measure(b.label, ySize)
          const right = box.l - tickLen - tickPad
          const base = py(i) + BASELINE_FROM_CENTRE_EM * ySize
          P.push(`<text x="${fmt(right)}" y="${fmt(base)}" font-size="${fmt(ySize)}" text-anchor="end">${esc(b.label)}</text>`)
          cv.grow(right - m.width, base - m.ascent, right, base + m.descent)
        })
        P.push('</g>')
        p.bars.forEach((b, i) => {
          const x = px(b.value) + spaceW(valSize)
          const text = b.text.trim()
          const m = measure(text, valSize)
          const base = py(i) + BASELINE_FROM_CENTRE_EM * valSize
          P.push(`<text x="${fmt(x)}" y="${fmt(base)}" font-family="${font}" font-size="${fmt(valSize)}" fill="#333333">${esc(text)}</text>`)
          cv.grow(x, base - m.ascent, x + m.width, base + m.descent)
        })
        const xm2 = measure(p.xlabel, xSize)
        const lb = xlBottom + 4 * pt + xm2.ascent
        const cx = (box.l + box.r) / 2
        P.push(`<text x="${fmt(cx)}" y="${fmt(lb)}" font-family="${font}" font-size="${fmt(xSize)}" fill="#000000" text-anchor="middle">${esc(p.xlabel)}</text>`)
        cv.grow(cx - xm2.width / 2, lb - xm2.ascent, cx + xm2.width / 2, lb + xm2.descent)
        const tb = box.t - 6 * pt
        P.push(`<text x="${fmt(cx)}" y="${fmt(tb)}" font-family="${font}" font-weight="700" font-size="${fmt(titleSize)}" fill="${p.color}" text-anchor="middle">${esc(p.title)}</text>`)
        cv.grow(cx - tm.width / 2, tb - tm.ascent, cx + tm.width / 2, tb + tm.descent)
        cv.grow(box.l, box.t, box.r, box.b)
      }
    }
  }

  // First pass on equal cells to measure what reaches past the panels, then lay out and draw.
  const supH = suptitleHeight(pt, k)
  const first = gridBoxes(W, H, pt, f.rows, f.cols, f.panels.map((p) => layoutPanel(p, null).deco), supH)
  const firstDeco = f.panels.map((p, i) => layoutPanel(p, first[i]).deco)
  const boxes = gridBoxes(W, H, pt, f.rows, f.cols, firstDeco, supH)
  const cv = canvas()
  f.panels.forEach((p, i) => layoutPanel(p, boxes[i]).draw?.(cv))
  return finish(cv, f, k)
}

export function buildRadial(f: RadialFigure, k: FigureKit) {
  const { font, measure, esc, fmt } = k
  const W = f.figW * f.dpi, H = f.figH * f.dpi, pt = f.dpi / 72
  const boxes = gridBoxes(W, H, pt, f.rows, f.cols, f.panels.map(() => ({ left: 0, right: 0, top: 0, bottom: 0 })), suptitleHeight(pt, k))
  const cv = canvas()
  f.panels.forEach((p, i) => {
    const cell = boxes[i]
    // Equal aspect on x -1.45..1.45, y -1.3..1.3: the panel shrinks to keep it, centred in its cell.
    const scale = Math.min((cell.r - cell.l) / 2.9, (cell.b - cell.t) / 2.6)
    const cx = (cell.l + cell.r) / 2, cy = (cell.t + cell.b) / 2
    const px = (x: number): number => cx + x * scale
    const py = (y: number): number => cy - y * scale
    // The tight crop keeps each (hidden) panel box.
    cv.grow(px(-1.45), py(1.3), px(1.45), py(-1.3))
    for (const s of p.spokes) {
      cv.parts.push(`<line x1="${fmt(px(0))}" y1="${fmt(py(0))}" x2="${fmt(px(s.x))}" y2="${fmt(py(s.y))}" stroke="${p.color}" stroke-opacity="${fmt(s.alpha)}" stroke-width="${fmt(s.width * pt)}" stroke-linecap="square"/>`)
    }
    const label = (text: string, x: number, y: number, size: number, opts: { bold: boolean; fill: string; text: string; edge: string | null; pad: number }): void => {
      const sizePx = size * pt
      const m = measure(text, sizePx, opts.bold)
      const padPx = opts.pad * sizePx
      const w = m.width + 2 * padPx
      const h = LINE_EM * sizePx + 2 * padPx
      const bx = px(x) - w / 2, by = py(y) - h / 2
      cv.parts.push(`<rect x="${fmt(bx)}" y="${fmt(by)}" width="${fmt(w)}" height="${fmt(h)}" rx="${fmt(padPx)}" fill="${opts.fill}"${opts.edge ? ` stroke="${opts.edge}" stroke-width="${fmt(0.9 * pt)}"` : ''}/>`)
      cv.parts.push(`<text x="${fmt(px(x))}" y="${fmt(py(y) + BASELINE_FROM_CENTRE_EM * sizePx)}" font-family="${font}" font-size="${fmt(sizePx)}"${opts.bold ? ' font-weight="700"' : ''} fill="${opts.text}" text-anchor="middle">${esc(text)}</text>`)
      cv.grow(bx, by, bx + w, by + h)
    }
    for (const s of p.spokes) label(s.label, s.x, s.y, s.size, { bold: false, fill: '#FFFFFF', text: '#151515', edge: p.color, pad: 0.25 })
    label(p.focal, 0, 0, 18, { bold: true, fill: p.color, text: '#FFFFFF', edge: null, pad: 0.5 })
  })
  return finish(cv, f, k)
}
