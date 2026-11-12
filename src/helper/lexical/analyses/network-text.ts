/**
 * Text network (labiia_lex's "Rede Textual", Gephi style): words that occur
 * close together in the text segments, linked by how often they do, grouped
 * into communities (Louvain) and laid out with ForceAtlas2.
 *
 * The network is built as labiia_lex builds it (vocabulary, window, automatic
 * selection by corpus size, edge balancing, metrics, python-louvain), with
 * two corrections:
 * - an edge weight is the real number of co-occurrences. labiia_lex counted
 *   every pair once from each end, doubling all weights; its thresholds are
 *   converted (a minimum of m doubled co-occurrences is ⌈m/2⌉ real ones), so
 *   the same words and links are kept;
 * - betweenness and closeness read 1 ÷ weight as the distance, so strongly
 *   linked words are close (labiia_lex read the weight itself as a distance).
 */
import AbstractGraph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import type { PreparedCorpus } from '../corpus/prepare'
import { keptWords } from '../corpus/prepare'
import type { Lexicon } from '../corpus/lexicon'
import { Graph } from './graph'
export { bestPartition, modularity }
import { bestPartition, modularity } from '../../../renderer/models/network-louvain'
import { adjustLabels } from '../../../renderer/models/label-adjust'

export interface NetworkTextOptions {
  /** Choose the thresholds and the layout strength from the corpus size (labiia_lex's default). */
  autoTune: boolean
  minFreq: number
  /** Minimum real co-occurrences for a link. */
  minCooc: number
  maxNodes: number
  /** Keep only the maximum spanning tree (manual mode only, as in labiia_lex). */
  maxTree: boolean
  resolution: number
  iterations: number
  scaling: number
  gravity: number
  normalizeCentralities: boolean
  /** Text segments kept per word, shown when the word is clicked. */
  segmentsPerWord?: number
}

export interface NetworkNode {
  id: string
  /** Occurrences of the word in the corpus. */
  frequency: number
  degree: number
  /** Sum of the weights of the word's links. */
  strength: number
  betweenness: number
  closeness: number
  eigenvector: number
  community: number
  x: number
  y: number
  /** Indices into NetworkTextResult.segments. */
  segments: number[]
}

export interface NetworkTextResult {
  version: 1
  nodes: NetworkNode[]
  edges: { source: string; target: string; weight: number }[]
  segments: { unit: string; text: string }[]
  stats: { nodes: number; edges: number; communities: number; modularity: number; density: number; averageDegree: number; diameter: number }
  diagnostics: {
    profile: string
    totalTokens: number
    selected: { minFreq: number; minCooc: number; maxNodes: number; scaling: number; gravity: number; maxTree: boolean }
    balance: { edgesBefore: number; edgesAfter: number; targetEdges: number; mandatory: number } | null
  }
}

