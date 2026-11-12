// Same corpus, same network: compares the text network with a dump of
// labiia_lex's own pipeline (vocabulary, links, balancing, metrics, Louvain)
// on a folder of texts. Skipped unless NET_PARITY_DIR is set.
//
//   NET_PARITY_DIR  folder of .txt/.md files (the corpus)
//   NET_PARITY_REF  JSON written by labiia_lex's NetworkTextAnalysis steps:
//                   nodes (id, degree, weighted_degree, eigenvector,
//                   community, betweenness_inv, closeness_inv), edges
//                   [u, v, weight], modularity — with labiia_lex's doubled
//                   weights and 1/weight distances.
//   NET_PARITY_PARAMS  JSON options merged over the automatic defaults
//
// labiia_lex doubles every weight, so its weights, strengths and closeness
// (its distances 1/(2w) are half ours) are twice ours; degree, eigenvector, betweenness,
// communities and modularity do not change with that scale.
import { it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const dir = process.env.NET_PARITY_DIR

/** A prepared corpus made of labiia_lex's segments ({ uces: string[], formes: { form: [freq, act, lemma] } }). */
function corpusFromDump(path: string): import('../../src/helper/lexical/corpus/prepare').PreparedCorpus {
  const d = JSON.parse(readFileSync(path, 'utf-8')) as { uces: string[]; formes: Record<string, [number, number, string]> }
  const forms = Object.keys(d.formes)
  const lemmas = [...new Set(forms.map((f) => d.formes[f][2]))]
  const lemmaIndex = new Map(lemmas.map((l, i) => [l, i]))
  const formIndex = new Map(forms.map((f, i) => [f, i]))
  const tokens: number[] = []
  const starts: number[] = []
  for (const u of d.uces) {
    starts.push(tokens.length)
    for (const w of u.split(/\s+/).filter(Boolean)) {
      if (!formIndex.has(w)) { formIndex.set(w, forms.length); forms.push(w); d.formes[w] = [0, 2, w]; if (!lemmaIndex.has(w)) { lemmaIndex.set(w, lemmas.length); lemmas.push(w) } }
      tokens.push(formIndex.get(w)!)
    }
  }
  starts.push(tokens.length)
  return {
    version: 0, language: 'pt', uceSize: 40,
    units: [{ id: 'all', name: 'all', variables: [] }],
    uceUnit: new Uint32Array(d.uces.length), uceNewText: new Uint8Array(d.uces.length), uceText: d.uces,
    uceStart: Uint32Array.from(starts), tokens: Uint32Array.from(tokens), tokenKept: new Uint8Array(tokens.length).fill(1),
    forms, formFreq: Uint32Array.from(forms.map((f) => d.formes[f][0])), formLemma: Uint32Array.from(forms.map((f) => lemmaIndex.get(d.formes[f][2])!)),
    formGram: forms.map(() => ''), formAct: Uint8Array.from(forms.map((f) => d.formes[f][1])),
    lemmas, lemmaFreq: new Uint32Array(lemmas.length), lemmaGram: lemmas.map(() => ''), lemmaAct: new Uint8Array(lemmas.length),
    stats: { units: 1, segments: d.uces.length, occurrences: tokens.length, forms: forms.length, lemmas: lemmas.length, hapax: 0 }
  }
}

it.skipIf(!dir)('text network matches labiia_lex on the reference corpus', async () => {
  const { Lexicon } = await import('../../src/helper/lexical/corpus/lexicon')
  const { prepareCorpus, sortByDocumentName } = await import('../../src/helper/lexical/corpus/prepare')
  const { networkText } = await import('../../src/helper/lexical/analyses/network-text')
  const RES = join(__dirname, '..', '..', 'resources', 'lexical')
  const lex = new Lexicon('pt', RES)
  const units = sortByDocumentName(
    readdirSync(dir!).filter((f) => /\.(txt|md)$/i.test(f)).map((f) => ({ id: f, name: f, text: readFileSync(join(dir!, f), 'utf-8').replace(/^﻿/, '') }))
  )
  // With NET_PARITY_CORPUS (labiia_lex's own segments and word table), only the network steps are compared.
  const c = process.env.NET_PARITY_CORPUS ? corpusFromDump(process.env.NET_PARITY_CORPUS) : prepareCorpus(units, lex, { language: 'pt', uceSize: 40, segmentCount: 'content' })
  const t0 = Date.now()
  const res = networkText(c, lex, {
    autoTune: true, minFreq: 3, minCooc: 1, maxNodes: 300, maxTree: false, resolution: 1, iterations: 3000, scaling: 50, gravity: 0.8, normalizeCentralities: false,
    ...JSON.parse(process.env.NET_PARITY_PARAMS ?? '{}')
  })!
  console.log('network built in', Date.now() - t0, 'ms', res.stats, res.diagnostics)
  const ref = JSON.parse(readFileSync(process.env.NET_PARITY_REF!, 'utf-8'))

  const ours = new Map(res.nodes.map((n) => [n.id, n]))
  const refIds = ref.nodes.map((n: { id: string }) => n.id)
  const missing = refIds.filter((id: string) => !ours.has(id))
  const extra = res.nodes.map((n) => n.id).filter((id) => !refIds.includes(id))
  console.log('nodes', res.nodes.length, 'ref', refIds.length, 'missing', missing.slice(0, 20), 'extra', extra.slice(0, 20))
  expect(missing).toEqual([])
  expect(extra).toEqual([])

  const key = (u: string, v: string): string => (u < v ? `${u}|${v}` : `${v}|${u}`)
  const ourEdges = new Map(res.edges.map((e) => [key(e.source, e.target), e.weight]))
  const badEdges = (ref.edges as [string, string, number][]).filter(([u, v, w]) => ourEdges.get(key(u, v)) !== w / 2)
  console.log('edges', res.edges.length, 'ref', ref.edges.length, 'different', badEdges.slice(0, 10))
  expect(res.edges.length).toBe(ref.edges.length)
  expect(badEdges).toEqual([])

  const close = (a: number, b: number, tol = 1e-6): boolean => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))
  const report: Record<string, string[]> = { degree: [], strength: [], eigenvector: [], betweenness: [], closeness: [] }
  for (const r of ref.nodes) {
    const n = ours.get(r.id)!
    if (n.degree !== r.degree) report.degree.push(r.id)
    if (n.strength * 2 !== r.weighted_degree) report.strength.push(r.id)
    if (!close(n.eigenvector, r.eigenvector)) report.eigenvector.push(`${r.id} ${n.eigenvector} ${r.eigenvector}`)
    if (!close(n.betweenness, r.betweenness_inv)) report.betweenness.push(`${r.id} ${n.betweenness} ${r.betweenness_inv}`)
    if (!close(2 * n.closeness, r.closeness_inv)) report.closeness.push(`${r.id} ${2 * n.closeness} ${r.closeness_inv}`)
  }
  console.log(Object.fromEntries(Object.entries(report).map(([k, v]) => [k, `${v.length} ${v.slice(0, 3).join('; ')}`])))
  for (const v of Object.values(report)) expect(v).toEqual([])

  // Same partition, whatever the community numbers.
  const groups = (pairs: [string, number][]): string[] => {
    const m = new Map<number, string[]>()
    for (const [id, c] of pairs) m.set(c, [...(m.get(c) ?? []), id])
    return [...m.values()].map((g) => g.sort().join(',')).sort()
  }
  expect(groups(res.nodes.map((n) => [n.id, n.community]))).toEqual(groups(ref.nodes.map((n: { id: string; community: number }) => [n.id, n.community])))
  expect(close(res.stats.modularity, ref.modularity, 1e-9)).toBe(true)
  expect(res.stats.diameter).toBe(ref.diameter)
}, 600_000)
