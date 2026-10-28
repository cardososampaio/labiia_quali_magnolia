/**
 * Network layout as labiia_lex draws its readable networks (bigrams,
 * trigrams, thematic maps): each connected group laid out on its own with
 * networkx's Fruchterman-Reingold spring layout, groups placed in rows,
 * then nodes pushed apart until node and label boxes no longer overlap.
 *
 * The spring layout follows networkx 3.6 (`_fruchterman_reingold`, dense
 * version used below 500 nodes) and its starting positions come from the
 * same random generator as numpy, so a given seed gives labiia_lex's layout.
 */
import { RandomState } from './random'

export interface WeightedEdge {
  source: string
  target: string
  weight: number
}

export type Positions = Map<string, [number, number]>

/**
 * networkx.spring_layout for one connected graph. `nodes` fixes the matrix
 * order (networkx uses the graph's node order); `adjacency` gives the layout
 * weight of each pair.
 */
export function springLayout(
  nodes: string[],
  adjacency: (i: number, j: number) => number,
  opts: { k: number; iterations: number; scale: number; seed: number; threshold?: number }
): Positions {
  const n = nodes.length
  const out: Positions = new Map()
  if (n === 0) return out
  if (n === 1) {
    out.set(nodes[0], [0, 0])
    return out
  }
  const rng = new RandomState(opts.seed)
  const px = new Float64Array(n)
  const py = new Float64Array(n)
  // numpy fills rand(n, 2) row by row: x then y of each node.
  for (let i = 0; i < n; i++) {
    px[i] = rng.random()
    py[i] = rng.random()
  }
  const A = new Float64Array(n * n)
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) A[i * n + j] = adjacency(i, j)

  const k = opts.k
  const threshold = opts.threshold ?? 1e-4
  let t = Math.max(Math.max(...px) - Math.min(...px), Math.max(...py) - Math.min(...py)) * 0.1
  const dt = t / (opts.iterations + 1)
  const dxs = new Float64Array(n)
  const dys = new Float64Array(n)

  for (let it = 0; it < opts.iterations; it++) {
    for (let i = 0; i < n; i++) {
      let sx = 0
      let sy = 0
      for (let j = 0; j < n; j++) {
        const dx = px[i] - px[j]
        const dy = py[i] - py[j]
        let d = Math.sqrt(dx * dx + dy * dy)
        if (d < 0.01) d = 0.01
        const f = (k * k) / (d * d) - (A[i * n + j] * d) / k
        sx += dx * f
        sy += dy * f
      }
      dxs[i] = sx
      dys[i] = sy
    }
    let moved = 0
    for (let i = 0; i < n; i++) {
      let len = Math.sqrt(dxs[i] * dxs[i] + dys[i] * dys[i])
      if (len < 0.01) len = 0.01
      // Same order of operations as numpy (t / length first) so rounding matches.
      const step = t / len
      const ddx = dxs[i] * step
      const ddy = dys[i] * step
      px[i] += ddx
      py[i] += ddy
      moved += ddx * ddx + ddy * ddy
    }
    t -= dt
    if (Math.sqrt(moved) / n < threshold) break
  }

  // rescale_layout: centre on the mean, largest coordinate magnitude = scale.
  let mx = 0
  let my = 0
  for (let i = 0; i < n; i++) { mx += px[i]; my += py[i] }
  mx /= n
  my /= n
  let lim = 0
  for (let i = 0; i < n; i++) {
    px[i] -= mx
    py[i] -= my
    lim = Math.max(lim, Math.abs(px[i]), Math.abs(py[i]))
  }
  const factor = lim > 0 ? opts.scale / lim : 1
  for (let i = 0; i < n; i++) out.set(nodes[i], [px[i] * factor, py[i] * factor])
  return out
}

/** Connected groups of the graph, each listing its nodes in graph order. */
export function connectedComponents(nodes: string[], edges: WeightedEdge[]): string[][] {
  const parent = new Map(nodes.map((v) => [v, v]))
  const find = (v: string): string => {
    let r = v
    while (parent.get(r) !== r) r = parent.get(r)!
    while (parent.get(v) !== r) { const next = parent.get(v)!; parent.set(v, r); v = next }
    return r
  }
  for (const e of edges) {
    const a = find(e.source)
    const b = find(e.target)
    if (a !== b) parent.set(a, b)
  }
  const groups = new Map<string, string[]>()
  for (const v of nodes) {
    const r = find(v)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(v)
  }
  return [...groups.values()]
}

/**
 * labiia_lex's _component_layout. Larger groups first; groups of equal size
 * ordered by their first word (labiia_lex leaves this order to Python's set
 * hashing, which changes from run to run; a fixed order keeps the picture
 * stable).
 */
