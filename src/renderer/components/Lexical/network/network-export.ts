/**
 * Exports of the text network as it is on screen: SVG drawing and CSV table
 * of words, with the researcher's colours, community names and positions.
 */
import type Graph from 'graphology'

export interface DrawnNode { x: number; y: number; label: string; labelSize: number; labelWeight: string; labelColor: string; hidden?: boolean }
export interface DrawnEdge { hex: string; alpha: number; size: number; weight: number }

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/**
 * The drawing on a 4000 × 2100 canvas (labiia_lex's Gephi-mode size): links as
 * quadratic curves bending by a fifth of their length, weakest first, then
 * labels, smallest first. Hidden words and their links are left out.
 */
export function networkSvg(graph: Graph, background: string, visible: (id: string) => boolean): string {
  const W = 4000, H = 2100, pad = 120
  const ids = graph.nodes().filter(visible)
  const xs = ids.map((id) => graph.getNodeAttribute(id, 'x') as number), ys = ids.map((id) => graph.getNodeAttribute(id, 'y') as number)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const k = Math.min((W - 2 * pad) / (maxX - minX || 1), (H - 2 * pad) / (maxY - minY || 1))
  const X = (x: number): number => pad + (x - minX) * k + (W - 2 * pad - (maxX - minX) * k) / 2
  const Y = (y: number): number => H - (pad + (y - minY) * k + (H - 2 * pad - (maxY - minY) * k) / 2)
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="${background}"/>`]
  const edges = graph
    .mapEdges((_e, a, s, tg) => ({ a: a as DrawnEdge, s, tg }))
    .filter(({ s, tg }) => visible(s) && visible(tg))
    .sort((p, q) => p.a.weight - q.a.weight)
  for (const { a, s, tg } of edges) {
    const x1 = X(graph.getNodeAttribute(s, 'x')), y1 = Y(graph.getNodeAttribute(s, 'y'))
    const x2 = X(graph.getNodeAttribute(tg, 'x')), y2 = Y(graph.getNodeAttribute(tg, 'y'))
    const cx = (x1 + x2) / 2 + (y2 - y1) * 0.2, cy = (y1 + y2) / 2 - (x2 - x1) * 0.2
    parts.push(`<path d="M${x1.toFixed(1)},${y1.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" fill="none" stroke="${a.hex}" stroke-opacity="${a.alpha.toFixed(3)}" stroke-width="${(a.size * 1.6).toFixed(2)}"/>`)
  }
  const nodes = ids.map((id) => graph.getNodeAttributes(id) as DrawnNode).filter((a) => a.label).sort((p, q) => p.labelSize - q.labelSize)
  for (const a of nodes) {
    parts.push(`<text x="${X(a.x).toFixed(1)}" y="${Y(a.y).toFixed(1)}" font-family="Segoe UI, Arial, sans-serif" font-size="${(a.labelSize * 1.6).toFixed(1)}" font-weight="${a.labelWeight}" fill="${a.labelColor}" text-anchor="middle" dominant-baseline="middle">${esc(a.label)}</text>`)
  }
  parts.push('</svg>')
  return parts.join('\n') + '\n'
}

const cell = (v: string | number): string => {
  const s = String(v)
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Words and metrics with the community each word has on screen and its name. */
export function nodesCsv(
  nodes: { id: string; frequency: number; degree: number; strength: number; betweenness: number; closeness: number; eigenvector: number }[],
  community: (id: string) => number,
  names: Record<number, string>
): string {
  const header = ['word', 'frequency', 'degree', 'strength', 'betweenness', 'closeness', 'eigenvector', 'community', 'community_name']
  const rows = [...nodes]
    .sort((a, b) => b.strength - a.strength)
    .map((n) => { const c = community(n.id); return [n.id, n.frequency, n.degree, n.strength, +n.betweenness.toFixed(6), +n.closeness.toFixed(6), +n.eigenvector.toFixed(6), c + 1, names[c] ?? ''] })
  return [header, ...rows].map((r) => r.map(cell).join(';')).join('\n') + '\n'
}

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
