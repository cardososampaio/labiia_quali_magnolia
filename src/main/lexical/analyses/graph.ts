/**
 * A small undirected graph that keeps networkx's insertion order, with the
 * networkx algorithms labiia_lex's thematic map uses: Louvain communities
 * (same shuffling with Python's random, so the same seed gives the same
 * themes), PageRank, betweenness and degree centrality.
 */
import { PyRandom } from '../plot/random'

export interface EdgeData {
  weight: number
  cooccurrence?: number
  backbone?: boolean
}

export class Graph<K extends string | number = string> {
  readonly adj = new Map<K, Map<K, EdgeData>>()
  /** Original members of an aggregated node (Louvain's "nodes" attribute). */
  readonly members = new Map<K, Set<string | number>>()

  addNode(n: K): void {
    if (!this.adj.has(n)) this.adj.set(n, new Map())
  }

  /** Adds the edge, or updates its data in place when it already exists (as networkx). */
  addEdge(u: K, v: K, data: EdgeData): void {
    this.addNode(u)
    this.addNode(v)
    const old = this.adj.get(u)!.get(v)
    if (old) { Object.assign(old, data); return }
    const d = { ...data }
    this.adj.get(u)!.set(v, d)
    this.adj.get(v)!.set(u, d)
  }

  has(n: K): boolean { return this.adj.has(n) }
  get size(): number { return this.adj.size }
  nodes(): K[] { return [...this.adj.keys()] }

  /** Each edge once, in networkx's order (by node, then neighbour, skipping nodes already visited). */
  edges(): [K, K, EdgeData][] {
    const seen = new Set<K>()
    const out: [K, K, EdgeData][] = []
    for (const [u, nbrs] of this.adj) {
      for (const [v, d] of nbrs) if (!seen.has(v)) out.push([u, v, d])
      seen.add(u)
    }
    return out
  }

  edgeCount(): number { return this.edges().length }

  /** Weighted degree; a self-loop counts twice. */
  degree(u: K): number {
    const nbrs = this.adj.get(u)!
    let s = 0
    for (const d of nbrs.values()) s += d.weight
    const self = nbrs.get(u)
    return self ? s + self.weight : s
  }

  /** Copy restricted to `keep`, preserving the original order. */
  subgraph(keep: Set<K>): Graph<K> {
    const g = new Graph<K>()
    for (const u of this.adj.keys()) if (keep.has(u)) g.addNode(u)
    for (const [u, v, d] of this.edges()) if (keep.has(u) && keep.has(v)) g.addEdge(u, v, d)
    // Neighbour order follows the original adjacency.
    for (const u of g.adj.keys()) {
      const ordered = new Map<K, EdgeData>()
      for (const [v] of this.adj.get(u)!) { const d = g.adj.get(u)!.get(v); if (d) ordered.set(v, d) }
      g.adj.set(u, ordered)
    }
    return g
  }

  removeNodes(nodes: K[]): void {
    for (const n of nodes) {
      for (const v of this.adj.get(n)?.keys() ?? []) this.adj.get(v)?.delete(n)
      this.adj.delete(n)
    }
  }

  isolates(): K[] {
    return this.nodes().filter((u) => this.adj.get(u)!.size === 0)
  }

  connectedComponents(): Set<K>[] {
    const seen = new Set<K>()
    const out: Set<K>[] = []
    for (const s of this.adj.keys()) {
      if (seen.has(s)) continue
      const comp = new Set<K>([s])
      seen.add(s)
      let frontier = [s]
      while (frontier.length) {
        const next: K[] = []
        for (const u of frontier) for (const v of this.adj.get(u)!.keys()) if (!seen.has(v)) { seen.add(v); comp.add(v); next.push(v) }
        frontier = next
      }
      out.push(comp)
    }
    return out
  }
}

function modularity<K extends string | number>(g: Graph<K>, communities: Set<K>[], resolution: number): number {
  const deg = new Map(g.nodes().map((u) => [u, g.degree(u)]))
  let degSum = 0
  for (const d of deg.values()) degSum += d
  const m = degSum / 2
  const norm = 1 / degSum ** 2
  let q = 0
  for (const comm of communities) {
    let lc = 0
    const seen = new Set<K>()
    for (const u of comm) {
      for (const [v, d] of g.adj.get(u)!) if (!seen.has(v) && comm.has(v)) lc += d.weight
      seen.add(u)
    }
    let ds = 0
    for (const u of comm) ds += deg.get(u)!
    q += lc / m - resolution * ds * ds * norm
  }
  return q
}