export function componentLayout(nodes: string[], edges: WeightedEdge[], seed = 42): Positions {
  const weightOf = new Map<string, number>()
  for (const e of edges) {
    weightOf.set(`${e.source}\u0000${e.target}`, e.weight)
    weightOf.set(`${e.target}\u0000${e.source}`, e.weight)
  }
  const comps = connectedComponents(nodes, edges)
  comps.sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))

  const positions: Positions = new Map()
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0
  const maxRowWidth = Math.max(20, Math.sqrt(Math.max(1, nodes.length)) * 8)
  const gap = 4

  comps.forEach((group, idx) => {
    let local: Positions
    if (group.length === 1) {
      local = new Map([[group[0], [0, 0]]])
    } else {
      const k = Math.max(1.65, 4.8 / Math.sqrt(group.length))
      const scale = Math.max(3.2, Math.sqrt(group.length) * 2.45)
      local = springLayout(group, (i, j) => {
        const w = weightOf.get(`${group[i]}\u0000${group[j]}`)
        return w === undefined ? 0 : 1 + Math.log1p(Math.max(0, w))
      }, { k, iterations: 1300, scale, seed: seed + idx })
    }
    const xs = [...local.values()].map((p) => p[0])
    const ys = [...local.values()].map((p) => p[1])
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const width = Math.max(Math.max(...xs) - minX, 1)
    const height = Math.max(Math.max(...ys) - minY, 1)
    if (cursorX > 0 && cursorX + width > maxRowWidth) {
      cursorX = 0
      cursorY -= rowHeight + gap
      rowHeight = 0
    }
    for (const [v, [x, y]] of local) positions.set(v, [cursorX + (x - minX), cursorY + (y - minY)])
    cursorX += width + gap
    rowHeight = Math.max(rowHeight, height)
  })
  return positions
}

/**
 * labiia_lex's _spread_nodes_for_labels: pushes nodes apart along the axis
 * of least overlap until each node's box (dot plus the label above it)
 * clears the others. Sizes are in inches of the final figure, so the data
 * to inch scale is recomputed on every pass as the network opens up.
 */
export function spreadNodesForLabels(
  positions: Positions,
  labelNodes: Set<string>,
  fontSizes: Map<string, number>,
  nodeRadiusPt: Map<string, number>,
  figW: number,
  figH: number,
  passes = 1500
): { positions: Positions; passes: number } {
  const nodes = [...positions.keys()]
  const pos = nodes.map((v) => [...positions.get(v)!] as [number, number])
  if (nodes.length < 2) return { positions, passes: 0 }
  const boxW = new Float64Array(nodes.length)
  const boxH = new Float64Array(nodes.length)
  const boxO = new Float64Array(nodes.length)
  let used = 0
  for (let pass = 0; pass < passes; pass++) {
    used = pass + 1
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [x, y] of pos) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const perInchX = (Math.max(maxX - minX, 1e-6) * 1.32) / (figW * 0.8)
    const perInchY = (Math.max(maxY - minY, 1e-6) * 1.32) / (figH * 0.8)
    nodes.forEach((v, i) => {
      const radius = (nodeRadiusPt.get(v) ?? 6) / 72
      let textW = 0
      let textH = 0
      if (labelNodes.has(v)) {
        const size = fontSizes.get(v) ?? 8
        textW = (v.length * 0.6 * size) / 72 + 0.08
        textH = (size * 1.3) / 72 + 5 / 72
      }
      const width = Math.max(textW, 2 * radius + 0.04)
      const height = 2 * radius + textH + 0.03
      boxW[i] = (width / 2) * perInchX
      boxH[i] = (height / 2) * perInchY
      boxO[i] = (textH / 2) * perInchY
    })
    let moved = false
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = pos[j][0] - pos[i][0]
        const dy = pos[j][1] + boxO[j] - (pos[i][1] + boxO[i])
        const overX = boxW[i] + boxW[j] - Math.abs(dx)
        const overY = boxH[i] + boxH[j] - Math.abs(dy)
        if (overX <= 0 || overY <= 0) continue
        moved = true
        if (overX / (boxW[i] + boxW[j]) < overY / (boxH[i] + boxH[j])) {
          const sign = dx >= 0 ? 1 : -1
          const shift = overX * 0.52
          pos[i][0] -= sign * shift
          pos[j][0] += sign * shift
        } else {
          const sign = dy >= 0 ? 1 : -1
          const shift = overY * 0.52
          pos[i][1] -= sign * shift
          pos[j][1] += sign * shift
        }
      }
    }
    if (!moved) break
  }
  return { positions: new Map(nodes.map((v, i) => [v, pos[i]])), passes: used }
}