/** labiia_lex's window: five content words on each side, inside a segment. */
const WINDOW = 5
const STRIP = /^[.,;:!?"'()[\]{}]+|[.,;:!?"'()[\]{}]+$/g

// ── Corpus-size profiles (labiia_lex's _apply_auto_selection) ──
// minCooc is in real co-occurrences: labiia_lex's 1, 2, 3, 4, 5 doubled counts.
const PROFILES = [
  { name: 'very_small', maxTokens: 1500, minFreq: 1, minCooc: 1, scaling: 5, gravity: 2 },
  { name: 'small', maxTokens: 8000, minFreq: 2, minCooc: 1, scaling: 6, gravity: 1.8 },
  { name: 'medium', maxTokens: 30000, minFreq: 3, minCooc: 2, scaling: 8, gravity: 1.5 },
  { name: 'large', maxTokens: 90000, minFreq: 4, minCooc: 2, scaling: 10, gravity: 1.3 },
  { name: 'xlarge', maxTokens: Infinity, minFreq: 5, minCooc: 3, scaling: 12, gravity: 1.2 }
] as const
const AUTO_MAX_NODES = 450
/** labiia_lex's Gephi mode keeps the bundles of a dense graph: average degree at least 25. */
const GEPHI_TARGET_AVG_DEGREE = 25

/** Python's round(): halves go to the even neighbour. */
function pyRound(x: number): number {
  const r = Math.round(x)
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r
}

/** Words of the network: active forms, frequent enough, not stopwords nor English (labiia_lex's _build_vocabulary). */
export function networkVocabulary(c: PreparedCorpus, lex: Lexicon, minFreq: number): string[] {
  const out: string[] = []
  for (let i = 0; i < c.forms.length; i++) {
    const t = c.forms[i]
    if (c.formAct[i] !== 1 || c.formFreq[i] < minFreq) continue
    if (lex.isStopwordLike(t) || lex.stopwords.has(t)) continue
    if (lex.isEnglishOnly(t, c.lemmas[c.formLemma[i]])) continue
    out.push(t)
  }
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** Real co-occurrences of each pair of vocabulary words within the window; key i * n + j with i < j. */
export function cooccurrences(c: PreparedCorpus, vocabulary: string[]): Map<number, number> {
  const index = new Map(vocabulary.map((w, i) => [w, i]))
  const n = vocabulary.length
  const counts = new Map<number, number>()
  for (let s = 0; s < c.uceText.length; s++) {
    const ids: number[] = []
    for (const raw of keptWords(c, s)) {
      const w = raw.toLowerCase().replace(STRIP, '')
      const k = w ? index.get(w) : undefined
      if (k !== undefined) ids.push(k)
    }
    for (let i = 0; i < ids.length; i++) {
      const end = Math.min(ids.length, i + WINDOW + 1)
      for (let j = i + 1; j < end; j++) {
        const a = ids[i], b = ids[j]
        if (a === b) continue
        const key = a < b ? a * n + b : b * n + a
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  return counts
}

function totalTokens(c: PreparedCorpus): number {
  let t = 0
  for (let i = 0; i < c.formFreq.length; i++) t += c.formFreq[i]
  return t
}

/** The pairs that reach minCooc, added in labiia_lex's order (by row, then column, of the alphabetical matrix). */
function buildGraph(vocabulary: string[], counts: Map<number, number>, minCooc: number, maxNodes: number): Graph<string> {
  const n = vocabulary.length
  const g = new Graph<string>()
  for (const key of [...counts.keys()].sort((a, b) => a - b)) {
    const w = counts.get(key)!
    if (w >= minCooc) g.addEdge(vocabulary[Math.floor(key / n)], vocabulary[key % n], { weight: w })
  }
  const limit = Math.max(10, maxNodes)
  if (g.size > limit) {
    // Strongest words first; ties keep their order (Python's stable sort).
    const ranked = g.nodes().map((u, i) => ({ u, i, s: g.degree(u) })).sort((a, b) => b.s - a.s || a.i - b.i)
    const keep = new Set(ranked.slice(0, limit).map((r) => r.u))
    g.removeNodes(g.nodes().filter((u) => !keep.has(u)))
  }
  g.removeNodes(g.isolates())
  return g
}

/** networkx maximum_spanning_tree (Kruskal on the edges by decreasing weight, ties in edge order). */
function maximumSpanningEdges(g: Graph<string>): [string, string][] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = x
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!
    let y = x
    while (parent.has(y) && parent.get(y) !== r) { const nx = parent.get(y)!; parent.set(y, r); y = nx }
    return r
  }
  const out: [string, string][] = []
  const edges = g.edges().map((e, i) => ({ e, i })).sort((a, b) => b.e[2].weight - a.e[2].weight || a.i - b.i)
  for (const { e: [u, v] } of edges) {
    const ru = find(u), rv = find(v)
    if (ru === rv) continue
    parent.set(ru, rv)
    if (!parent.has(rv)) parent.set(rv, rv)
    out.push([u, v])
  }
  return out
}

const pairKey = (u: string, v: string): string => (u < v ? `${u}\u0000${v}` : `${v}\u0000${u}`)

/**
 * labiia_lex's _auto_balance_graph: a dense graph keeps each word's strongest
 * link, a maximum spanning tree of each component and then the strongest links,
 * up to an average degree of 25 (Gephi mode).
 */
function balance(g: Graph<string>): NetworkTextResult['diagnostics']['balance'] {
  const nodes = g.size
  const edges = g.edges()
  if (nodes < 6 || edges.length < 10) return null
  const target = Math.max(nodes * 2, pyRound((GEPHI_TARGET_AVG_DEGREE * nodes) / 2))
  if (edges.length <= target) return { edgesBefore: edges.length, edgesAfter: edges.length, targetEdges: target, mandatory: 0 }
  const ranked = edges.map((e, i) => ({ e, i })).sort((a, b) => b.e[2].weight - a.e[2].weight || a.i - b.i).map((x) => x.e)
  const mandatory = new Set<string>()
  for (const u of g.nodes()) {
    let best: string | null = null
    let bw = -Infinity
    for (const [v, d] of g.adj.get(u)!) if (d.weight > bw) { bw = d.weight; best = v }
    if (best !== null) mandatory.add(pairKey(u, best))
  }
  for (const comp of g.connectedComponents()) {
    if (comp.size <= 2) continue
    for (const [u, v] of maximumSpanningEdges(g.subgraph(comp))) mandatory.add(pairKey(u, v))
  }
  const keep = new Set(mandatory)
  const keepTarget = Math.max(mandatory.size, Math.min(target, ranked.length))
  for (const [u, v] of ranked) {
    if (keep.size >= keepTarget) break
    keep.add(pairKey(u, v))
  }
  for (const [u, v] of edges) if (!keep.has(pairKey(u, v))) { g.adj.get(u)!.delete(v); g.adj.get(v)!.delete(u) }
  g.removeNodes(g.isolates())
  return { edgesBefore: edges.length, edgesAfter: g.edgeCount(), targetEdges: target, mandatory: mandatory.size }
}

function keepOnlyTree(g: Graph<string>): void {
  const tree = new Set(maximumSpanningEdges(g).map(([u, v]) => pairKey(u, v)))
  for (const [u, v] of g.edges()) if (!tree.has(pairKey(u, v))) { g.adj.get(u)!.delete(v); g.adj.get(v)!.delete(u) }
}

// ── Metrics ──

/**
 * Betweenness and closeness with 1 ÷ weight as each link's length, as
 * networkx computes them (Brandes with Dijkstra; closeness with the
 * Wasserman–Faust correction): the same visiting order and sums, so the same
 * values. Both come from one shortest-path search per word.
 */
function pathCentralities(g: Graph<string>, normalized: boolean): { betweenness: Map<string, number>; closeness: Map<string, number> } {
  const nodes = g.nodes()
  const n = nodes.length
  const index = new Map(nodes.map((u, i) => [u, i]))
  const start = new Int32Array(n + 1)
  const nbr: number[] = []
  const len: number[] = []
  nodes.forEach((u, i) => {
    start[i] = nbr.length
    for (const [v, d] of g.adj.get(u)!) { nbr.push(index.get(v)!); len.push(1 / d.weight) }
  })
  start[n] = nbr.length
  const bc = new Float64Array(n)
  const cl = new Float64Array(n)
  const sigma = new Float64Array(n)
  const dist = new Float64Array(n)
  const seen = new Float64Array(n)
  const settled = new Uint8Array(n)
  const hasSeen = new Uint8Array(n)
  const delta = new Float64Array(n)
  const preds: number[][] = Array.from({ length: n }, () => [])
  // Heap entries: [distance, push counter, predecessor, node]; ties go to the earlier push.
  type Entry = [number, number, number, number]
  const less = (a: Entry, b: Entry): boolean => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])
  for (let s = 0; s < n; s++) {
    sigma.fill(0); settled.fill(0); hasSeen.fill(0)
    for (const p of preds) p.length = 0
    const S: number[] = []
    sigma[s] = 1
    seen[s] = 0; hasSeen[s] = 1
    const heap: Entry[] = [[0, 0, s, s]]
    let count = 1
    while (heap.length) {
      const top = heap[0]
      const last = heap.pop()!
      if (heap.length) {
        let i = 0
        for (;;) {
          const l = 2 * i + 1, r = l + 1
          if (l >= heap.length) break
          const c = r < heap.length && less(heap[r], heap[l]) ? r : l
          if (!less(heap[c], last)) break
          heap[i] = heap[c]; i = c
        }
        heap[i] = last
      }
      const [d, , pred, v] = top
      if (settled[v]) continue
      sigma[v] += sigma[pred]
      S.push(v)
      dist[v] = d
      settled[v] = 1
      for (let k = start[v]; k < start[v + 1]; k++) {
        const w = nbr[k]
        const vw = d + len[k]
        if (!settled[w] && (!hasSeen[w] || vw < seen[w])) {
          seen[w] = vw; hasSeen[w] = 1
          const e: Entry = [vw, count++, v, w]
          let i = heap.length
          heap.push(e)
          while (i > 0) {
            const p = (i - 1) >> 1
            if (!less(e, heap[p])) break
            heap[i] = heap[p]; i = p
          }
          heap[i] = e
          sigma[w] = 0
          preds[w].length = 0
          preds[w].push(v)
        } else if (hasSeen[w] && vw === seen[w]) {
          sigma[w] += sigma[v]
          preds[w].push(v)
        }
      }
    }
    // Closeness: distances summed in the order the words were reached.
    let tot = 0
    for (const v of S) tot += dist[v]
    if (tot > 0 && n > 1) cl[s] = ((S.length - 1) / tot) * ((S.length - 1) / (n - 1))
    for (const v of S) delta[v] = 0
    while (S.length) {
      const w = S.pop()!
      const coeff = (1 + delta[w]) / sigma[w]
      for (const v of preds[w]) delta[v] += sigma[v] * coeff
      if (w !== s) bc[w] += delta[w]
    }
  }
  // networkx's rescaling for undirected graphs.
  const scale = normalized ? (n > 2 ? 1 / ((n - 1) * (n - 2)) : null) : 0.5
  if (scale !== null) for (let i = 0; i < n; i++) bc[i] *= scale
  return { betweenness: new Map(nodes.map((u, i) => [u, bc[i]])), closeness: new Map(nodes.map((u, i) => [u, cl[i]])) }
}

/** Leading eigenvector of the weighted adjacency matrix, unit length, positive (networkx eigenvector_centrality_numpy). */
function eigenvector(g: Graph<string>): Map<string, number> {
  const nodes = g.nodes()
  const index = new Map(nodes.map((u, i) => [u, i]))
  const n = nodes.length
  let x = new Float64Array(n).fill(1 / Math.sqrt(n))
  for (let it = 0; it < 10000; it++) {
    // (A + I) x: the shift keeps the same leading vector and avoids oscillation.
    const y = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      let s = x[i]
      for (const [v, d] of g.adj.get(nodes[i])!) s += d.weight * x[index.get(v)!]
      y[i] = s
    }
    let norm = 0
    for (let i = 0; i < n; i++) norm += y[i] * y[i]
    norm = Math.sqrt(norm)
    let diff = 0
    for (let i = 0; i < n; i++) { y[i] /= norm; diff += Math.abs(y[i] - x[i]) }
    x = y
    if (diff < n * 1e-14) break
  }
  return new Map(nodes.map((u, i) => [u, x[i]]))
}

