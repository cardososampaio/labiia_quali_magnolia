/**
 * Thematic map (labiia_lex's "Mapa temático", co-word analysis after Callon
 * and bibliometrix's thematicMap): words linked by the equivalence index
 * E = c_ij² / (c_i·c_j) over text segments, a budgeted network reconnected
 * by its strongest links, Louvain communities as themes, and each theme
 * placed by centrality (links to other themes) and density (internal
 * cohesion) in the strategic diagram.
 *
 * Difference from labiia_lex: documents keep their names, and a heading line
 * ("****") inside a document does not make it two documents. Variables per
 * category are not produced yet.
 */
import type { PreparedCorpus } from '../corpus/prepare'
import type { Lexicon } from '../corpus/lexicon'
import { activeVocabulary } from './lda'
import { Graph, louvainCommunities, pagerank, degreeCentrality, betweennessCentrality } from './graph'
import { readableNetworkFigure } from '../plot/readable-network'
import { ggplotHue } from '../plot/colors'
import type { NetworkFigure, StrategicFigure } from '../../../renderer/models/lexical-figures'

export interface ThematicOptions {
  minFreq: number
  maxFeatures: number
  topEdges: number
  maxNodes: number
  minCooc: number
  useLemmas: boolean
  resolution: number
  labelWords: number
  labelAlpha: number
  minThemeFreq: number
}

export interface ThemeRow {
  community_id: number
  community_code: string
  label: string
  n_nodes: number
  n_expressions: number
  frequency: number
  centrality: number
  density: number
  top_terms: string
  rank_centrality: number
  rank_density: number
  quadrant: string
  display_centrality: number
  display_density: number
}

export interface ThematicResult {
  network: NetworkFigure
  strategic: StrategicFigure
  themes: ThemeRow[]
  nodesCsv: string
  edgesCsv: string
  documentsCsv: string
  sentencesCsv: string
  summary: Record<string, unknown>
}

export type ThematicOutcome = ThematicResult | { error: 'thematic-too-small' | 'thematic-empty' | 'thematic-no-theme'; minTermFrequency?: number }

interface Pair { a: string; b: string; cooc: number; e: number }

const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0)
const pairOrder = (p: Pair, q: Pair): number => q.e - p.e || q.cooc - p.cooc || cmp(p.a, q.a) || cmp(p.b, q.b)

/** Every pair with at least `minCooc` shared segments, by equivalence index (then co-occurrence, then names). */
function rankEquivalence(cooc: Map<number, number>, docFreq: number[], vocab: string[], minCooc: number): Pair[] {
  const V = vocab.length
  const out: Pair[] = []
  for (const [key, value] of cooc) {
    if (value < minCooc) continue
    const i = Math.floor(key / V), j = key % V
    const denom = docFreq[i] * docFreq[j]
    if (denom <= 0) continue
    out.push({ a: vocab[i], b: vocab[j], cooc: value, e: (value * value) / denom })
  }
  return out.sort(pairOrder)
}

/** R's rank(): average position, 1 = smallest. */
export function averageRank(values: number[]): number[] {
  const order = values.map((_v, i) => i).sort((a, b) => values[a] - values[b] || a - b)
  const ranks = new Array(values.length).fill(0)
  let start = 0
  while (start < order.length) {
    let end = start
    while (end + 1 < order.length && values[order[end + 1]] === values[order[start]]) end++
    for (let k = start; k <= end; k++) ranks[order[k]] = (start + end) / 2 + 1
    start = end + 1
  }
  return ranks
}

function quadrant(c: number, d: number, mc: number, md: number): string {
  const hc = c >= mc, hd = d >= md
  if (hc && hd) return 'Temas motores'
  if (hc) return 'Temas básicos'
  if (hd) return 'Temas especializados'
  // Without time there is no telling emerging from declining themes.
  return 'Temas periféricos'
}

