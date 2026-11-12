import { describe, it, expect } from 'vitest'
import {
  adjacency, communityColour, cropLabel, defaultStyle, edgeAppearance, egoNetwork, kCore, labelAppearance,
  largestComponent, maxCore, premultiplied, visibleWords, withDefaults
} from '../../src/renderer/components/Lexical/network/network-style'
import { applyEdits, bySize, louvainGraph, partitionModularity, recompute } from '../../src/renderer/components/Lexical/network/network-communities'
import { toGexf } from '../../src/renderer/models/network-gexf'
import { bestPartition } from '../../src/helper/lexical/analyses/network-text'
import { COMMUNITY_PALETTE } from '../../src/renderer/models/lexical-api'

// Two triangles (a-b-c, d-e-f) joined by c-d, plus a separate pair g-h.
const edges = [
  { source: 'a', target: 'b', weight: 3 }, { source: 'b', target: 'c', weight: 3 }, { source: 'a', target: 'c', weight: 3 },
  { source: 'd', target: 'e', weight: 3 }, { source: 'e', target: 'f', weight: 3 }, { source: 'd', target: 'f', weight: 3 },
  { source: 'c', target: 'd', weight: 1 }, { source: 'g', target: 'h', weight: 1 }
]
const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const metric = (i: number) => ({ strength: i, frequency: 10 * i, degree: i, betweenness: 0, closeness: 0, eigenvector: 0 })
const nodes = ids.map((id, i) => ({ id, ...metric(i), community: i < 3 ? 0 : i < 6 ? 1 : 2, x: i, y: 0, segments: [] }))
const adj = adjacency(edges)

describe('text network style', () => {
  it('keeps the labiia_lex look when a saved analysis has no style', () => {
    const s = withDefaults(undefined)
    expect(s).toEqual(defaultStyle())
    expect(communityColour(s, 0)).toBe(COMMUNITY_PALETTE[0])
    // A style saved by an older version keeps its settings and gains the new ones.
    expect(withDefaults({ palette: 'pastel' }).filters.kcore).toBe(0)
  })

  it('lets a chosen colour override the palette for one community only', () => {
    const s = { ...defaultStyle(), communityColors: { 1: '#123456' } }
    expect(communityColour(s, 1)).toBe('#123456')
    expect(communityColour(s, 0)).toBe(COMMUNITY_PALETTE[0])
  })

  it('premultiplies translucent link colours, so purple stays purple on the canvas', () => {
    expect(premultiplied('#8E24AA', 0.5)).toBe('rgba(71,18,85,0.500)')
    const s = { ...defaultStyle(), edgeColor: 'gray' as const }
    expect(edgeAppearance(s, '#FF0000', '#00FF00', 1).color).toMatch(/^rgba\(/)
    expect(edgeAppearance({ ...defaultStyle(), edgeWidth: 2 }, '#FF0000', '#00FF00', 1).size).toBeCloseTo(2 * 1.8)
  })

  it('sizes labels by the square root of the chosen measure, bold for the largest', () => {
    const s = defaultStyle()
    expect(labelAppearance(s, 0, 0, 100).size).toBe(s.labelMin)
    expect(labelAppearance(s, 100, 0, 100)).toMatchObject({ size: s.labelMax, weight: '700' })
    expect(labelAppearance(s, 25, 0, 100).size).toBeCloseTo(s.labelMin + (s.labelMax - s.labelMin) * 0.5)
  })

  it('cuts long words only when asked', () => {
    expect(cropLabel('universidades', 0)).toBe('universidades')
    expect(cropLabel('universidades', 5)).toBe('unive…')
  })

  it('filters by a range of a measure, a neighbourhood, the k-core and the largest group', () => {
    const f = defaultStyle().filters
    expect(visibleWords(nodes, adj, { ...f, metric: { key: 'frequency', min: 20, max: 40 } })).toEqual(new Set(['c', 'd', 'e']))
    expect(egoNetwork(adj, 'a', 1)).toEqual(new Set(['a', 'b', 'c']))
    expect(egoNetwork(adj, 'a', 2)).toEqual(new Set(['a', 'b', 'c', 'd']))
    // Every word of the triangles has at least two links among them; g and h have one.
    expect(kCore(adj, 2)).toEqual(new Set(['a', 'b', 'c', 'd', 'e', 'f']))
    // No word has three links inside any group, so the core slider stops at 2.
    expect(maxCore(adj)).toBe(2)
    expect(largestComponent(adj, new Set(ids))).toEqual(new Set(['a', 'b', 'c', 'd', 'e', 'f']))
    expect(visibleWords(nodes, adj, { ...f, ego: { word: 'g', depth: 1 }, largestComponent: true })).toEqual(new Set(['g', 'h']))
  })
})

describe('text network communities in the window', () => {
  const g = louvainGraph({ nodes, edges })

  it('recomputes the same communities as the analysis at the same resolution and seed', () => {
    expect(recompute(g, 1)).toEqual(bySize(bestPartition(g, 1, 42)))
    const groups = new Map<number, string[]>()
    for (const [u, c] of recompute(g, 1)) groups.set(c, [...(groups.get(c) ?? []), u])
    expect([...groups.values()].map((w) => w.join('')).sort()).toEqual(['abc', 'def', 'gh'])
  })

  it('applies merges and moved words, and the modularity follows the edited partition', () => {
    const base = new Map(nodes.map((n) => [n.id, n.community]))
    const merged = applyEdits(base, { merged: { 1: 0 }, moved: {} })
    expect(merged.get('e')).toBe(0)
    const moved = applyEdits(base, { merged: {}, moved: { c: 1 } })
    expect(moved.get('c')).toBe(1)
    expect(partitionModularity(g, merged)).toBeLessThan(partitionModularity(g, base))
  })

  it('exports GEXF with the community names and colours shown', () => {
    const gexf = toGexf({ nodes, edges }, { community: () => 0, colour: () => '#102030', names: { 0: 'Educação' } })
    expect(gexf).toContain('value="Educação"')
    expect(gexf).toContain('<viz:color r="16" g="32" b="48"/>')
  })
})
