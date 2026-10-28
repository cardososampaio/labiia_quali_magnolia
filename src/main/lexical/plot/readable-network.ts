/**
 * The readable network figure of labiia_lex (write_readable_network_plot):
 * node sizes and label sizes by weighted degree, edge widths by weight,
 * ggplot-style colours by community, figure size from the node count.
 * The window draws it (FigureView) in matplotlib's geometry.
 */
import { componentLayout, spreadNodesForLabels, type WeightedEdge } from './spring-layout'
import { ggplotHue } from './colors'
import type { NetworkFigure } from '../../../renderer/models/lexical-figures'

export type { NetworkFigure }

const labelFontSize = (score: number): number => 7.2 + score * 3.6

export function readableNetworkFigure(
  order: string[],
  edges: WeightedEdge[],
  opts: { title: string; maxLabels?: number; communityOf?: Map<string, number>; seed?: number }
): NetworkFigure {
  const strength = new Map(order.map((v) => [v, 0]))
  for (const e of edges) {
    strength.set(e.source, strength.get(e.source)! + e.weight)
    // A self-loop counts twice in networkx's weighted degree.
    strength.set(e.target, strength.get(e.target)! + e.weight)
  }
  const values = [...strength.values()]
  const minS = Math.min(...values)
  const maxS = Math.max(...values)
  const span = Math.max(maxS - minS, 1)

  const communities = [...new Set([...(opts.communityOf?.values() ?? [])])].sort((a, b) => a - b)
  const palette = ggplotHue(Math.max(1, communities.length))
  const colorOf = (v: string): string => {
    const c = opts.communityOf?.get(v)
    const idx = c === undefined ? 0 : Math.max(0, communities.indexOf(c))
    return palette[idx % palette.length]
  }

  // Label the strongest nodes first; ties by name, both descending, as labiia_lex sorts.
  const ranked = [...order].sort((a, b) => strength.get(b)! - strength.get(a)! || (a < b ? 1 : a > b ? -1 : 0))
  const labelLimit = Math.min(Math.max(1, opts.maxLabels ?? 70), ranked.length)
  const labelNodes = new Set(ranked.slice(0, labelLimit))
  const n = order.length
  const figW = Math.max(13, Math.min(28, 8.5 + Math.sqrt(n) * 1.55))
  const figH = Math.max(8.5, Math.min(20, 6.2 + Math.sqrt(n) * 1.1))
  const score = (v: string): number => (strength.get(v)! - minS) / span
  const fontSizes = new Map([...labelNodes].map((v) => [v, labelFontSize(score(v))]))
  const area = (v: string): number => 70 + score(v) * 340
  const radiusPt = new Map(order.map((v) => [v, Math.sqrt(area(v)) / 2]))

  let positions = componentLayout(order, edges, opts.seed ?? 42)
  positions = spreadNodesForLabels(positions, labelNodes, fontSizes, radiusPt, figW, figH).positions

  const maxW = Math.max(1, ...edges.map((e) => e.weight))
  return {
    kind: 'network',
    title: opts.title,
    figW,
    figH,
    dpi: 160,
    nodes: order.map((v) => {
      const [x, y] = positions.get(v)!
      return { label: v, x, y, area: area(v), color: colorOf(v), font: labelNodes.has(v) ? fontSizes.get(v)! : null }
    }),
    edges: edges.map((e) => {
      const [x1, y1] = positions.get(e.source)!
      const [x2, y2] = positions.get(e.target)!
      return { x1, y1, x2, y2, width: 0.35 + (e.weight / maxW) * 1.7 }
    }),
    edgeColor: '#A8B3C2',
    edgeAlpha: 0.38,
    nodeAlpha: 0.88,
    labelColor: '#26313F',
    margins: 0.16
  }
}
