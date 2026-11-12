/**
 * Interactive text network (the "Rede textual" result), drawn with sigma.js
 * in the Gephi style of labiia_lex: words sized by a metric, links curved and
 * coloured by community, every word labelled.
 *
 * The researcher can zoom, drag and pin words, hover to see a word's
 * neighbours, click to read the segments where it occurs, search, and use
 * the "Style and network" panel (colours, sizes, labels, filters,
 * ForceAtlas2 settings, communities). Positions and style are kept in the
 * analysis (onChange), so a saved analysis reopens as it was left; the
 * exports follow what is on screen.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Graph from 'graphology'
import Sigma from 'sigma'
import EdgeCurveProgram from '@sigma/edge-curve'
import FA2Layout from 'graphology-layout-forceatlas2/worker'
import { toBlob } from '@sigma/export-image'
import type { Settings } from 'sigma/settings'
import type { EdgeDisplayData, NodeDisplayData, PartialButFor } from 'sigma/types'
import { adjustLabels } from '../../../models/label-adjust'
import { toGexf } from '../../../models/network-gexf'
import { t, formatNumber } from '../../../i18n'
import { Icon, faMagnifyingGlass, faPlay, faPause } from '../../Icon'
import {
  adjacency, maxCore, communityColour, cropLabel, edgeAppearance, labelAppearance, visibleWords, withDefaults,
  type FilterMetric, type NetworkStyle
} from './network-style'
import { applyEdits, louvainGraph, partitionModularity, recompute } from './network-communities'
import { StylePanel, type CommunitySummary } from './StylePanel'
import { networkSvg, nodesCsv, toBase64 } from './network-export'

export interface NetworkData {
  version: 1
  nodes: { id: string; frequency: number; degree: number; strength: number; betweenness: number; closeness: number; eigenvector: number; community: number; x: number; y: number; segments: number[] }[]
  edges: { source: string; target: string; weight: number }[]
  segments: { unit: string; text: string }[]
  stats: { nodes: number; edges: number; communities: number; modularity: number; density: number; averageDegree: number; diameter: number }
  diagnostics: { profile: string; selected: { minCooc: number } }
  /** The researcher's style; absent in analyses saved before the panel existed. */
  style?: Partial<NetworkStyle>
}

type NodeAttrs = {
  x: number; y: number; size: number; baseSize: number; label: string; color: string
  labelSize: number; labelWeight: string; labelColor: string; community: number; rank: number; fixed?: boolean
}
type EdgeAttrs = { size: number; color: string; hex: string; alpha: number; weight: number; type: string }

const DARK_BG = '#14181E'

function buildGraph(data: NetworkData): Graph<NodeAttrs, EdgeAttrs> {
  const g = new Graph<NodeAttrs, EdgeAttrs>({ type: 'undirected' })
  for (const n of data.nodes) {
    // The dot is invisible (Gephi-style text network) but keeps a click area.
    g.addNode(n.id, { x: n.x, y: n.y, size: 4, baseSize: 4, label: n.id, color: 'rgba(0,0,0,0)', labelSize: 10, labelWeight: '400', labelColor: '#141414', community: n.community, rank: 0 })
  }
  for (const e of data.edges) {
    if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue
    g.addUndirectedEdge(e.source, e.target, { weight: e.weight, type: 'curve', size: 1, color: '#999', hex: '#999999', alpha: 1 })
  }
  return g
}

type LabelData = PartialButFor<NodeDisplayData, 'x' | 'y' | 'size' | 'label' | 'color'> & { labelSize?: number; baseSize?: number; labelWeight?: string; labelColor?: string; fixed?: boolean }

/** Gephi-style label: centred on the word's position, growing with zoom like the word's dot. */
function drawLabel(ctx: CanvasRenderingContext2D, data: LabelData, settings: Settings): void {
  if (!data.label) return
  const ratio = data.baseSize ? data.size / data.baseSize : 1
  const size = (data.labelSize ?? settings.labelSize) * ratio
  ctx.font = `${data.labelWeight ?? '400'} ${size}px ${settings.labelFont}`
  ctx.fillStyle = data.labelColor ?? '#141414'
  const w = ctx.measureText(data.label).width
  ctx.fillText(data.label, data.x - w / 2, data.y + size / 3)
  if (data.fixed) {
    // Pinned words are underlined, so the researcher sees what the layout will not move.
    ctx.fillRect(data.x - w / 2, data.y + size / 3 + 2, w, Math.max(1, size / 12))
  }
}

