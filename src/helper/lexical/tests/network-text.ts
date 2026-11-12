/**
 * Text network (labiia_lex's "Rede Textual"): built, measured and laid out in
 * the background thread; the window draws it as an interactive graph from
 * network.json. Tables and a GEXF file (opens in Gephi) go with it.
 */
import type { TestContext } from '../engine'
import type { LexicalFile, LexicalRunResult } from '../../../renderer/models/lexical-api'
import { toGexf } from '../../../renderer/models/network-gexf'
import type { NetworkTextResult } from '../analyses/network-text'

const b64 = (text: string): string => Buffer.from(text, 'utf-8').toString('base64')
const csvCell = (v: string | number): string => {
  const s = String(v)
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = (header: string[], rows: (string | number)[][]): string => [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\n') + '\n'

export async function runNetworkText(ctx: TestContext): Promise<Omit<LexicalRunResult, 'ok' | 'corpus'>> {
  const p = ctx.params
  const net = await ctx.worker<NetworkTextResult | null>({
    type: 'network-text',
    key: ctx.key,
    resourcesDir: ctx.resourcesDir,
    options: {
      autoTune: p.auto_tune !== false,
      minFreq: Number(p.min_freq) || 3,
      minCooc: Number(p.min_cooc) || 1,
      maxNodes: Number(p.max_nodes) || 300,
      maxTree: p.max_tree === true,
      resolution: Number(p.resolution) || 1,
      iterations: Number(p.iterations) || 3000,
      scaling: Number(p.scaling) || 50,
      gravity: Number(p.gravity) || 0.8,
      normalizeCentralities: p.normalize_centralities === true
    }
  })
  if (!net) return { error: 'no-network' }
  const files: LexicalFile[] = [
    { name: 'network.json', mime: 'application/json', role: 'network', data: b64(JSON.stringify(net)) },
    {
      name: 'network_nodes.csv', mime: 'text/csv', role: 'table', title: 'NetworkNodes',
      data: b64(csv(['word', 'frequency', 'degree', 'strength', 'betweenness', 'closeness', 'eigenvector', 'community'],
        [...net.nodes].sort((a, b) => b.strength - a.strength).map((n) => [n.id, n.frequency, n.degree, n.strength, +n.betweenness.toFixed(6), +n.closeness.toFixed(6), +n.eigenvector.toFixed(6), n.community + 1])))
    },
    {
      name: 'network_edges.csv', mime: 'text/csv', role: 'table', title: 'NetworkEdges',
      data: b64(csv(['source', 'target', 'weight'], [...net.edges].sort((a, b) => b.weight - a.weight).map((e) => [e.source, e.target, e.weight])))
    },
    { name: 'network.gexf', mime: 'application/gexf+xml', role: 'data', data: b64(toGexf(net)) }
  ]
  return { files, summary: { ...net.stats, profile: net.diagnostics.profile } }
}