function oneLevel(
  g: Graph<number | string>,
  m: number,
  partition: Set<string | number>[],
  resolution: number,
  rng: PyRandom
): { partition: Set<string | number>[]; inner: Set<string | number>[]; improvement: boolean } {
  const nodes = g.nodes()
  const node2com = new Map(nodes.map((u, i) => [u, i]))
  const inner = nodes.map((u) => new Set<string | number>([u]))
  const degrees = new Map(nodes.map((u) => [u, g.degree(u)]))
  const stot = nodes.map((u) => degrees.get(u)!)
  const nbrs = new Map(nodes.map((u) => [u, [...g.adj.get(u)!].filter(([v]) => v !== u).map(([v, d]) => [v, d.weight] as const)]))
  const order = [...nodes]
  rng.shuffle(order)
  let moves = 1
  let improvement = false
  const m2 = 2 * m ** 2
  while (moves > 0) {
    moves = 0
    for (const u of order) {
      let bestMod = 0
      let bestCom = node2com.get(u)!
      const w2c = new Map<number, number>()
      for (const [v, w] of nbrs.get(u)!) {
        const c = node2com.get(v)!
        w2c.set(c, (w2c.get(c) ?? 0) + w)
      }
      const degree = degrees.get(u)!
      stot[bestCom] -= degree
      // Python's defaultdict lookup inserts the own community (weight 0) when it has no neighbour there.
      if (!w2c.has(bestCom)) w2c.set(bestCom, 0)
      const removeCost = -w2c.get(bestCom)! / m + (resolution * (stot[bestCom] * degree)) / m2
      for (const [c, w] of w2c) {
        const gain = removeCost + w / m - (resolution * (stot[c] * degree)) / m2
        if (gain > bestMod) { bestMod = gain; bestCom = c }
      }
      stot[bestCom] += degree
      const cur = node2com.get(u)!
      if (bestCom !== cur) {
        const com = g.members.get(u) ?? new Set([u])
        for (const x of com) partition[cur].delete(x)
        inner[cur].delete(u)
        for (const x of com) partition[bestCom].add(x)
        inner[bestCom].add(u)
        improvement = true
        moves++
        node2com.set(u, bestCom)
      }
    }
  }
  return { partition: partition.filter((s) => s.size), inner: inner.filter((s) => s.size), improvement }
}

function aggregate(g: Graph<number | string>, parts: Set<string | number>[]): Graph<number | string> {
  const h = new Graph<number | string>()
  const node2com = new Map<string | number, number>()
  parts.forEach((part, i) => {
    const members = new Set<string | number>()
    for (const n of part) {
      node2com.set(n, i)
      for (const x of g.members.get(n) ?? [n]) members.add(x)
    }
    h.addNode(i)
    h.members.set(i, members)
  })
  for (const [a, b, d] of g.edges()) {
    const c1 = node2com.get(a)!, c2 = node2com.get(b)!
    const temp = h.adj.get(c1)!.get(c2)?.weight ?? 0
    h.addEdge(c1, c2, { weight: d.weight + temp })
  }
  return h
}

/** networkx.community.louvain_communities(G, weight, resolution, threshold=1e-7, seed). */
export function louvainCommunities(g: Graph<string>, resolution: number, seed = 42): Set<string>[] {
  let partition: Set<string | number>[] = g.nodes().map((u) => new Set([u]))
  if (g.edgeCount() === 0) return partition as Set<string>[]
  let mod = modularity(g, partition as Set<string>[], resolution)
  let graph = new Graph<number | string>()
  for (const u of g.nodes()) graph.addNode(u)
  for (const [u, v, d] of g.edges()) graph.addEdge(u, v, { weight: d.weight })
  let degSum = 0
  for (const u of graph.nodes()) degSum += graph.degree(u)
  const m = degSum / 2
  const rng = new PyRandom(seed)
  let level = oneLevel(graph, m, partition, resolution, rng)
  partition = level.partition
  let inner = level.inner
  let improvement = true
  let last = partition.map((s) => new Set(s))
  while (improvement) {
    last = partition.map((s) => new Set(s))
    const newMod = modularity(graph, inner, resolution)
    if (newMod - mod <= 1e-7) break
    mod = newMod
    graph = aggregate(graph, inner)
    level = oneLevel(graph, m, partition, resolution, rng)
    partition = level.partition
    inner = level.inner
    improvement = level.improvement
  }
  return last as Set<string>[]
}