/** Nudges crowded bubbles apart on the display only; the analytical values stay. */
export function spreadDisplay(rows: ThemeRow[]): void {
  if (!rows.length) return
  const xs = rows.map((r) => r.rank_centrality), ys = rows.map((r) => r.rank_density)
  const xMin = Math.min(...xs), yMin = Math.min(...ys)
  const xSpan = Math.max(Math.max(...xs) - xMin, 0.02), ySpan = Math.max(Math.max(...ys) - yMin, 0.02)
  const pos = xs.map((x, i) => [(x - xMin) / xSpan, (ys[i] - yMin) / ySpan])
  const orig = pos.map((p) => [...p])
  const minDist = rows.length <= 20 ? 0.055 : 0.045
  const maxShift = 0.075
  for (let pass = 0; pass < 180; pass++) {
    let moved = false
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[j][0] - pos[i][0], dy = pos[j][1] - pos[i][1]
        let dist = Math.sqrt(dx * dx + dy * dy)
        if (dist >= minDist) continue
        let ux: number, uy: number
        if (dist <= 1e-9) {
          const angle = ((i + 1) * 2.399963229728653) % (Math.PI * 2)
          ux = Math.cos(angle); uy = Math.sin(angle); dist = 1
        } else { ux = dx / dist; uy = dy / dist }
        const push = (minDist - dist) * 0.52
        pos[i][0] -= ux * push; pos[i][1] -= uy * push
        pos[j][0] += ux * push; pos[j][1] += uy * push
        moved = true
      }
    }
    pos.forEach((p, i) => {
      const dx = p[0] - orig[i][0], dy = p[1] - orig[i][1]
      const shift = Math.sqrt(dx * dx + dy * dy)
      if (shift > maxShift) { p[0] = orig[i][0] + dx * (maxShift / shift); p[1] = orig[i][1] + dy * (maxShift / shift) }
      p[0] = Math.min(1.04, Math.max(-0.04, p[0]))
      p[1] = Math.min(1.04, Math.max(-0.04, p[1]))
    })
    if (!moved) break
  }
  rows.forEach((r, i) => { r.display_centrality = xMin + pos[i][0] * xSpan; r.display_density = yMin + pos[i][1] * ySpan })
}

export function strategicFigure(rows: ThemeRow[]): StrategicFigure {
  const n = rows.length
  const xs = rows.map((r) => r.display_centrality), ys = rows.map((r) => r.display_density)
  const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)
  const freqs = rows.map((r) => r.frequency)
  const fMax = Math.max(...freqs, 0) > 0 ? Math.max(...freqs) : 1
  const colors = ggplotHue(Math.max(1, n))
  const pad = 0.9 + 0.05 * n
  return {
    kind: 'strategic',
    title: 'Mapa Estratégico de Temas',
    xlabel: 'Grau de relevância (posição na centralidade)',
    ylabel: 'Grau de desenvolvimento (posição na densidade)',
    figW: 10,
    figH: 7.4,
    dpi: 120,
    xlim: [Math.min(...xs, 1) - pad, Math.max(...xs, n) + pad],
    ylim: [Math.min(...ys, 1) - pad, Math.max(...ys, n) + pad],
    meanX: mean(rows.map((r) => r.rank_centrality)),
    meanY: mean(rows.map((r) => r.rank_density)),
    bubbles: rows.map((r, i) => ({ x: xs[i], y: ys[i], size: 400 + 5200 * (r.frequency / fMax), color: colors[i], lines: (r.label || r.community_code).split(' / ') })),
    corners: { topRight: 'Temas motores', topLeft: 'Temas especializados', bottomRight: 'Temas básicos', bottomLeft: 'Temas periféricos' }
  }
}

const f6 = (v: number): string => v.toFixed(6)
const csvCell = (v: string): string => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const toCsv = (header: string[], rows: (string | number)[][]): string =>
  [header, ...rows].map((r) => r.map((c) => csvCell(String(c))).join(';')).join('\n') + '\n'

/** TextRank over the segments' content words (Dice similarity), as labiia_lex's extractive summary. */
function textRank(sets: Set<string>[]): number[] {
  const n = sets.length
  // Above this size the all-pairs similarity is too slow; every segment then starts equal.
  if (n === 0 || n > 4000) return new Array(n).fill(1 / Math.max(1, n))
  const postings = new Map<string, number[]>()
  sets.forEach((s, i) => { for (const t of s) { let p = postings.get(t); if (!p) postings.set(t, (p = [])); p.push(i) } })
  // Shared-word counts per pair through the word postings, with a reusable counter row.
  const nbrIdx: number[][] = sets.map(() => [])
  const nbrVal: number[][] = sets.map(() => [])
  const shared = new Int32Array(n)
  const touched: number[] = []
  for (let i = 0; i < n; i++) {
    if (!sets[i].size) continue
    for (const t of sets[i]) for (const j of postings.get(t)!) if (j > i) { if (shared[j] === 0) touched.push(j); shared[j]++ }
    for (const j of touched) {
      const v = (2 * shared[j]) / (sets[i].size + sets[j].size)
      nbrIdx[i].push(j); nbrVal[i].push(v)
      nbrIdx[j].push(i); nbrVal[j].push(v)
      shared[j] = 0
    }
    touched.length = 0
  }
  const rowSum = nbrVal.map((vals) => vals.reduce((a, b) => a + b, 0))
  let scores = new Array(n).fill(1 / n)
  const teleport = 0.15 / n
  for (let it = 0; it < 30; it++) {
    const next = new Array(n).fill(0)
    let uniform = 0
    for (let i = 0; i < n; i++) {
      if (rowSum[i] > 0) { const idx = nbrIdx[i], vals = nbrVal[i], w = scores[i] / rowSum[i]; for (let q = 0; q < idx.length; q++) next[idx[q]] += vals[q] * w }
      else uniform += scores[i] / n
    }
    scores = next.map((v) => teleport + 0.85 * (v + uniform))
  }
  return scores
}

