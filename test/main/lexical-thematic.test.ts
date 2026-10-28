import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Graph, louvainCommunities, pagerank, betweennessCentrality } from '../../src/main/lexical/analyses/graph'
import { PyRandom } from '../../src/main/lexical/plot/random'

// Reference values computed by networkx 3.6.1 on labiia_lex's own thematic map network.
const ref = JSON.parse(readFileSync(join(__dirname, '../fixtures/thematic-graph.json'), 'utf-8')) as {
  edges: [string, string, number][]
  'louvain_0.5': string[][]
  'louvain_1.0': string[][]
  pagerank: Record<string, number>
  betweenness: Record<string, number>
}

function build(): Graph<string> {
  const g = new Graph<string>()
  for (const [a, b, w] of ref.edges) g.addEdge(a, b, { weight: w })
  return g
}

describe('Python random', () => {
  it('draws the same numbers as random.Random(42)', () => {
    const r = new PyRandom(42)
    expect([r.getrandbits(32), r.getrandbits(32), r.getrandbits(32)]).toEqual([2746317213, 478163327, 107420369])
    const x = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    new PyRandom(42).shuffle(x)
    expect(x).toEqual([7, 3, 2, 8, 5, 6, 9, 4, 0, 1])
  })
})

describe('thematic map network', () => {
  it('finds the same Louvain communities as networkx with the same seed', () => {
    for (const res of [0.5, 1.0]) {
      const got = louvainCommunities(build(), res, 42).map((c) => [...c].sort())
      expect(got).toEqual(ref[`louvain_${res.toFixed(1)}` as 'louvain_0.5'])
    }
  })

  it('matches networkx PageRank and betweenness', () => {
    const pr = pagerank(build())
    for (const [k, v] of Object.entries(ref.pagerank)) expect(pr.get(k)).toBeCloseTo(v, 9)
    const bc = betweennessCentrality(build())
    for (const [k, v] of Object.entries(ref.betweenness)) expect(bc.get(k)).toBeCloseTo(v, 9)
  })
})

describe('thematic map themes', () => {
  it('ranks ties by their average position, as R rank()', async () => {
    const { averageRank } = await import('../../src/main/lexical/analyses/thematic-map')
    expect(averageRank([3, 1, 3, 2])).toEqual([3.5, 1, 3.5, 2])
  })

  it('places each theme in the quadrant of its centrality and density ranks', async () => {
    const { thematicMap } = await import('../../src/main/lexical/analyses/thematic-map')
    const { Lexicon } = await import('../../src/main/lexical/corpus/lexicon')
    const { prepareCorpus } = await import('../../src/main/lexical/corpus/prepare')
    const RES = join(__dirname, '..', '..', 'resources', 'lexical')
    const pt = new Lexicon('pt', RES)
    const text = [
      'A escola pública precisa de professores e de merenda escolar. ',
      'O hospital público precisa de médicos e de remédios. ',
      'A escola e o hospital dependem do orçamento municipal. '
    ].join('').repeat(30)
    const c = prepareCorpus([{ id: 'a', name: 'A', text }, { id: 'b', name: 'B', text }], pt, { language: 'pt', uceSize: 40 })
    const r = thematicMap(c, pt, { minFreq: 2, maxFeatures: 300, topEdges: 160, maxNodes: 120, minCooc: 2, useLemmas: true, resolution: 0.5, labelWords: 2, labelAlpha: 0.5, minThemeFreq: 5 })
    if ('error' in r) throw new Error(r.error)
    const mc = r.themes.reduce((s, t) => s + t.rank_centrality, 0) / r.themes.length
    const md = r.themes.reduce((s, t) => s + t.rank_density, 0) / r.themes.length
    for (const t of r.themes) {
      const expected = t.rank_centrality >= mc ? (t.rank_density >= md ? 'Temas motores' : 'Temas básicos') : (t.rank_density >= md ? 'Temas especializados' : 'Temas periféricos')
      expect(t.quadrant).toBe(expected)
      expect(t.label.split(' / ').length).toBeLessThanOrEqual(2)
    }
    expect(r.strategic.bubbles).toHaveLength(r.themes.length)
  })
})
