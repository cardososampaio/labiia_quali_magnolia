/**
 * The text network as GEXF 1.3 (opens in Gephi and Gephi Lite): the metrics,
 * the communities (modularity_class, as Gephi names them, plus their names
 * when the researcher gave any), colours, sizes and positions. Written by the
 * helper when the analysis runs and by the window from what is on screen.
 */
import { COMMUNITY_PALETTE } from './lexical-api'

export interface GexfNetwork {
  nodes: { id: string; frequency: number; degree: number; strength: number; betweenness: number; closeness: number; eigenvector: number; community: number; x: number; y: number }[]
  edges: { source: string; target: string; weight: number }[]
}

export interface GexfOptions {
  /** Community of each word, when it differs from the analysis (recomputed or edited). */
  community?: (id: string) => number
  colour?: (community: number) => string
  names?: Record<number, string>
  position?: (id: string) => { x: number; y: number }
}

const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function toGexf(net: GexfNetwork, o: GexfOptions = {}): string {
  const community = o.community ?? ((id: string) => net.nodes.find((n) => n.id === id)!.community)
  const colour = o.colour ?? ((c: number) => COMMUNITY_PALETTE[c % COMMUNITY_PALETTE.length])
  const attrs: [string, string][] = [['frequency', 'integer'], ['degree', 'integer'], ['strength', 'double'], ['betweenness', 'double'], ['closeness', 'double'], ['eigenvector', 'double'], ['modularity_class', 'integer'], ['community_name', 'string']]
  const maxStrength = Math.max(1, ...net.nodes.map((n) => n.strength))
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gexf xmlns="http://gexf.net/1.3" xmlns:viz="http://gexf.net/1.3/viz" version="1.3">',
    '  <meta><creator>labiia_quali</creator><description>Rede textual</description></meta>',
    '  <graph defaultedgetype="undirected" mode="static">',
    '    <attributes class="node">',
    ...attrs.map(([id, type], i) => `      <attribute id="${i}" title="${id}" type="${type}"/>`),
    '    </attributes>',
    '    <nodes>'
  ]
  for (const n of net.nodes) {
    const c = community(n.id)
    const hex = colour(c)
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    const pos = o.position ? o.position(n.id) : n
    const values: (string | number)[] = [n.frequency, n.degree, n.strength, n.betweenness, n.closeness, n.eigenvector, c, xml(o.names?.[c] ?? '')]
    lines.push(
      `      <node id="${xml(n.id)}" label="${xml(n.id)}">`,
      `        <attvalues>${values.map((v, i) => `<attvalue for="${i}" value="${v}"/>`).join('')}</attvalues>`,
      `        <viz:color r="${r}" g="${g}" b="${b}"/>`,
      `        <viz:position x="${(pos.x * 1000).toFixed(3)}" y="${(pos.y * 1000).toFixed(3)}" z="0"/>`,
      `        <viz:size value="${(4 + 26 * Math.sqrt(n.strength / maxStrength)).toFixed(3)}"/>`,
      '      </node>'
    )
  }
  lines.push('    </nodes>', '    <edges>')
  net.edges.forEach((e, i) => lines.push(`      <edge id="${i}" source="${xml(e.source)}" target="${xml(e.target)}" weight="${e.weight}"/>`))
  lines.push('    </edges>', '  </graph>', '</gexf>')
  return lines.join('\n') + '\n'
}