function drawHover(ctx: CanvasRenderingContext2D, data: LabelData, settings: Settings): void {
  if (!data.label) return
  const ratio = data.baseSize ? data.size / data.baseSize : 1
  const size = (data.labelSize ?? settings.labelSize) * ratio
  ctx.font = `700 ${size}px ${settings.labelFont}`
  const w = ctx.measureText(data.label).width
  const dark = data.labelColor === '#EDEDED'
  ctx.fillStyle = dark ? 'rgba(20,24,30,0.92)' : 'rgba(255,255,255,0.92)'
  ctx.fillRect(data.x - w / 2 - 4, data.y - size * 0.75, w + 8, size * 1.2)
  ctx.fillStyle = data.labelColor ?? '#141414'
  ctx.fillText(data.label, data.x - w / 2, data.y + size / 3)
}

const fmt = (v: number): string => formatNumber(v, { maximumFractionDigits: Math.abs(v) >= 100 ? 1 : 4 })

/**
 * Frames the whole network in the view using its width as well as its height
 * (sigma fits the larger side into the smaller one, leaving a wide network
 * small in the middle).
 */
function fitView(renderer: Sigma<NodeAttrs, EdgeAttrs>, graph: Graph<NodeAttrs, EdgeAttrs>, animate: boolean): number {
  const camera = renderer.getCamera()
  camera.setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 })
  renderer.refresh()
  const { width, height } = renderer.getDimensions()
  if (!graph.order || !width || !height) return 1
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  graph.forEachNode((_n, a) => {
    const p = renderer.graphToViewport(a)
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y)
  })
  const pad = 40
  const ratio = Math.max((x1 - x0) / (width - 2 * pad), (y1 - y0) / (height - 2 * pad), 0.05)
  const centre = renderer.viewportToFramedGraph({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 })
  const state = { x: centre.x, y: centre.y, ratio, angle: 0 }
  if (animate) void camera.animate(state, { duration: 300 })
  else { camera.setState(state); renderer.refresh() }
  return ratio
}

function fa2Settings(l: NetworkStyle['layout']) {
  return {
    scalingRatio: l.scaling, gravity: l.gravity, strongGravityMode: l.strongGravity, linLogMode: l.linLog,
    outboundAttractionDistribution: l.dissuadeHubs, adjustSizes: l.adjustSizes, slowDown: l.slowDown,
    edgeWeightInfluence: 0.5, barnesHutOptimize: true, barnesHutTheta: 1.2
  }
}

