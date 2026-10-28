/**
 * Draws the figures lexical tests describe as data (see models/lexical-figures),
 * reproducing matplotlib's page geometry so they look like labiia_lex's PNGs:
 * figure size in inches at its dpi, default axes box, data margins, sizes in
 * points, DejaVu Sans (matplotlib's font), and the "tight" crop with a
 * 0.1-inch pad that labiia_lex saves with. Exports PNG at the same pixel size
 * and SVG with the font embedded.
 */
import { useEffect, useMemo, useState } from 'react'
import type { LexicalFigure, NetworkFigure, TreeFigure } from '../../models/lexical-figures'
import { t } from '../../i18n'
import dejavuUrl from '../../assets/fonts/DejaVuSans.ttf?url'
import dejavuBoldUrl from '../../assets/fonts/DejaVuSans-Bold.ttf?url'
import { buildBars } from './bar-figure'
import { buildPanelBars, buildRadial } from './panel-figures'
import { buildVBars } from './vbar-figure'
import { buildIntertopic } from './intertopic-figure'
import { buildHeatmap } from './heatmap-figure'
import { buildStrategic } from './strategic-figure'
import { buildChdDendrogram } from './chd-dendrogram-figure'
import { buildTimeline } from './timeline-figure'

const FONT = 'LexDejaVu'
// matplotlib's default subplot box (figure fractions) and savefig pad.
const AX_LEFT = 0.125
const AX_RIGHT = 0.9
const AX_BOTTOM = 0.11
const AX_TOP = 0.88
const PAD_INCHES = 0.1

let fontsReady: Promise<void> | null = null
function loadFonts(): Promise<void> {
  if (!fontsReady) {
    const faces = [new FontFace(FONT, `url(${dejavuUrl})`, { weight: '400' }), new FontFace(FONT, `url(${dejavuBoldUrl})`, { weight: '700' })]
    fontsReady = Promise.all(faces.map((f) => f.load())).then((loaded) => { for (const f of loaded) document.fonts.add(f) })
  }
  return fontsReady
}

let measureCtx: CanvasRenderingContext2D | null = null
function measure(text: string, px: number, bold = false): { width: number; ascent: number; descent: number } {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  const ctx = measureCtx!
  ctx.font = `${bold ? 700 : 400} ${px}px ${FONT}`
  const m = ctx.measureText(text)
  return { width: m.width, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent }
}

// Runs of spaces are kept (SVG would collapse them; labiia_lex's titles use double spaces).
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/ {2,}/g, (m) => ' ' + '\u00a0'.repeat(m.length - 1))
const fmt = (n: number): string => (Math.round(n * 100) / 100).toString()

interface Built { svgBody: string; x: number; y: number; width: number; height: number; background: string }

