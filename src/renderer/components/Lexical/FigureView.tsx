/**
 * Draws the figures lexical tests describe as data (see models/lexical-figures),
 * reproducing matplotlib's page geometry so they look like labiia_lex's PNGs:
 * figure size in inches at its dpi, default axes box, data margins, sizes in
 * points, DejaVu Sans (matplotlib's font), and the "tight" crop with a
 * 0.1-inch pad that labiia_lex saves with. Exports PNG at the same pixel size
 * and SVG with the font embedded.
 */
import { useEffect, useMemo, useState } from 'react'
import type { LexicalFigure, NetworkFigure } from '../../models/lexical-figures'
import { t } from '../../i18n'
import dejavuUrl from '../../assets/fonts/DejaVuSans.ttf?url'
import dejavuBoldUrl from '../../assets/fonts/DejaVuSans-Bold.ttf?url'

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

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fmt = (n: number): string => (Math.round(n * 100) / 100).toString()

interface Built { svgBody: string; x: number; y: number; width: number; height: number }

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
  return { svgBody: parts.join(''), x, y, width: Math.ceil(bx1 + pad) - x, height: Math.ceil(by1 + pad) - y }
}

function build(f: LexicalFigure): Built {
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
    `<style>${await fontFaceCss()}</style><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="#FFFFFF"/>${b.svgBody}</svg>`
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
          dangerouslySetInnerHTML={{ __html: `<rect x="${built.x}" y="${built.y}" width="${built.width}" height="${built.height}" fill="#FFFFFF"/>${built.svgBody}` }}
        />
      </div>
    </div>
  )
}