/** The view keeps its own copy of the network: later props are its own saved changes coming back. */
export function NetworkTextView({ data: initial, onChange }: { data: NetworkData; onChange?: (next: NetworkData) => void }) {
  const [data] = useState(initial)
  const box = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma<NodeAttrs, EdgeAttrs> | null>(null)
  const layoutRef = useRef<FA2Layout | null>(null)
  const graph = useMemo(() => buildGraph(data), [data])
  const [style, setStyleState] = useState<NetworkStyle>(() => withDefaults(data.style))
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [hiddenCommunities, setHiddenCommunities] = useState<Set<number>>(new Set())
  const [minWeight, setMinWeight] = useState(1)
  const [query, setQuery] = useState('')
  const [running, setRunning] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  // Zoom in percent of the fitted view (100% = whole network in the frame).
  const fitRatioRef = useRef(1)
  const [zoom, setZoom] = useState(100)
  const [zoomText, setZoomText] = useState('100')
  const maxWeight = useMemo(() => Math.max(1, ...data.edges.map((e) => e.weight)), [data])
  const nodeInfo = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data])
  const adj = useMemo(() => adjacency(data.edges), [data])
  const lg = useMemo(() => louvainGraph(data), [data])
  const words = useWords(data)
  const coreLimit = useMemo(() => maxCore(adj), [adj])

  // ── Communities: the analysis's or recomputed, then the researcher's edits ──
  const base = useMemo(
    () => (style.resolution === null ? new Map(data.nodes.map((n) => [n.id, n.community])) : recompute(lg, style.resolution)),
    [data, lg, style.resolution]
  )
  const comm = useMemo(() => applyEdits(base, style), [base, style.merged, style.moved])
  const editedCommunities = style.resolution !== null || Object.keys(style.merged).length > 0 || Object.keys(style.moved).length > 0
  const modularity = useMemo(() => (editedCommunities ? partitionModularity(lg, comm) : data.stats.modularity), [editedCommunities, lg, comm, data])
  const communities: CommunitySummary[] = useMemo(() => {
    const m = new Map<number, string[]>()
    for (const n of [...data.nodes].sort((a, b) => b.strength - a.strength)) {
      const c = comm.get(n.id)!
      m.set(c, [...(m.get(c) ?? []), n.id])
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([id, words]) => ({ id, words }))
  }, [data, comm])
  const visible = useMemo(() => visibleWords(data.nodes, adj, style.filters), [data, adj, style.filters])

  // ── Saving: positions and style go back to the analysis, a moment after the last change ──
  const styleRef = useRef(style)
  styleRef.current = style
  const commit = (): void => {
    if (!onChange) return
    onChange({
      ...data,
      style: styleRef.current,
      nodes: data.nodes.map((n) => (graph.hasNode(n.id) ? { ...n, x: graph.getNodeAttribute(n.id, 'x'), y: graph.getNodeAttribute(n.id, 'y') } : n))
    })
  }
  const commitRef = useRef(commit)
  commitRef.current = commit
  const timer = useRef<number | undefined>(undefined)
  const setStyle = (next: NetworkStyle): void => {
    setStyleState(next)
    styleRef.current = next
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => commitRef.current(), 500)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])

  // ── Sigma ──
  useEffect(() => {
    if (!box.current) return
    const renderer = new Sigma<NodeAttrs, EdgeAttrs>(graph, box.current, {
      // A saved analysis may open in a tab that is not showing yet (no width): the network is
      // drawn when the tab shows (the ResizeObserver below), instead of failing the window.
      allowInvalidContainer: true,
      defaultEdgeType: 'curve',
      edgeProgramClasses: { curve: EdgeCurveProgram as never },
      labelFont: 'Segoe UI, Arial, sans-serif',
      // Every word is labelled, as in Gephi: tiny for minor words, large for the central ones.
      labelDensity: 10000,
      labelGridCellSize: 1,
      labelRenderedSizeThreshold: 0,
      defaultDrawNodeLabel: drawLabel as never,
      defaultDrawNodeHover: drawHover as never,
      zIndex: true,
      stagePadding: 24
    })
    sigmaRef.current = renderer
    fitRatioRef.current = fitView(renderer, graph, false)
    renderer.getCamera().on('updated', (state) => {
      const pct = Math.round((fitRatioRef.current / state.ratio) * 100)
      setZoom(pct)
      setZoomText(String(pct))
    })

    // Dragging a word moves it (the camera stays still meanwhile).
    let dragged: string | null = null
    let moved = false
    renderer.on('downNode', (e) => { dragged = e.node; moved = false })
    renderer.getMouseCaptor().on('mousemovebody', (e) => {
      if (!dragged) return
      const p = renderer.viewportToGraph(e)
      graph.mergeNodeAttributes(dragged, { x: p.x, y: p.y })
      moved = true
      e.preventSigmaDefault()
      e.original.preventDefault()
      e.original.stopPropagation()
    })
    renderer.getMouseCaptor().on('mouseup', () => {
      if (dragged && moved) commitRef.current()
      dragged = null
    })
    renderer.on('enterNode', (e) => setHovered(e.node))
    renderer.on('leaveNode', () => setHovered(null))
    renderer.on('clickNode', (e) => { if (!moved) setSelected(e.node) })
    renderer.on('clickStage', () => setSelected(null))
    // The drawing follows its area when the side panels open or close (sigma only watches the window).
    const observer = new ResizeObserver(() => { renderer.resize(); fitRatioRef.current = fitView(renderer, graph, false) })
    observer.observe(box.current)
    return () => {
      observer.disconnect()
      layoutRef.current?.kill()
      layoutRef.current = null
      renderer.kill()
      sigmaRef.current = null
    }
  }, [graph])

  // ── Appearance: sizes, labels, colours from the style ──
  useEffect(() => {
    const values = data.nodes.map((n) => n[style.sizeBy])
    const min = Math.min(...values), max = Math.max(...values)
    const ranked = [...data.nodes].sort((a, b) => b[style.sizeBy] - a[style.sizeBy])
    const rank = new Map(ranked.map((n, i) => [n.id, i]))
    const pinned = new Set(style.pinned)
    const plain = style.background === 'dark' ? '#EDEDED' : '#141414'
    for (const n of data.nodes) {
      const c = comm.get(n.id)!
      const la = labelAppearance(style, n[style.sizeBy], min, max)
      graph.mergeNodeAttributes(n.id, {
        label: cropLabel(n.id, style.cropAt), labelSize: la.size, labelWeight: la.weight, community: c, rank: rank.get(n.id)!,
        labelColor: style.labelColor === 'community' ? communityColour(style, c) : plain,
        size: 3 + 4 * Math.sqrt(la.norm), baseSize: 3 + 4 * Math.sqrt(la.norm), fixed: pinned.has(n.id)
      })
    }
    const weights = data.edges.map((e) => e.weight)
    const wMin = Math.min(...weights), wMax = Math.max(...weights)
    graph.forEachEdge((e, a, s, tg) => {
      const nw = wMax > wMin ? (a.weight - wMin) / (wMax - wMin) : 1
      const ap = edgeAppearance(style, communityColour(style, comm.get(s)!), communityColour(style, comm.get(tg)!), nw)
      const m = ap.color.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/)!
      const alpha = Number(m[4])
      // The SVG export needs the plain colour; sigma gets the premultiplied one.
      const hex = '#' + [m[1], m[2], m[3]].map((v) => Math.round(Number(v) / (alpha || 1)).toString(16).padStart(2, '0')).join('')
      graph.mergeEdgeAttributes(e, { color: ap.color, size: ap.size, hex, alpha })
    })
    sigmaRef.current?.refresh()
  }, [graph, data, style, comm])

  // ── Visibility: filters, hidden communities, weak links, hover/selection, search, label count ──
  useEffect(() => {
    const renderer = sigmaRef.current
    if (!renderer) return
    const focus = hovered ?? selected
    const neighbours = focus ? new Set(graph.neighbors(focus)) : null
    const q = query.trim().toLowerCase()
    const shown = (node: string, attrs: NodeAttrs): boolean => visible.has(node) && !hiddenCommunities.has(attrs.community)
    // sigma 3 draws what the reducers return, so they return the whole data with the changes.
    renderer.setSetting('nodeReducer', (node, attrs) => {
      const d = attrs as unknown as Partial<NodeDisplayData>
      if (!shown(node, attrs)) return { ...d, hidden: true }
      if (q && node.toLowerCase().includes(q)) return { ...d, highlighted: true, forceLabel: true, zIndex: 2 }
      if (focus && node !== focus && !neighbours!.has(node)) return { ...d, label: '', zIndex: 0 }
      // Only the focused word's label is forced; its neighbours keep the usual label spacing.
      if (focus && node === focus) return { ...d, forceLabel: true, zIndex: 2, highlighted: true }
      if (style.labelCount > 0 && attrs.rank >= style.labelCount && !(focus && neighbours!.has(node))) return { ...d, label: '' }
      return d
    })
    renderer.setSetting('edgeReducer', (edge, attrs) => {
      const d = attrs as unknown as Partial<EdgeDisplayData>
      if (attrs.weight < minWeight) return { ...d, hidden: true }
      const [s, tg] = graph.extremities(edge)
      if (!shown(s, graph.getNodeAttributes(s)) || !shown(tg, graph.getNodeAttributes(tg))) return { ...d, hidden: true }
      if (focus && s !== focus && tg !== focus) return { ...d, hidden: true }
      return d
    })
  }, [graph, hovered, selected, hiddenCommunities, minWeight, query, visible, style.labelCount])

  // ── Layout: ForceAtlas2 with the panel's settings; a change while it runs restarts it with them ──
  const startLayout = (layout: NetworkStyle['layout']): void => {
    layoutRef.current?.kill()
    layoutRef.current = new FA2Layout(graph, {
      // Pulls by the doubled weight its forces were tuned with in labiia_lex (see the analysis).
      getEdgeWeight: (_e, attrs) => 2 * (attrs as EdgeAttrs).weight,
      settings: fa2Settings(layout)
    })
    layoutRef.current.start()
  }
  const layoutKey = JSON.stringify(style.layout)
  useEffect(() => {
    if (running) startLayout(style.layout)
    // Only a settings change while running restarts; start and stop are handled by the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey])

  const toggleLayout = (): void => {
    if (running) {
      layoutRef.current?.stop()
      setRunning(false)
      commitRef.current()
      return
    }
    startLayout(style.layout)
    setRunning(true)
  }

  /**
   * Label Adjust on the words as drawn: label boxes measured on screen, words
   * pushed apart, the drawing fitted to the frame again, and again (as
   * labiia_lex's rounds), until no label overlaps at the fitted scale.
   * Pinned words do not move.
   */
  const spreadLabels = (): void => {
    const renderer = sigmaRef.current
    if (!renderer) return
    const ctx = document.createElement('canvas').getContext('2d')!
    const ids = graph.nodes()
    for (let round = 0; round < 6; round++) {
      fitRatioRef.current = fitView(renderer, graph, false)
      const pts = ids.map((id) => { const p = renderer.graphToViewport(graph.getNodeAttributes(id)); return [p.x, p.y] })
      const w: number[] = [], h: number[] = []
      for (const id of ids) {
        const a = graph.getNodeAttributes(id)
        // As drawn: sigma scales sizes with the zoom (scaleSize), labels grow with their dot.
        const size = a.labelSize * (renderer.scaleSize(renderer.getNodeDisplayData(id)!.size) / a.baseSize)
        ctx.font = `${a.labelWeight} ${size}px Segoe UI, Arial, sans-serif`
        w.push(a.label ? ctx.measureText(a.label).width + 6 : 0)
        h.push(a.label ? size * 1.15 + 3 : 0)
      }
      const before = pts.map((p) => [...p])
      adjustLabels(pts, w, h, { speed: 1.5, iterations: 300 })
      if (pts.every((p, i) => p[0] === before[i][0] && p[1] === before[i][1])) break
      ids.forEach((id, i) => { if (!graph.getNodeAttribute(id, 'fixed')) graph.mergeNodeAttributes(id, renderer.viewportToGraph({ x: pts[i][0], y: pts[i][1] })) })
    }
    fitRatioRef.current = fitView(renderer, graph, true)
    commitRef.current()
  }

  const recentre = (): void => { if (sigmaRef.current) fitRatioRef.current = fitView(sigmaRef.current, graph, true) }

  /** Zoom to a percentage of the fitted view, keeping the centre of the view. */
  const zoomTo = (pct: number): void => {
    const renderer = sigmaRef.current
    if (!renderer || !Number.isFinite(pct)) return
    const p = Math.min(2000, Math.max(10, pct))
    void renderer.getCamera().animate({ ratio: fitRatioRef.current / (p / 100) }, { duration: 200 })
  }
  const ZOOM_STEPS = [10, 25, 50, 75, 100, 125, 150, 200, 300, 400, 600, 800, 1200, 2000]
  const zoomStep = (dir: 1 | -1): void => {
    const next = dir > 0 ? ZOOM_STEPS.find((z) => z > zoom + 1) : [...ZOOM_STEPS].reverse().find((z) => z < zoom - 1)
    zoomTo(next ?? (dir > 0 ? 2000 : 10))
  }

  // ── Exports, as on screen ──
  const background = style.background === 'dark' ? DARK_BG : '#FFFFFF'
  const isShown = (id: string): boolean => visible.has(id) && !hiddenCommunities.has(comm.get(id)!)
  const exportPng = async (): Promise<void> => {
    const renderer = sigmaRef.current
    if (!renderer) return
    const w = renderer.getContainer().clientWidth, h = renderer.getContainer().clientHeight
    const blob = await toBlob(renderer as unknown as Sigma, { format: 'png', backgroundColor: background, width: w * 3, height: h * 3, cameraState: renderer.getCamera().getState() })
    const buf = new Uint8Array(await blob.arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    void window.api.lexical.saveFile({ name: 'rede_textual.png', mime: 'image/png', data: btoa(bin) })
  }
  const exportSvg = (): void => {
    void window.api.lexical.saveFile({ name: 'rede_textual.svg', mime: 'image/svg+xml', data: toBase64(networkSvg(graph as unknown as Graph, background, isShown)) })
  }
  const exportGexf = (): void => {
    const gexf = toGexf(data, {
      community: (id) => comm.get(id)!,
      colour: (c) => communityColour(style, c),
      names: style.communityNames,
      position: (id) => ({ x: graph.getNodeAttribute(id, 'x'), y: graph.getNodeAttribute(id, 'y') })
    })
    void window.api.lexical.saveFile({ name: 'rede_textual.gexf', mime: 'application/gexf+xml', data: toBase64(gexf) })
  }
  const exportCsv = (): void => {
    void window.api.lexical.saveFile({ name: 'rede_textual_palavras.csv', mime: 'text/csv', data: toBase64(nodesCsv(data.nodes, (id) => comm.get(id)!, style.communityNames)) })
  }

  const metricRange = (key: FilterMetric): [number, number] => {
    const v = data.nodes.map((n) => n[key])
    return [Math.min(...v), Math.max(...v)]
  }

  const info = selected ? nodeInfo.get(selected) : null
  const topNeighbours = useMemo(() => {
    if (!selected || !graph.hasNode(selected)) return []
    return graph.mapEdges(selected, (_e, a, s, tg) => ({ word: s === selected ? tg : s, weight: a.weight })).sort((a, b) => b.weight - a.weight).slice(0, 12)
  }, [selected, graph])
  const communityName = (c: number): string => style.communityNames[c] || t('labiia.lexical.network.community', { n: c + 1 })
  const togglePin = (word: string): void => {
    const pinned = style.pinned.includes(word) ? style.pinned.filter((w) => w !== word) : [...style.pinned, word]
    setStyle({ ...style, pinned })
  }
  const moveWord = (word: string, to: number): void => setStyle({ ...style, moved: { ...style.moved, [word]: to } })

  return (
    <div className="lex-network">
      <div className="lex-figure-tools lex-network-tools">
        <label className="lex-network-search">
          <Icon icon={faMagnifyingGlass} style={{ fontSize: 12 }} />
          <input type="search" value={query} placeholder={t('labiia.lexical.network.search')} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="lex-network-slider" title={t('labiia.lexical.network.minWeightHelp')}>
          <span>{t('labiia.lexical.network.minWeight', { n: minWeight })}</span>
          <input type="range" min={1} max={maxWeight} value={minWeight} onChange={(e) => setMinWeight(Number(e.target.value))} />
        </label>
        <div style={{ flex: 1 }} />
        <button className="secondary lex-small-btn" onClick={toggleLayout} title={t('labiia.lexical.network.layoutHelp')}>
          <Icon icon={running ? faPause : faPlay} style={{ fontSize: 11, marginRight: 4 }} />
          {running ? t('labiia.lexical.network.stopLayout') : t('labiia.lexical.network.runLayout')}
        </button>
        <button className="secondary lex-small-btn" onClick={spreadLabels} title={t('labiia.lexical.network.spreadHelp')}>{t('labiia.lexical.network.spread')}</button>
        <div className="lex-network-zoom" title={t('labiia.lexical.network.zoomHelp')}>
          <button className="secondary lex-small-btn" onClick={() => zoomStep(-1)} aria-label={t('labiia.lexical.network.zoomOut')}>−</button>
          <input
            type="text"
            inputMode="numeric"
            value={`${zoomText}%`}
            aria-label={t('labiia.lexical.network.zoom')}
            onChange={(e) => setZoomText(e.target.value.replace(/[^\d]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') zoomTo(Number(zoomText)) }}
            onBlur={() => zoomTo(Number(zoomText))}
          />
          <button className="secondary lex-small-btn" onClick={() => zoomStep(1)} aria-label={t('labiia.lexical.network.zoomIn')}>+</button>
        </div>
        <button className="secondary lex-small-btn" onClick={recentre}>{t('labiia.lexical.network.recentre')}</button>
        <button className={`lex-small-btn ${panelOpen ? '' : 'secondary'}`} onClick={() => setPanelOpen((o) => !o)}>{t('labiia.lexical.network.style.open')}</button>
        <button className="secondary lex-small-btn" onClick={() => void exportPng()}>PNG</button>
        <button className="secondary lex-small-btn" onClick={exportSvg}>SVG</button>
        {/* i18n-ignore: a file format's name */}
        <button className="secondary lex-small-btn" onClick={exportGexf} title={t('labiia.lexical.network.style.gexfHelp')}>GEXF</button>
        <button className="secondary lex-small-btn" onClick={exportCsv}>CSV</button>
      </div>

      <div className="lex-network-communities">
        {communities.map(({ id: c, words }) => (
          <button
            key={c}
            className={`lex-network-chip${hiddenCommunities.has(c) ? ' off' : ''}`}
            style={{ borderColor: communityColour(style, c), color: hiddenCommunities.has(c) ? 'var(--text-muted)' : communityColour(style, c) }}
            title={words.slice(0, 15).join(', ')}
            onClick={() => setHiddenCommunities((h) => { const n = new Set(h); if (n.has(c)) n.delete(c); else n.add(c); return n })}
          >
            <span className="lex-network-dot" style={{ background: communityColour(style, c) }} />
            {style.communityNames[c] ? style.communityNames[c] : `${communityName(c)} · ${words.slice(0, 3).join(', ')}`}
          </button>
        ))}
      </div>

      <div className="lex-network-body">
        <div ref={box} className="lex-network-canvas" style={{ background }} />
        {info && (
          <aside className="lex-network-panel">
            <div className="lex-network-word" style={{ color: communityColour(style, comm.get(info.id)!) }}>{info.id}</div>
            <table className="lex-network-metrics"><tbody>
              <tr><td>{t('labiia.lexical.frequency')}</td><td>{info.frequency}</td></tr>
              <tr><td>{t('labiia.lexical.network.degree')}</td><td>{info.degree}</td></tr>
              <tr><td>{t('labiia.lexical.network.strength')}</td><td>{info.strength}</td></tr>
              <tr><td>{t('labiia.lexical.network.betweenness')}</td><td>{fmt(info.betweenness)}</td></tr>
              <tr><td>{t('labiia.lexical.network.closeness')}</td><td>{fmt(info.closeness)}</td></tr>
              <tr><td>{t('labiia.lexical.network.eigenvector')}</td><td>{fmt(info.eigenvector)}</td></tr>
            </tbody></table>
            <label className="lex-network-field">
              <span>{t('labiia.lexical.network.communityLabel')}</span>
              <select value={comm.get(info.id)} onChange={(e) => moveWord(info.id, Number(e.target.value))} title={t('labiia.lexical.network.style.moveHelp')}>
                {communities.map((c) => <option key={c.id} value={c.id}>{communityName(c.id)}</option>)}
              </select>
            </label>
            <button className="secondary lex-small-btn" onClick={() => togglePin(info.id)}>
              {style.pinned.includes(info.id) ? t('labiia.lexical.network.style.unpin') : t('labiia.lexical.network.style.pin')}
            </button>
            <div className="lex-advanced-title">{t('labiia.lexical.network.neighbours')}</div>
            <div className="lex-network-neighbours">
              {topNeighbours.map((nb) => <button key={nb.word} className="lex-network-chip" onClick={() => setSelected(nb.word)}>{nb.word} <span className="lex-muted">{nb.weight}</span></button>)}
            </div>
            <div className="lex-advanced-title">{t('labiia.lexical.network.segments', { count: info.segments.length })}</div>
            <div className="lex-network-segments">
              {info.segments.map((k) => <Segment key={k} unit={data.segments[k].unit} text={data.segments[k].text} word={info.id} />)}
            </div>
          </aside>
        )}
        {panelOpen && (
          <StylePanel
            style={style}
            onStyle={setStyle}
            communities={communities}
            modularity={modularity}
            words={words}
            metricRange={metricRange}
            visibleCount={visible.size}
            totalCount={data.nodes.length}
            maxCore={coreLimit}
          />
        )}
      </div>
      <div className="lex-muted lex-network-stats">
        {t('labiia.lexical.network.stats', { nodes: data.stats.nodes, edges: data.stats.edges, communities: communities.length, modularity: modularity.toFixed(3), density: data.stats.density.toFixed(3), diameter: data.stats.diameter })}
        {style.resolution !== null && ` · ${t('labiia.lexical.network.style.resolutionUsed', { value: formatNumber(style.resolution) })}`}
      </div>
    </div>
  )
}

/** Words for the neighbourhood filter, strongest first. */
function useWords(data: NetworkData): string[] {
  return useMemo(() => [...data.nodes].sort((a, b) => b.strength - a.strength).map((n) => n.id), [data])
}

/** A text segment with the word marked wherever it occurs as a whole word. */
function Segment({ unit, text, word }: { unit: string; text: string; word: string }) {
  const parts = text.split(new RegExp(`(?<![\\p{L}\\p{N}_])(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\p{L}\\p{N}_])`, 'giu'))
  return (
    <div className="lex-network-segment">
      <div className="lex-muted">{unit}</div>
      <div>{parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : p))}</div>
    </div>
  )
}