/** The network figure as SVG markup in pixels, cropped like savefig(bbox_inches="tight"). */
function buildNetwork(f: NetworkFigure): Built {
  const W = f.figW * f.dpi
  const H = f.figH * f.dpi
  const pt = f.dpi / 72
  const xs = f.nodes.map((n) => n.x)
  const ys = f.nodes.map((n) => n.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const dx = maxX - minX || 1
  const dy = maxY - minY || 1
  const x0 = minX - f.margins * dx, x1 = maxX + f.margins * dx
  const y0 = minY - f.margins * dy, y1 = maxY + f.margins * dy
  const axL = AX_LEFT * W, axR = AX_RIGHT * W, axT = (1 - AX_TOP) * H, axB = (1 - AX_BOTTOM) * H
  const px = (x: number): number => axL + ((x - x0) / (x1 - x0)) * (axR - axL)
  const py = (y: number): number => axB - ((y - y0) / (y1 - y0)) * (axB - axT)

  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity
  const grow = (a: number, b: number, c: number, d: number): void => {
    bx0 = Math.min(bx0, a); by0 = Math.min(by0, b); bx1 = Math.max(bx1, c); by1 = Math.max(by1, d)
  }
  const parts: string[] = []
  // matplotlib's tight crop always contains the axes box, even with the axes hidden.
  grow(axL, axT, axR, axB)

  parts.push(`<g stroke="${f.edgeColor}" stroke-opacity="${f.edgeAlpha}" stroke-linecap="square" fill="none">`)
  for (const e of f.edges) {
    const a = [px(e.x1), py(e.y1), px(e.x2), py(e.y2)]
    parts.push(`<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(a[2])}" y2="${fmt(a[3])}" stroke-width="${fmt(e.width * pt)}"/>`)
    grow(Math.min(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[0], a[2]), Math.max(a[1], a[3]))
  }
  parts.push('</g>')

  parts.push(`<g fill-opacity="${f.nodeAlpha}" stroke="#FFFFFF" stroke-opacity="${f.nodeAlpha}" stroke-width="${fmt(0.9 * pt)}">`)
  for (const n of f.nodes) {
    const r = (Math.sqrt(n.area) / 2) * pt
    const cx = px(n.x), cy = py(n.y)
    parts.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="${n.color}"/>`)
    grow(cx - r, cy - r, cx + r, cy + r)
  }
  parts.push('</g>')

  parts.push(`<g font-family="${FONT}" fill="${f.labelColor}" text-anchor="middle" stroke="#FFFFFF" stroke-width="${fmt(2.2 * pt)}" stroke-linejoin="round" paint-order="stroke">`)
  for (const n of f.nodes) {
    if (n.font === null) continue
    const size = n.font * pt
    const m = measure(n.label, size)
    // annotate(xytext=(0, 5pt), va="bottom"): the text's lowest point sits 5 pt above the node.
    const baseline = py(n.y) - 5 * pt - m.descent
    const cx = px(n.x)
    parts.push(`<text x="${fmt(cx)}" y="${fmt(baseline)}" font-size="${fmt(size)}">${esc(n.label)}</text>`)
    grow(cx - m.width / 2, baseline - m.ascent, cx + m.width / 2, baseline + m.descent)
  }
  parts.push('</g>')

  // Title: 13 pt semibold (bold in DejaVu), 12 pt above the axes box.
  const tSize = 13 * pt
  const tm = measure(f.title, tSize, true)
  const tBase = axT - 12 * pt
  const tx = (axL + axR) / 2
  parts.push(`<text x="${fmt(tx)}" y="${fmt(tBase)}" font-family="${FONT}" font-weight="700" font-size="${fmt(tSize)}" fill="#2D2D2D" text-anchor="middle">${esc(f.title)}</text>`)
  grow(tx - tm.width / 2, tBase - tm.ascent, tx + tm.width / 2, tBase + tm.descent)

  const pad = PAD_INCHES * f.dpi
  const x = Math.floor(bx0 - pad)
  const y = Math.floor(by0 - pad)
  return { svgBody: parts.join(''), x, y, width: Math.ceil(bx1 + pad) - x, height: Math.ceil(by1 + pad) - y, background: '#FFFFFF' }
}

/**
 * The word tree, as labiia_lex saves it: 14 × 10 in at 220 dpi, grey
 * background, fig.tight_layout() (axes stretched so every label and the
 * title fit inside a 10.8 pt border), then the tight crop.
 */
function buildTree(f: TreeFigure): Built {
  const W = f.figW * f.dpi
  const H = f.figH * f.dpi
  const pt = f.dpi / 72
  const xs = f.lines.flatMap((l) => [l.x1, l.x2])
  const ys = f.lines.flatMap((l) => [l.y1, l.y2])
  const minX = Math.min(...xs, 0), maxX = Math.max(...xs, 0), minY = Math.min(...ys, 0), maxY = Math.max(...ys, 0)
  // matplotlib's default 5% data margins (lines autoscale, texts do not).
  const dx = maxX - minX || 1, dy = maxY - minY || 1
  const x0 = minX - 0.05 * dx, x1 = maxX + 0.05 * dx, y0 = minY - 0.05 * dy, y1 = maxY + 0.05 * dy
  const tSize = 16 * pt
  // labiia_lex's chart theme sets axes titles in bold.
  const tm = measure(f.title, tSize, true)

  const draw = (axL: number, axR: number, axT: number, axB: number) => {
    const px = (x: number): number => axL + ((x - x0) / (x1 - x0)) * (axR - axL)
    const py = (y: number): number => axB - ((y - y0) / (y1 - y0)) * (axB - axT)
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity
    const grow = (a: number, b: number, c: number, d: number): void => {
      bx0 = Math.min(bx0, a); by0 = Math.min(by0, b); bx1 = Math.max(bx1, c); by1 = Math.max(by1, d)
    }
    const parts: string[] = ['<g stroke="#7c8894" stroke-linecap="round" fill="none">']
    for (const l of f.lines) {
      const a = [px(l.x1), py(l.y1), px(l.x2), py(l.y2)]
      const hw = (l.width * pt) / 2
      parts.push(`<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(a[2])}" y2="${fmt(a[3])}" stroke-width="${fmt(l.width * pt)}" stroke-opacity="${fmt(l.alpha)}"/>`)
      grow(Math.min(a[0], a[2]) - hw, Math.min(a[1], a[3]) - hw, Math.max(a[0], a[2]) + hw, Math.max(a[1], a[3]) + hw)
    }
    parts.push(`</g><g font-family="${FONT}" text-anchor="middle">`)
    for (const lab of f.labels) {
      const size = lab.size * pt
      const m = measure(lab.text, size, lab.bold)
      const cx = px(lab.x)
      // va="center": the middle of the text's ink box sits on the point.
      const baseline = py(lab.y) + (m.ascent - m.descent) / 2
      parts.push(`<text x="${fmt(cx)}" y="${fmt(baseline)}" font-size="${fmt(size)}"${lab.bold ? ' font-weight="700"' : ''} fill="${lab.color}">${esc(lab.text)}</text>`)
      grow(cx - m.width / 2, baseline - m.ascent, cx + m.width / 2, baseline + m.descent)
    }
    parts.push('</g>')
    const tBase = axT - 10 * pt
    const tx = (axL + axR) / 2
    parts.push(`<text x="${fmt(tx)}" y="${fmt(tBase)}" font-family="${FONT}" font-weight="700" font-size="${fmt(tSize)}" fill="#111827" text-anchor="middle">${esc(f.title)}</text>`)
    grow(tx - tm.width / 2, tBase - tm.ascent, tx + tm.width / 2, tBase + tm.descent)
    return { body: parts.join(''), bx0, by0, bx1, by1 }
  }

  // tight_layout: measure how far labels and title reach past the default
  // axes box, then move the box in so they fit inside the 10.8 pt border.
  const dL = AX_LEFT * W, dR = AX_RIGHT * W, dT = (1 - AX_TOP) * H, dB = (1 - AX_BOTTOM) * H
  const first = draw(dL, dR, dT, dB)
  const border = 1.08 * 10 * pt
  const axL = border + Math.max(0, dL - first.bx0)
  const axR = W - border - Math.max(0, first.bx1 - dR)
  const axT = border + Math.max(0, dT - first.by0)
  const axB = H - border - Math.max(0, first.by1 - dB)
  const out = draw(axL, axR, axT, axB)
  const bx0 = Math.min(out.bx0, axL), by0 = Math.min(out.by0, axT), bx1 = Math.max(out.bx1, axR), by1 = Math.max(out.by1, axB)
  const pad = PAD_INCHES * f.dpi
  const x = Math.floor(bx0 - pad)
  const y = Math.floor(by0 - pad)
  return { svgBody: out.body, x, y, width: Math.ceil(bx1 + pad) - x, height: Math.ceil(by1 + pad) - y, background: f.background }
}

