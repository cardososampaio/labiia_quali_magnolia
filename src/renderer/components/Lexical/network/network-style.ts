/**
 * How the text network is drawn and which words are shown: palettes, sizes,
 * labels, link colours, filters and the researcher's edits to communities.
 * The defaults reproduce labiia_lex's Gephi look, so a saved analysis without
 * a style keeps its appearance. Only community edits change a result (the
 * community of each word); every other setting changes the drawing only.
 */
import { COMMUNITY_PALETTE } from '../../../models/lexical-api'

export type SizeMetric = 'strength' | 'frequency' | 'degree' | 'betweenness' | 'eigenvector'
export type FilterMetric = SizeMetric | 'closeness'
export type PaletteId = 'gephi' | 'pastel' | 'colorblind' | 'gray'

export interface NetworkStyle {
  palette: PaletteId
  /** Colours chosen for single communities, over the palette. */
  communityColors: Record<number, string>
  communityNames: Record<number, string>
  /** Words moved by hand to another community (after merging or recomputing). */
  moved: Record<string, number>
  /** Communities merged by hand: from → into. */
  merged: Record<number, number>
  /** Louvain resolution of communities recomputed in the window; null keeps the analysis's. */
  resolution: number | null
  edgeColor: 'source' | 'mix' | 'gray'
  edgeWidth: number
  edgeOpacity: number
  background: 'light' | 'dark'
  sizeBy: SizeMetric
  labelMin: number
  labelMax: number
  labelColor: 'dark' | 'community'
  /** 0 = every word labelled; otherwise only the N largest. */
  labelCount: number
  /** 0 = whole words; otherwise words are cut after N characters. */
  cropAt: number
  filters: {
    metric: { key: FilterMetric; min: number; max: number } | null
    ego: { word: string; depth: number } | null
    kcore: number
    largestComponent: boolean
  }
  layout: { gravity: number; scaling: number; linLog: boolean; dissuadeHubs: boolean; adjustSizes: boolean; strongGravity: boolean; slowDown: number }
  /** Words kept in place while the layout runs. */
  pinned: string[]
}

export function defaultStyle(): NetworkStyle {
  return {
    palette: 'gephi', communityColors: {}, communityNames: {}, moved: {}, merged: {}, resolution: null,
    edgeColor: 'source', edgeWidth: 1, edgeOpacity: 1, background: 'light',
    sizeBy: 'strength', labelMin: 4.5, labelMax: 31.5, labelColor: 'dark', labelCount: 0, cropAt: 0,
    filters: { metric: null, ego: null, kcore: 0, largestComponent: false },
    layout: { gravity: 1.3, scaling: 10, linLog: false, dissuadeHubs: false, adjustSizes: false, strongGravity: true, slowDown: 5 },
    pinned: []
  }
}

/** A saved style with any missing setting filled from the defaults (older analyses, newer settings). */
export function withDefaults(s: Partial<NetworkStyle> | undefined): NetworkStyle {
  const d = defaultStyle()
  if (!s) return d
  return { ...d, ...s, filters: { ...d.filters, ...(s.filters ?? {}) }, layout: { ...d.layout, ...(s.layout ?? {}) } }
}

export const PALETTES: Record<PaletteId, string[]> = {
  gephi: COMMUNITY_PALETTE,
  pastel: ['#B39DDB', '#A5D6A7', '#90CAF9', '#FFCC80', '#EF9A9A', '#80DEEA', '#F48FB1', '#C5E1A5', '#9FA8DA', '#FFAB91', '#80CBC4', '#E6CE80', '#B0BEC5', '#CE93D8', '#AED581', '#BCAAA4'],
  // Okabe & Ito, then Paul Tol's muted scheme: told apart with the common colour-vision deficiencies.
  colorblind: ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#F0E442', '#000000', '#332288', '#88CCEE', '#44AA99', '#117733', '#999933', '#DDCC77', '#CC6677', '#882255'],
  gray: ['#202020', '#5A5A5A', '#8C8C8C', '#3C3C3C', '#707070', '#A6A6A6', '#2E2E2E', '#4C4C4C', '#7E7E7E', '#989898', '#262626', '#646464', '#B4B4B4', '#363636', '#545454', '#868686']
}

export function communityColour(style: NetworkStyle, community: number): string {
  const p = PALETTES[style.palette] ?? PALETTES.gephi
  return style.communityColors[community] ?? p[community % p.length]
}

/** The colour on a canvas: translucent colours premultiplied (sigma's WebGL compositing expects it). */
export function premultiplied(hex: string, alpha: number): string {
  const k = Math.min(1, Math.max(0, alpha))
  const [r, g, b] = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k))
  return `rgba(${r},${g},${b},${k.toFixed(3)})`
}

