import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { Lexicon } from '../../src/helper/lexical/corpus/lexicon'
import type { PreparedCorpus } from '../../src/helper/lexical/corpus/prepare'
import { networkText, cooccurrences, bestPartition } from '../../src/helper/lexical/analyses/network-text'
import { Graph } from '../../src/helper/lexical/analyses/graph'

const lex = new Lexicon('pt', join(__dirname, '..', '..', 'resources', 'lexical'))

/** A prepared corpus from segments written as plain words; every word active and kept. */
function corpus(segments: string[]): PreparedCorpus {
  const forms: string[] = []
  const index = new Map<string, number>()
  const freq: number[] = []
  const tokens: number[] = []
  const starts: number[] = []
  for (const s of segments) {
    starts.push(tokens.length)
    for (const w of s.split(' ')) {
      if (!index.has(w)) { index.set(w, forms.length); forms.push(w); freq.push(0) }
      freq[index.get(w)!]++
      tokens.push(index.get(w)!)
    }
  }
  starts.push(tokens.length)
  return {
    version: 0, language: 'pt', uceSize: 40,
    units: [{ id: 'd', name: 'Documento', variables: [] }],
    uceUnit: new Uint32Array(segments.length), uceNewText: new Uint8Array(segments.length), uceText: segments,
    uceStart: Uint32Array.from(starts), tokens: Uint32Array.from(tokens), tokenKept: new Uint8Array(tokens.length).fill(1),
    forms, formFreq: Uint32Array.from(freq), formLemma: Uint32Array.from(forms.map((_f, i) => i)), formGram: forms.map(() => 'nom'),
    formAct: new Uint8Array(forms.length).fill(1), lemmas: forms, lemmaFreq: Uint32Array.from(freq), lemmaGram: forms.map(() => 'nom'),
    lemmaAct: new Uint8Array(forms.length).fill(1),
    stats: { units: 1, segments: segments.length, occurrences: tokens.length, forms: forms.length, lemmas: forms.length, hapax: 0 }
  }
}

const manual = { autoTune: false, minFreq: 1, minCooc: 1, maxNodes: 300, maxTree: false, resolution: 1, iterations: 200, scaling: 10, gravity: 1, normalizeCentralities: false }

describe('text network', () => {
  it('counts each pair of nearby words once per occurrence, inside a segment and within five words', () => {
    const c = corpus(['saúde escola', 'saúde escola trabalho', 'cidade a b c d e f escola'])
    const vocab = ['cidade', 'escola', 'saúde', 'trabalho']
    const counts = cooccurrences(c, vocab)
    const at = (u: string, v: string): number => { const i = vocab.indexOf(u), j = vocab.indexOf(v); return counts.get(Math.min(i, j) * vocab.length + Math.max(i, j)) ?? 0 }
    expect(at('saúde', 'escola')).toBe(2)
    expect(at('escola', 'trabalho')).toBe(1)
    // "a".."f" are not in the vocabulary, so they do not count toward the window.
    expect(at('cidade', 'escola')).toBe(1)
    expect(at('saúde', 'cidade')).toBe(0)
  })

  it('separates two groups of words that only occur among themselves', () => {
    const groupA = Array(6).fill('saúde hospital médico enfermeira')
    const groupB = Array(6).fill('escola professor aluno sala')
    const net = networkText(corpus([...groupA, ...groupB, 'saúde escola']), lex, manual)!
    const com = new Map(net.nodes.map((n) => [n.id, n.community]))
    expect(com.get('hospital')).toBe(com.get('médico'))
    expect(com.get('professor')).toBe(com.get('aluno'))
    expect(com.get('hospital')).not.toBe(com.get('professor'))
    expect(net.stats.communities).toBe(2)
    expect(net.stats.modularity).toBeGreaterThan(0.3)
  })

  it('reads 1 ÷ weight as distance: a strongly linked bridge word is the most between', () => {
    const net = networkText(corpus([
      ...Array(5).fill('ponte norte'), ...Array(5).fill('ponte sul'), 'norte leste', 'sul oeste'
    ]), lex, manual)!
    const btw = new Map(net.nodes.map((n) => [n.id, n.betweenness]))
    expect(btw.get('ponte')).toBeGreaterThan(btw.get('norte')!)
    expect(btw.get('leste')).toBe(0)
  })

  it('keeps only a maximum spanning tree when asked (manual mode)', () => {
    const net = networkText(corpus(Array(3).fill('saúde escola trabalho cidade renda')), lex, { ...manual, maxTree: true })!
    expect(net.edges.length).toBe(net.nodes.length - 1)
  })

  it('gives the same network, communities and positions for the same corpus', () => {
    const segs = ['saúde hospital médico', 'escola professor aluno', 'saúde escola', 'médico professor cidade', 'cidade renda trabalho']
    const a = networkText(corpus(segs), lex, manual)!
    const b = networkText(corpus(segs), lex, manual)!
    expect(b.nodes).toEqual(a.nodes)
    expect(b.edges).toEqual(a.edges)
  })

  it('uses real co-occurrence counts in automatic mode: a small corpus links words that co-occur once', () => {
    const net = networkText(corpus(['saúde escola trabalho', 'cidade renda saúde']), lex, { ...manual, autoTune: true })!
    expect(net.diagnostics.profile).toBe('very_small')
    expect(net.diagnostics.selected.minCooc).toBe(1)
    expect(net.edges.every((e) => e.weight === 1)).toBe(true)
  })

  it('numbers python-louvain communities the same way for the same seed', () => {
    const g = new Graph<string>()
    const ring = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    ring.forEach((u, i) => g.addEdge(u, ring[(i + 1) % ring.length], { weight: 1 + (i % 3) }))
    expect([...bestPartition(g, 1, 42)]).toEqual([...bestPartition(g, 1, 42)])
  })
})