/** Longest shortest path (in links) of the graph, or of its largest component. */
function diameter(g: Graph<string>): number {
  if (g.size <= 1) return 0
  const comps = g.connectedComponents()
  let largest = comps[0]
  for (const c of comps) if (c.size > largest.size) largest = c
  const sub = comps.length === 1 ? g : g.subgraph(largest)
  let best = 0
  for (const s of sub.nodes()) {
    const depth = new Map<string, number>([[s, 0]])
    const queue = [s]
    for (let q = 0; q < queue.length; q++) {
      const u = queue[q]
      for (const v of sub.adj.get(u)!.keys()) if (!depth.has(v)) { depth.set(v, depth.get(u)! + 1); queue.push(v) }
    }
    for (const d of depth.values()) if (d > best) best = d
  }
  return best
}

// ── Layout ──

/** numpy.percentile with linear interpolation. */
function percentile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b)
  const pos = (s.length - 1) * (q / 100)
  const lo = Math.floor(pos), hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

/**
 * ForceAtlas2 with the settings labiia_lex sends to Gephi (strong gravity,
 * edge weight influence 0.5, Barnes–Hut θ 1.2), from the same circle start,
 * then labiia_lex's elliptical compression for a wide canvas (4000 × 2100).
 * The layout pulls by the doubled weight its forces were tuned with in
 * labiia_lex, so the drawing keeps the same proportions.
 */
