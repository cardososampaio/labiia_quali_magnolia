/**
 * Communities shown in the window: the analysis's, or recomputed at another
 * Louvain resolution (python-louvain, seed 42, as the analysis), then the
 * researcher's merges and moved words. Communities are numbered from the
 * largest, like the analysis, so colours follow their size.
 */
import { Graph } from '../../../../helper/lexical/analyses/graph'
import { bestPartition, modularity } from '../../../models/network-louvain'
import type { NetworkStyle } from './network-style'

export interface CommunityNetwork {
  nodes: { id: string; community: number }[]
  edges: { source: string; target: string; weight: number }[]
}

/** The network as python-louvain reads it: words in the analysis's order, links in its order. */
export function louvainGraph(net: CommunityNetwork): Graph<string> {
  const g = new Graph<string>()
  for (const n of net.nodes) g.addNode(n.id)
  for (const e of net.edges) g.addEdge(e.source, e.target, { weight: e.weight })
  return g
}

/** Communities renumbered by size, largest first (ties by first appearance). */
export function bySize(partition: Map<string, number>): Map<string, number> {
  const sizes = new Map<number, number>()
  for (const c of partition.values()) sizes.set(c, (sizes.get(c) ?? 0) + 1)
  const order = [...sizes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([c]) => c)
  const relabel = new Map(order.map((c, i) => [c, i]))
  return new Map([...partition].map(([u, c]) => [u, relabel.get(c)!]))
}

export function recompute(g: Graph<string>, resolution: number): Map<string, number> {
  return bySize(bestPartition(g, resolution, 42))
}

/** The community of every word after the researcher's merges and moves. */
export function applyEdits(base: Map<string, number>, style: Pick<NetworkStyle, 'merged' | 'moved'>): Map<string, number> {
  const target = (c: number): number => {
    const seen = new Set<number>()
    while (style.merged[c] !== undefined && !seen.has(c)) { seen.add(c); c = style.merged[c] }
    return c
  }
  const out = new Map<string, number>()
  for (const [u, c] of base) out.set(u, style.moved[u] ?? target(c))
  return out
}

export function partitionModularity(g: Graph<string>, partition: Map<string, number>): number {
  return new Set(partition.values()).size > 1 ? modularity(g, partition) : 0
}