export function thematicMap(c: PreparedCorpus, lex: Lexicon, o: ThematicOptions): ThematicOutcome {
  const vocab = activeVocabulary(c, lex, { minFreq: o.minFreq, maxFeatures: Math.max(20, o.maxFeatures), useLemmas: o.useLemmas, floor: 20, dropEnglish: true })
  if (vocab.length < 2) return { error: 'thematic-too-small' }
  const V = vocab.length
  const index = new Map(vocab.map((t, i) => [t, i]))
  const termOfForm = (f: number): number | undefined => (c.formAct[f] === 1 ? index.get(o.useLemmas ? c.lemmas[c.formLemma[f]] : c.forms[f]) : undefined)

  // Segment x term table: occurrences per term, segments per term, shared segments per pair.
  const nSeg = c.uceText.length
  const termFreq = new Array(V).fill(0)
  const docFreq = new Array(V).fill(0)
  const cooc = new Map<number, number>()
  const segTerms: number[][] = []
  const unitCounts = c.units.map(() => new Float64Array(V))
  for (let s = 0; s < nSeg; s++) {
    const present = new Set<number>()
    const unit = unitCounts[c.uceUnit[s]]
    for (let t = c.uceStart[s]; t < c.uceStart[s + 1]; t++) {
      const k = termOfForm(c.tokens[t])
      if (k === undefined) continue
      termFreq[k]++
      unit[k]++
      present.add(k)
    }
    const list = [...present].sort((a, b) => a - b)
    segTerms.push(list)
    for (const k of list) docFreq[k]++
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const key = list[a] * V + list[b]
      cooc.set(key, (cooc.get(key) ?? 0) + 1)
    }
  }

  const ranked = rankEquivalence(cooc, docFreq, vocab, o.minCooc)
  let selected = ranked.slice(0, o.topEdges)
  let fallback = 'none'
  if (!selected.length) {
    // labiia_lex relaxes to a single shared segment before giving up.
    selected = rankEquivalence(cooc, docFreq, vocab, 1).slice(0, o.topEdges)
    if (selected.length) fallback = 'relaxed_cooccurrence'
  }
  if (!selected.length) return { error: 'thematic-empty' }

  // Statistics of the unbudgeted network, as labiia_lex reports them.
  const raw = new Graph<string>()
  for (const p of selected) raw.addEdge(p.a, p.b, { weight: p.e, cooccurrence: p.cooc })
  let legacy = raw
  if (raw.size > o.maxNodes) {
    const keep = raw.nodes().map((u) => [u, raw.degree(u)] as const)
      .sort((x, y) => y[1] - x[1] || cmp(y[0], x[0])).slice(0, o.maxNodes).map(([u]) => u)
    legacy = raw.subgraph(new Set(keep))
  }
  const isolatedRemoved = legacy.isolates().length

  // Strongest links first, never exceeding the node budget.
  const graph = new Graph<string>()
  const maxNodes = Math.max(2, o.maxNodes)
  let skipped = 0
  for (const p of selected) {
    if (!p.a || !p.b || p.a === p.b) continue
    const added = (graph.has(p.a) ? 0 : 1) + (graph.has(p.b) ? 0 : 1)
    if (graph.size + added > maxNodes) { skipped++; continue }
    graph.addEdge(p.a, p.b, { weight: p.e, cooccurrence: p.cooc })
  }

  // Islands are reconnected by a maximum spanning backbone over the same index.
  let backbone = 0
  if (graph.size >= 2 && graph.connectedComponents().length > 1) {
    const label = new Map<string, number>()
    graph.connectedComponents().forEach((comp, i) => { for (const u of comp) label.set(u, i) })
    let comps = new Set(label.values()).size
    for (const threshold of [...new Set([Math.max(1, o.minCooc), 1])].sort((a, b) => b - a)) {
      if (comps <= 1) break
      for (const p of rankEquivalence(cooc, docFreq, vocab, threshold)) {
        if (!label.has(p.a) || !label.has(p.b)) continue
        const la = label.get(p.a)!, lb = label.get(p.b)!
        if (la === lb) continue
        graph.addEdge(p.a, p.b, { weight: p.e, cooccurrence: p.cooc, backbone: true })
        for (const [u, v] of label) if (v === lb) label.set(u, la)
        backbone++
        if (--comps <= 1) break
      }
    }
  }
  if (graph.edgeCount() <= 0 || graph.size < 2) return { error: 'thematic-empty' }
  const components = graph.connectedComponents().map((s) => s.size)

  let communities = louvainCommunities(graph, o.resolution, 42)
  if (!communities.length) communities = [new Set(graph.nodes())]
  communities = communities.filter((s) => s.size >= 2 || [...s].some((u) => graph.adj.get(u)!.size > 0))
  if (!communities.length) communities = [new Set(graph.nodes())]
  const communityOf = new Map<string, number>()
  communities.forEach((s, i) => { for (const u of s) communityOf.set(u, i) })

  const freqOf = (u: string): number => termFreq[index.get(u)!] ?? 0
  const degree = degreeCentrality(graph)
  const betweenness = graph.size > 2 ? betweennessCentrality(graph) : new Map(graph.nodes().map((u) => [u, 0]))

  // Themes keep only terms above the minimum frequency (per thousand segments), like bibliometrix's minfreq.
  const minTermFreq = Math.max(2, Math.floor((o.minThemeFreq * nSeg) / 1000))
  const before = communities.length
  const kept = communities.map((s) => new Set([...s].filter((u) => freqOf(u) >= minTermFreq))).filter((s) => s.size)
  if (!kept.length) return { error: 'thematic-no-theme', minTermFrequency: minTermFreq }
  const themeGraph = graph.subgraph(new Set(kept.flatMap((s) => [...s])))

  const pr = themeGraph.edgeCount() ? pagerank(themeGraph) : new Map<string, number>()
  const labelWords = Math.max(1, Math.min(3, Math.round(o.labelWords)))
  const rows: ThemeRow[] = kept.map((set, idx) => {
    const nodes = [...set]
    let internal = 0
    for (const [u, v, d] of themeGraph.edges()) if (set.has(u) && set.has(v)) internal += d.weight
    let external = 0
    for (const u of nodes) for (const [v, d] of themeGraph.adj.get(u)!) if (!set.has(v)) external += d.weight
    const strength = new Map(nodes.map((u) => {
      let s = 0
      for (const [v, d] of themeGraph.adj.get(u)!) if (set.has(v)) s += v === u ? 2 * d.weight : d.weight
      return [u, s]
    }))
    const byStrength = [...nodes].sort((a, b) => strength.get(b)! - strength.get(a)! || freqOf(b) - freqOf(a) || cmp(a, b))
    const themeFreq = nodes.reduce((s, u) => s + freqOf(u), 0) || 1
    const score = (u: string): number => o.labelAlpha * freqOf(u) / themeFreq + (1 - o.labelAlpha) * (pr.get(u) ?? 0)
    const scored = [...nodes].sort((a, b) => score(b) - score(a) || cmp(a, b))
    return {
      community_id: idx,
      community_code: `C${idx}`,
      label: scored.slice(0, labelWords).join(' / '),
      n_nodes: nodes.length,
      n_expressions: 0,
      frequency: nodes.reduce((s, u) => s + freqOf(u), 0),
      centrality: external * 10,
      density: nodes.length > 1 ? (internal / nodes.length) * 100 : 0,
      top_terms: byStrength.slice(0, 12).join(', '),
      rank_centrality: 0,
      rank_density: 0,
      quadrant: '',
      display_centrality: 0,
      display_density: 0
    }
  })
  const rc = averageRank(rows.map((r) => r.centrality)), rd = averageRank(rows.map((r) => r.density))
  const mc = rc.reduce((a, b) => a + b, 0) / rc.length, md = rd.reduce((a, b) => a + b, 0) / rd.length
  rows.forEach((r, i) => { r.rank_centrality = rc[i]; r.rank_density = rd[i]; r.quadrant = quadrant(rc[i], rd[i], mc, md) })
  spreadDisplay(rows)

  const edges = graph.edges()
  const network = readableNetworkFigure(graph.nodes(), edges.map(([a, b, d]) => ({ source: a, target: b, weight: d.weight })), {
    title: 'Rede de Expressões Compostas',
    maxLabels: graph.size,
    communityOf
  })

  const nodesCsv = toCsv(
    ['node_id', 'label', 'normalized_label', 'frequency', 'degree_centrality', 'betweenness_centrality', 'community_id', 'node_type', 'in_degree', 'out_degree', 'segments_count', 'label_priority', 'is_representative_label'],
    graph.nodes().map((u) => [u, u, u, freqOf(u), f6(degree.get(u)!), f6(betweenness.get(u) ?? 0), communityOf.get(u) ?? 0, 'term', 0, 0, 0, f6(graph.degree(u)), 0])
  )
  const edgesCsv = toCsv(
    ['source', 'target', 'cooccurrence', 'association_weight', 'edge_type', 'dominant_verb'],
    edges.map(([a, b, d]) => [a, b, d.cooccurrence ?? 0, f6(d.weight), 'expression_association', ''])
  )

  // Each document goes to the theme whose terms it uses most.
  const themeCols = kept.map((s) => [...s].map((u) => index.get(u)!))
  const documentsCsv = toCsv(
    ['doc_id', 'documento', 'tema_principal', 'rotulo_tema', 'participacao', ...rows.map((r) => `ocorrencias_${r.community_code}`)],
    c.units.map((unit, d) => {
      const counts = themeCols.map((cols) => cols.reduce((s, k) => s + unitCounts[d][k], 0))
      const total = counts.reduce((a, b) => a + b, 0)
      let best = 0
      counts.forEach((v, i) => { if (v > counts[best]) best = i })
      const head = total > 0
        ? [rows[best].community_code, rows[best].label, String(Math.round((counts[best] / total) * 10000) / 10000)]
        : ['', '', '0']
      return [d, unit.name, ...head, ...counts]
    })
  )

  // Representative segments: TextRank over content words plus the share of the theme's terms they contain.
  const segSets = segTerms.map((list) => new Set(list.map((k) => vocab[k])))
  const base = textRank(segSets)
  const sentenceRows: (string | number)[][] = []
  rows.forEach((r) => {
    const target = new Set(r.top_terms.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))
    if (!target.size) return
    const scored: { score: number; idx: number; matched: string[] }[] = []
    segSets.forEach((set, idx) => {
      const matched = [...set].filter((t) => target.has(t)).sort(cmp)
      if (matched.length) scored.push({ score: base[idx] + matched.length / target.size, idx, matched })
    })
    scored.sort((a, b) => b.score - a.score || a.idx - b.idx)
    const seen = new Set<string>()
    for (const s of scored.slice(0, 3)) {
      const text = c.uceText[s.idx].trim()
      if (seen.has(text)) continue
      seen.add(text)
      const d = c.uceUnit[s.idx]
      sentenceRows.push(['community', r.community_id, text, f6(s.score), d, c.units[d].name, s.matched.join(', ')])
    }
  })
  const sentencesCsv = toCsv(['target_type', 'target_id', 'sentence', 'score', 'doc_id', 'doc_label', 'matched_terms'], sentenceRows)

  const summary = {
    analysis_type: 'thematic_map',
    source_mode: 'filtered_terms',
    n_nodes: graph.size,
    n_edges: edges.length,
    community_count: rows.length,
    community_resolution: Math.round(o.resolution * 10000) / 10000,
    community_algorithm: 'louvain',
    label_words: labelWords,
    label_alpha: o.labelAlpha,
    min_theme_freq_per_thousand: o.minThemeFreq,
    min_term_frequency: minTermFreq,
    themes_removed_by_frequency: before - kept.length,
    network_fallback: fallback,
    raw_network_nodes: raw.size,
    raw_network_edges: raw.edgeCount(),
    skipped_edges_by_node_budget: skipped,
    isolated_nodes_removed: isolatedRemoved,
    backbone_edges_added: backbone,
    network_component_count: components.length,
    largest_component_ratio: Math.round((Math.max(...components) / graph.size) * 1e6) / 1e6,
    segments: nSeg
  }
  return { network, strategic: strategicFigure(rows), themes: rows, nodesCsv, edgesCsv, documentsCsv, sentencesCsv, summary }
}