function layout(g: Graph<string>, o: { iterations: number; scaling: number; gravity: number }): Map<string, [number, number]> {
  const gg = new AbstractGraph({ type: 'undirected' })
  const ids = g.nodes().slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  ids.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / ids.length
    gg.addNode(id, { x: Math.fround(100 * Math.cos(angle)), y: Math.fround(100 * Math.sin(angle)) })
  })
  for (const [u, v, d] of g.edges()) gg.addEdge(u, v, { weight: 2 * d.weight })
  forceAtlas2.assign(gg, {
    iterations: Math.max(1, Math.round(o.iterations)),
    getEdgeWeight: 'weight',
    settings: {
      scalingRatio: o.scaling,
      gravity: o.gravity,
      strongGravityMode: true,
      edgeWeightInfluence: 0.5,
      barnesHutOptimize: true,
      barnesHutTheta: 1.2,
      linLogMode: false,
      outboundAttractionDistribution: false,
      adjustSizes: false,
      slowDown: 1
    }
  })
  const nodes = gg.nodes()
  const pts = nodes.map((n) => [gg.getNodeAttribute(n, 'x') as number, gg.getNodeAttribute(n, 'y') as number])
  if (pts.length >= 3) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
    for (const p of pts) { p[0] -= cx; p[1] -= cy }
    const scale = percentile(pts.map((p) => Math.hypot(p[0], p[1])), 95)
    if (scale > 1e-6) for (const p of pts) { p[0] /= scale; p[1] /= scale }
    for (const p of pts) {
      const d = Math.hypot(p[0], p[1])
      if (d <= 1) continue
      const blend = Math.min(1, Math.max(0, (d - 1) / 2))
      const ratio = ((1 - blend) * d + blend * (1 + Math.log(d))) / d
      p[0] *= ratio; p[1] *= ratio
    }
    const stretch = (4000 / 2100) ** 0.65
    for (const p of pts) { p[0] *= stretch; p[1] /= stretch }
  }
  if (pts.length >= 2) labelAdjust(pts, nodes, nodes.map((n) => g.degree(n)))
  return new Map(nodes.map((n, i) => [n, [pts[i][0], pts[i][1]] as [number, number]]))
}