/** networkx.pagerank (alpha 0.85, tol 1e-6, 100 iterations); empty when it does not converge. */
export function pagerank(g: Graph<string>, alpha = 0.85): Map<string, number> {
  const nodes = g.nodes()
  const n = nodes.length
  if (!n) return new Map()
  const index = new Map(nodes.map((u, i) => [u, i]))
  const rows = nodes.map((u) => [...g.adj.get(u)!].map(([v, d]) => [index.get(v)!, d.weight] as const).sort((a, b) => a[0] - b[0]))
  const inv = rows.map((r) => { const s = r.reduce((a, [, w]) => a + w, 0); return s !== 0 ? 1 / s : 0 })
  const dangling = inv.map((s, i) => (s === 0 ? i : -1)).filter((i) => i >= 0)
  let x = new Array(n).fill(1 / n)
  const p = 1 / n
  for (let it = 0; it < 100; it++) {
    const xA = new Array(n).fill(0)
    rows.forEach((r, i) => { for (const [j, w] of r) xA[j] += x[i] * (inv[i] * w) })
    let dsum = 0
    for (const i of dangling) dsum += x[i]
    const next = xA.map((v) => alpha * (v + dsum * p) + (1 - alpha) * p)
    let err = 0
    for (let i = 0; i < n; i++) err += Math.abs(next[i] - x[i])
    x = next
    if (err < n * 1e-6) return new Map(nodes.map((u, i) => [u, x[i]]))
  }
  return new Map()
}

/** networkx.degree_centrality. */
export function degreeCentrality(g: Graph<string>): Map<string, number> {
  const s = g.size > 1 ? 1 / (g.size - 1) : 1
  return new Map(g.nodes().map((u) => [u, g.adj.get(u)!.size * s]))
}

/** networkx.betweenness_centrality(G, weight="weight", normalized=True): Brandes with Dijkstra. */
export function betweennessCentrality(g: Graph<string>): Map<string, number> {
  const nodes = g.nodes()
  const bc = new Map(nodes.map((u) => [u, 0]))
  for (const s of nodes) {
    const S: string[] = []
    const P = new Map<string, string[]>(nodes.map((u) => [u, []]))
    const sigma = new Map(nodes.map((u) => [u, 0]))
    const D = new Map<string, number>()
    sigma.set(s, 1)
    const seen = new Map<string, number>([[s, 0]])
    let count = 0
    type Entry = [number, number, string, string]
    const less = (a: Entry, b: Entry): boolean => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])
    const heap: Entry[] = []
    const push = (e: Entry): void => {
      let i = heap.length
      heap.push(e)
      while (i > 0) {
        const p = (i - 1) >> 1
        if (!less(e, heap[p])) break
        heap[i] = heap[p]; i = p
      }
      heap[i] = e
    }
    const pop = (): Entry => {
      const top = heap[0]
      const last = heap.pop()!
      if (heap.length) {
        let i = 0
        for (;;) {
          const l = 2 * i + 1, r = l + 1
          let c = l
          if (l >= heap.length) break
          if (r < heap.length && less(heap[r], heap[l])) c = r
          if (!less(heap[c], last)) break
          heap[i] = heap[c]; i = c
        }
        heap[i] = last
      }
      return top
    }
    push([0, count++, s, s])
    while (heap.length) {
      const [dist, , pred, v] = pop()
      if (D.has(v)) continue
      sigma.set(v, sigma.get(v)! + sigma.get(pred)!)
      S.push(v)
      D.set(v, dist)
      for (const [w, d] of g.adj.get(v)!) {
        const vw = dist + d.weight
        if (!D.has(w) && (!seen.has(w) || vw < seen.get(w)!)) {
          seen.set(w, vw)
          push([vw, count++, v, w])
          sigma.set(w, 0)
          P.set(w, [v])
        } else if (vw === seen.get(w)) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!)
          P.get(w)!.push(v)
        }
      }
    }
    const delta = new Map(S.map((u) => [u, 0]))
    while (S.length) {
      const w = S.pop()!
      const coeff = (1 + delta.get(w)!) / sigma.get(w)!
      for (const v of P.get(w)!) delta.set(v, delta.get(v)! + sigma.get(v)! * coeff)
      if (w !== s) bc.set(w, bc.get(w)! + delta.get(w)!)
    }
  }
  const n = nodes.length - 1
  if (n >= 2) {
    const scale = 1 / (n * (n - 1))
    for (const [u, v] of bc) bc.set(u, v * scale)
  }
  return bc
}