function build(f: LexicalFigure): Built {
  if (f.kind === 'tree') return buildTree(f)
  const kit = { font: FONT, measure, esc, fmt, padInches: PAD_INCHES }
  if (f.kind === 'barh') return buildBars(f, kit)
  if (f.kind === 'panel-bars') return buildPanelBars(f, kit)
  if (f.kind === 'radial') return buildRadial(f, kit)
  if (f.kind === 'vbar') return buildVBars(f, kit)
  if (f.kind === 'intertopic') return buildIntertopic(f, kit)
  if (f.kind === 'heatmap') return buildHeatmap(f, kit)
  if (f.kind === 'strategic') return buildStrategic(f, kit)
  if (f.kind === 'chd-dendrogram') return buildChdDendrogram(f, kit)
  if (f.kind === 'timeline') return buildTimeline(f, kit)
  return buildNetwork(f)
}

async function fontFaceCss(): Promise<string> {
  const toB64 = async (url: string): Promise<string> => {
    const buf = new Uint8Array(await (await fetch(url)).arrayBuffer())
    let s = ''
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    return btoa(s)
  }
  return `@font-face{font-family:${FONT};font-weight:400;src:url(data:font/ttf;base64,${await toB64(dejavuUrl)})}` +
    `@font-face{font-family:${FONT};font-weight:700;src:url(data:font/ttf;base64,${await toB64(dejavuBoldUrl)})}`
}