/**
 * labiia_lex's Gephi-mode label reflow (Gephi's Label Adjust): words whose
 * labels overlap are pushed apart, in three rounds of measuring the labels at
 * the drawing's scale, adjusting, and stretching the cloud back to the wide
 * canvas. Label sizes follow labiia_lex's drawing: 2.6–26 pt by the square
 * root of the normalised strength, at 240 dpi, on the plot area matplotlib
 * leaves in a 4000 × 2100 figure; text widths are estimated from the font
 * size (the app has no font metrics), so the spacing is close to labiia_lex's,
 * not identical.
 */
function labelAdjust(pts: number[][], labels: string[], strength: number[]): void {
  const n = pts.length
  const sMin = Math.min(...strength), sMax = Math.max(...strength)
  const range = Math.max(sMax - sMin, 1e-9)
  const box = labels.map((label, i) => {
    const norm = Math.max(0, Math.min(1, (strength[i] - sMin) / range))
    const px = ((2.6 + 23.4 * norm ** 0.5) * 240) / 72
    const charWidth = norm >= 0.85 ? 0.62 : norm >= 0.4 ? 0.58 : 0.55
    return [px * charWidth * label.length, px * 1.2]
  })
  // matplotlib's default plot area: 77.5% × 77% of the figure.
  const plotW = 4000 * 0.775, plotH = 2100 * 0.77
  const aspect = 4000 / 2100
  const MARGIN = 2, SPEED = 1.5, ITERATIONS = 600
  const w = new Float64Array(n), h = new Float64Array(n)
  for (let round = 0; round < 3; round++) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]) }
    // Axis limits with 10% padding, as labiia_lex frames the drawing before measuring.
    const sx = plotW / (Math.max(maxX - minX, 1) * 1.2)
    const sy = plotH / (Math.max(maxY - minY, 1) * 1.2)
    for (let i = 0; i < n; i++) { w[i] = box[i][0] / sx + MARGIN; h[i] = box[i][1] / sy + MARGIN }
    adjustLabels(pts, w, h, { speed: SPEED, iterations: ITERATIONS })
    // Label Adjust rounds the cloud; stretch x back to the canvas proportion.
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
    for (const p of pts) { a0 = Math.min(a0, p[0]); a1 = Math.max(a1, p[0]); b0 = Math.min(b0, p[1]); b1 = Math.max(b1, p[1]) }
    const xs = a1 - a0, ys = b1 - b0
    if (xs > 1e-9 && ys > 1e-9 && xs / ys < aspect) {
      const stretch = aspect / (xs / ys), cx = (a1 + a0) / 2
      for (const p of pts) p[0] = cx + (p[0] - cx) * stretch
    }
  }
}