export function mixHex(a: string, b: string): string {
  const c = [1, 3, 5].map((i) => Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2))
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** Link colour by its normalised weight nw (0–1): stronger links more opaque and thicker. */
export function edgeAppearance(style: NetworkStyle, sourceHex: string, targetHex: string, nw: number): { color: string; size: number } {
  const base = style.edgeColor === 'gray' ? (style.background === 'dark' ? '#B8C0CC' : '#66727F') : style.edgeColor === 'mix' ? mixHex(sourceHex, targetHex) : sourceHex
  return {
    color: premultiplied(base, Math.min(1, (0.18 + 0.55 * nw ** 0.7) * style.edgeOpacity)),
    size: (0.4 + 1.4 * nw ** 0.6) * style.edgeWidth
  }
}

/** Label size in pixels by the square root of the normalised metric (labiia_lex's gamma 0.5), and its weight. */
export function labelAppearance(style: NetworkStyle, value: number, min: number, max: number): { size: number; weight: string; norm: number } {
  const norm = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 1
  return { size: style.labelMin + (style.labelMax - style.labelMin) * Math.sqrt(norm), weight: norm >= 0.85 ? '700' : norm >= 0.4 ? '600' : '400', norm }
}

export function cropLabel(word: string, cropAt: number): string {
  return cropAt > 0 && word.length > cropAt ? word.slice(0, cropAt) + '…' : word
}

/** Undirected adjacency of the network (word → neighbours). */
export type Adjacency = Map<string, Set<string>>

export function adjacency(edges: { source: string; target: string }[]): Adjacency {
  const adj: Adjacency = new Map()
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set())
    if (!adj.has(e.target)) adj.set(e.target, new Set())
    adj.get(e.source)!.add(e.target)
    adj.get(e.target)!.add(e.source)
  }
  return adj
}

/** Words within `depth` links of `word` (its ego network). */
export function egoNetwork(adj: Adjacency, word: string, depth: number): Set<string> {
  const seen = new Set([word])
  let frontier = [word]
  for (let d = 0; d < depth; d++) {
    const next: string[] = []
    for (const u of frontier) for (const v of adj.get(u) ?? []) if (!seen.has(v)) { seen.add(v); next.push(v) }
    frontier = next
  }
  return seen
}

/** Words of the k-core: the largest part where every word has at least k links inside it. */
export function kCore(adj: Adjacency, k: number, among?: Set<string>): Set<string> {
  const alive = new Set(among ?? adj.keys())
  const degree = new Map<string, number>()
  for (const u of alive) degree.set(u, [...(adj.get(u) ?? [])].filter((v) => alive.has(v)).length)
  const queue = [...alive].filter((u) => degree.get(u)! < k)
  while (queue.length) {
    const u = queue.pop()!
    if (!alive.has(u)) continue
    alive.delete(u)
    for (const v of adj.get(u) ?? []) {
      if (!alive.has(v)) continue
      const d = degree.get(v)! - 1
      degree.set(v, d)
      if (d < k) queue.push(v)
    }
  }
  return alive
}

/** The largest k with a non-empty k-core (the network's degeneracy): the core filter's upper limit. */
export function maxCore(adj: Adjacency): number {
  let k = 0
  while (kCore(adj, k + 1).size > 0) k++
  return k
}

/** The largest connected group of words among `among`. */
export function largestComponent(adj: Adjacency, among: Set<string>): Set<string> {
  const seen = new Set<string>()
  let best = new Set<string>()
  for (const s of among) {
    if (seen.has(s)) continue
    const comp = new Set([s])
    const queue = [s]
    seen.add(s)
    while (queue.length) {
      const u = queue.pop()!
      for (const v of adj.get(u) ?? []) if (among.has(v) && !seen.has(v)) { seen.add(v); comp.add(v); queue.push(v) }
    }
    if (comp.size > best.size) best = comp
  }
  return best
}

export interface FilterableNode { id: string; strength: number; frequency: number; degree: number; betweenness: number; closeness: number; eigenvector: number }

/**
 * Words left by the filters, applied in order: metric range, ego network,
 * k-core, largest component. Each narrows what the previous one left.
 */
export function visibleWords(nodes: FilterableNode[], adj: Adjacency, f: NetworkStyle['filters']): Set<string> {
  let keep = new Set(nodes.map((n) => n.id))
  if (f.metric) {
    const { key, min, max } = f.metric
    keep = new Set(nodes.filter((n) => n[key] >= min && n[key] <= max).map((n) => n.id))
  }
  if (f.ego && adj.has(f.ego.word)) {
    const ego = egoNetwork(adj, f.ego.word, Math.max(1, f.ego.depth))
    keep = new Set([...keep].filter((u) => ego.has(u)))
  }
  if (f.kcore > 0) keep = kCore(adj, f.kcore, keep)
  if (f.largestComponent) keep = largestComponent(adj, keep)
  return keep
}