/** A standalone SVG document (white background, font embedded). */
async function standaloneSvg(b: Built): Promise<string> {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${b.width}" height="${b.height}" viewBox="${b.x} ${b.y} ${b.width} ${b.height}">` +
    `<style>${await fontFaceCss()}</style><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${b.background}"/>${b.svgBody}</svg>`
}

async function toPngBase64(b: Built): Promise<string> {
  const svg = await standaloneSvg(b)
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = b.width
  canvas.height = b.height
  canvas.getContext('2d')!.drawImage(img, 0, 0)
  return canvas.toDataURL('image/png').split(',')[1]
}

function utf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function FigureView({ figure, baseName }: { figure: LexicalFigure; baseName: string }) {
  const [ready, setReady] = useState(false)
  const [actualSize, setActualSize] = useState(false)
  useEffect(() => { void loadFonts().then(() => setReady(true)) }, [])
  const built = useMemo(() => (ready ? build(figure) : null), [ready, figure])
  if (!built) return <div className="lex-muted">{t('Drawing…')}</div>

  const exportPng = async (): Promise<void> => {
    await window.api.lexical.saveFile({ name: `${baseName}.png`, mime: 'image/png', data: await toPngBase64(built) })
  }
  const exportSvg = async (): Promise<void> => {
    await window.api.lexical.saveFile({ name: `${baseName}.svg`, mime: 'image/svg+xml', data: utf8Base64(await standaloneSvg(built)) })
  }

  return (
    <div className="lex-figure">
      <div className="lex-figure-tools">
        <button className="secondary lex-small-btn" onClick={() => setActualSize(!actualSize)}>
          {actualSize ? t('Fit to window') : t('Actual size')}
        </button>
        <button className="secondary lex-small-btn" onClick={() => void exportPng()}>{t('Export PNG')}</button>
        <button className="secondary lex-small-btn" onClick={() => void exportSvg()}>{t('Export SVG')}</button>
      </div>
      <div className={`lex-figure-frame${actualSize ? ' actual' : ''}`}>
        <svg
          className="lex-figure-svg"
          viewBox={`${built.x} ${built.y} ${built.width} ${built.height}`}
          width={actualSize ? built.width : undefined}
          height={actualSize ? built.height : undefined}
          role="img"
          aria-label={figure.title}
          dangerouslySetInnerHTML={{ __html: `<rect x="${built.x}" y="${built.y}" width="${built.width}" height="${built.height}" fill="${built.background}"/>${built.svgBody}` }}
        />
      </div>
    </div>
  )
}