// ── Pipeline ──

export function networkText(c: PreparedCorpus, lex: Lexicon, o: NetworkTextOptions): NetworkTextResult | null {
  const tokens = totalTokens(c)
  const profile = PROFILES.find((p) => tokens <= p.maxTokens)!
  const auto = o.autoTune
  const minFreq = Math.max(1, Math.round(auto ? profile.minFreq : o.minFreq))
  const minCooc = Math.max(1, Math.round(auto ? profile.minCooc : o.minCooc))
  const maxNodes = Math.max(10, Math.round(auto ? AUTO_MAX_NODES : o.maxNodes))
  const scaling = auto ? profile.scaling : o.scaling
  const gravity = auto ? profile.gravity : o.gravity
  const maxTree = !auto && o.maxTree

  const vocabulary = networkVocabulary(c, lex, minFreq)
  if (vocabulary.length < 2) return null
  const g = buildGraph(vocabulary, cooccurrences(c, vocabulary), minCooc, maxNodes)
  const bal = auto ? balance(g) : null
  if (maxTree && g.edgeCount() > 0) keepOnlyTree(g)
  if (g.size === 0) return null

  const nodes = g.nodes()
  const n = nodes.length
  const { betweenness: btw, closeness: clo } = pathCentralities(g, o.normalizeCentralities)
  const eig = eigenvector(g)
  const rawPartition = bestPartition(g, o.resolution, 42)
  const mod = new Set(rawPartition.values()).size > 1 ? modularity(g, rawPartition) : 0
  // Communities numbered from the largest, so colours follow their size.
  const sizes = new Map<number, number>()
  for (const com of rawPartition.values()) sizes.set(com, (sizes.get(com) ?? 0) + 1)
  const order = [...sizes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([com]) => com)
  const relabel = new Map(order.map((com, i) => [com, i]))
  const pos = layout(g, { iterations: o.iterations, scaling, gravity })

  // Segments where each word occurs, for reading it in context.
  const perWord = Math.max(0, Math.round(o.segmentsPerWord ?? 20))
  const wanted = new Set(nodes)
  const segOf = new Map<string, number[]>(nodes.map((u) => [u, []]))
  const segments: NetworkTextResult['segments'] = []
  const segIndex = new Map<number, number>()
  if (perWord > 0) {
    for (let s = 0; s < c.uceText.length; s++) {
      const here = new Set<string>()
      for (let t = c.uceStart[s]; t < c.uceStart[s + 1]; t++) {
        const w = c.forms[c.tokens[t]]
        if (wanted.has(w)) here.add(w)
      }
      for (const w of here) {
        const list = segOf.get(w)!
        if (list.length >= perWord) continue
        let k = segIndex.get(s)
        if (k === undefined) {
          k = segments.length
          segIndex.set(s, k)
          segments.push({ unit: c.units[c.uceUnit[s]].name, text: c.uceText[s] })
        }
        list.push(k)
      }
    }
  }

  const formIndex = new Map(c.forms.map((f, i) => [f, i]))
  const edges = g.edges().map(([u, v, d]) => ({ source: u, target: v, weight: d.weight }))
  const degreeSum = nodes.reduce((s, u) => s + g.adj.get(u)!.size, 0)
  return {
    version: 1,
    nodes: nodes.map((u) => ({
      id: u,
      frequency: c.formFreq[formIndex.get(u) ?? 0] ?? 0,
      degree: g.adj.get(u)!.size,
      strength: g.degree(u),
      betweenness: btw.get(u)!,
      closeness: clo.get(u)!,
      eigenvector: eig.get(u)!,
      community: relabel.get(rawPartition.get(u)!)!,
      x: pos.get(u)![0],
      y: pos.get(u)![1],
      segments: segOf.get(u)!
    })),
    edges,
    segments,
    stats: {
      nodes: n,
      edges: edges.length,
      communities: sizes.size,
      modularity: mod,
      density: n > 1 ? (2 * edges.length) / (n * (n - 1)) : 0,
      averageDegree: degreeSum / Math.max(n, 1),
      diameter: diameter(g)
    },
    diagnostics: {
      profile: auto ? profile.name : 'manual',
      totalTokens: tokens,
      selected: { minFreq, minCooc, maxNodes, scaling, gravity, maxTree },
      balance: bal
    }
  }
}
