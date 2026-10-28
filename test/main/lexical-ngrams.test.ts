import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { RandomState } from '../../src/main/lexical/plot/random'
import { ggplotHue } from '../../src/main/lexical/plot/colors'
import { springLayout, componentLayout, connectedComponents } from '../../src/main/lexical/plot/spring-layout'
import { Lexicon } from '../../src/main/lexical/corpus/lexicon'
import { prepareCorpus } from '../../src/main/lexical/corpus/prepare'
import { contentTokensByUnit, countNgrams, ngramNetwork } from '../../src/main/lexical/analyses/ngrams'

// Bigram and trigram networks must count like labiia_lex (content words in
// reading order, per text) and be laid out with the same algorithm and
// random numbers as its networkx layout, so the same seed gives its picture.

describe('numpy-compatible random numbers', () => {
  it('matches np.random.RandomState(42).rand()', () => {
    // Values printed by numpy 2.4: RandomState(42).rand(2, 2).
    const r = new RandomState(42)
    expect([r.random(), r.random(), r.random(), r.random()]).toEqual([
      0.3745401188473625, 0.9507143064099162, 0.7319939418114051, 0.5986584841970366
    ])
  })
})

describe('colours', () => {
  it('gives labiia_lex ggplot_hue colours', () => {
    expect(ggplotHue(1)).toEqual(['#FF0076'])
    expect(ggplotHue(3)).toEqual(['#FF0076', '#00B800', '#00B5FF'])
  })
})

describe('layout', () => {
  it('is deterministic and scaled to the requested size', () => {
    const nodes = ['a', 'b', 'c', 'd']
    const adj = (i: number, j: number) => (Math.abs(i - j) === 1 ? 1 : 0)
    const p1 = springLayout(nodes, adj, { k: 1.65, iterations: 300, scale: 3.2, seed: 42 })
    const p2 = springLayout(nodes, adj, { k: 1.65, iterations: 300, scale: 3.2, seed: 42 })
    expect([...p1.values()]).toEqual([...p2.values()])
    const maxAbs = Math.max(...[...p1.values()].flat().map(Math.abs))
    expect(maxAbs).toBeCloseTo(3.2, 10)
  })

  it('places separate groups apart, the largest first', () => {
    const edges = [
      { source: 'x', target: 'y', weight: 2 },
      { source: 'a', target: 'b', weight: 3 },
      { source: 'b', target: 'c', weight: 1 }
    ]
    const nodes = ['x', 'y', 'a', 'b', 'c']
    expect(connectedComponents(nodes, edges).map((g) => g.sort())).toEqual([['x', 'y'], ['a', 'b', 'c']])
    const pos = componentLayout(nodes, edges)
    // The three-word group starts at x = 0; the pair is placed after it on the same row.
    expect(Math.min(pos.get('a')![0], pos.get('b')![0], pos.get('c')![0])).toBeCloseTo(0, 10)
    expect(Math.min(pos.get('x')![0], pos.get('y')![0])).toBeGreaterThan(Math.max(pos.get('a')![0], pos.get('b')![0], pos.get('c')![0]))
  })
})

describe('n-grams', () => {
  const lex = new Lexicon('pt', join(__dirname, '..', '..', 'resources', 'lexical'))
  const corpus = prepareCorpus([
    { id: '1', name: 'A', text: 'A democracia digital avança. A democracia digital exige participação social. Né, a gente acha.' },
    { id: '2', name: 'B', text: 'Participação social e democracia digital.' }
  ], lex, { language: 'pt', uceSize: 40 })

  it('keeps content words in reading order, per text', () => {
    const tokens = contentTokensByUnit(corpus, lex)
    expect(tokens[0]).toEqual(['democracia', 'digital', 'avança', 'democracia', 'digital', 'exige', 'participação', 'social', 'acha'])
    expect(tokens[1]).toEqual(['participação', 'social', 'democracia', 'digital'])
  })

  it('counts pairs within each text only, most frequent first', () => {
    const rows = countNgrams(contentTokensByUnit(corpus, lex), 2)
    expect(rows[0]).toEqual({ words: ['democracia', 'digital'], frequency: 3 })
    expect(rows[1]).toEqual({ words: ['participação', 'social'], frequency: 2 })
    // "social democracia" (end of text 1 → start of text 2) must not exist.
    expect(rows.find((r) => r.words.join(' ') === 'social participação')).toBeUndefined()
  })

  it('builds the network of frequent pairs and refuses when none reaches the minimum', () => {
    const net = ngramNetwork(corpus, lex, { n: 2, minFreq: 2, topEdges: 120, title: 't' })!
    expect(net.kept.map((r) => r.words.join(' '))).toEqual(['democracia digital', 'participação social'])
    expect(net.figure.nodes.map((n) => n.label)).toEqual(['democracia', 'digital', 'participação', 'social'])
    expect(net.figure.nodes.every((n) => n.font !== null)).toBe(true)
    expect(ngramNetwork(corpus, lex, { n: 3, minFreq: 5, topEdges: 120, title: 't' })).toBeNull()
  })

  it('adds a trigram as two edges, summing weights', () => {
    const net = ngramNetwork(corpus, lex, { n: 3, minFreq: 1, topEdges: 120, title: 't' })!
    expect(net.kept[0]).toEqual({ words: ['democracia', 'digital', 'avança'], frequency: 1 })
    expect(net.allBigrams[0].frequency).toBe(3)
  })
})

describe('word tree', () => {
  const lex = new Lexicon('pt', join(__dirname, '..', '..', 'resources', 'lexical'))
  const text = Array.from({ length: 4 }, () => 'A democracia digital exige participação social.').join(' ') + ' Participação popular amplia a democracia.'
  const corpus = prepareCorpus([{ id: '1', name: 'A', text }], lex, { language: 'pt', uceSize: 40 })

  it('branches left and right of the central word, counted per occurrence', async () => {
    const { wordTree } = await import('../../src/main/lexical/analyses/word-tree')
    const r = wordTree(corpus, lex, { keyword: 'participação', minFreq: 1, maxDepth: 2, minBranchFreq: 1, topBranches: 120, useLemmas: true, activeOnly: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.root).toBe('participação')
    expect(r.rootFrequency).toBe(5)
    const branch = (side: string, child: string) => r.rows.find((x) => x[0] === side && x[3] === child)?.[6]
    expect(branch('left', 'exigir')).toBe('4')
    expect(branch('right', 'social')).toBe('4')
    expect(branch('right', 'popular')).toBe('1')
    expect(r.figure.labels.at(-1)).toMatchObject({ text: 'participação', bold: true, size: 26 })
  })

  it('says when the central word is not in the segments', async () => {
    const { wordTree } = await import('../../src/main/lexical/analyses/word-tree')
    expect(wordTree(corpus, lex, { keyword: 'inexistente', minFreq: 1, maxDepth: 2, minBranchFreq: 1, topBranches: 120, useLemmas: true, activeOnly: true }))
      .toEqual({ ok: false, error: 'keyword-not-found', keyword: 'inexistente' })
  })
})

describe('YAKE', () => {
  it('scores like the yake library (0.7.3, one sentence, default window and threshold)', async () => {
    const { extractKeywords, yakeStopwords } = await import('../../src/main/lexical/analyses/yake')
    const text = 'a democracia digital exige participação social e a participação social fortalece a democracia digital no brasil enquanto a tecnologia muda a política e a política digital muda a democracia'
    const res = join(__dirname, '..', '..', 'resources', 'lexical')
    const got = extractKeywords([text.split(' ')], yakeStopwords('pt', res), { n: 3, windowSize: 1, dedupLim: 0.9, top: 8 })
    // Printed by yake 0.7.3: KeywordExtractor(lan='pt', n=3, top=8).extract_keywords(text).
    const expected: [string, number][] = [
      ['democracia digital exige', 0.000825276238124], ['exige participação social', 0.000943894602498],
      ['participação social fortalece', 0.000943894602498], ['política digital muda', 0.00105392584143],
      ['digital exige participação', 0.00109546982993], ['democracia digital', 0.00406866450661],
      ['participação social', 0.00465053369332], ['muda a democracia', 0.00702289973599]
    ]
    expect(got.map((g) => g[0])).toEqual(expected.map((e) => e[0]))
    got.forEach((g, i) => expect(g[1]).toBeCloseTo(expected[i][1], 12))
  })

  it('leaves out fillers and counts real occurrences', async () => {
    const { isNoiseKeyphrase } = await import('../../src/main/lexical/analyses/yake')
    const lex = new Lexicon('pt', join(__dirname, '..', '..', 'resources', 'lexical'))
    expect(isNoiseKeyphrase('a gente', lex)).toBe(true)
    expect(isNoiseKeyphrase('né', lex)).toBe(true)
    expect(isNoiseKeyphrase('entrevistador', lex)).toBe(true)
    expect(isNoiseKeyphrase('democracia digital', lex)).toBe(false)
  })
})

describe('keyword associations', () => {
  it('computes Dunning log-likelihood and ranks attracted collocates like labiia_lex', async () => {
    const { dunningLogLikelihood, rankCollocates, parseFocalTerms } = await import('../../src/main/lexical/analyses/keyword-associations')
    // Values printed by labiia_lex's dunning_log_likelihood and rank_collocates.
    expect(dunningLogLikelihood(10, 5, 5, 80)).toBeCloseTo(27.41431958116207, 10)
    const segs = [['a', 'b', 'c'], ['a', 'b'], ['a', 'b', 'd'], ['c', 'd'], ['d'], ['a', 'c'], ['b', 'd'], ['a', 'b', 'c']].map((s) => new Set(s))
    const ranked = rankCollocates(segs, 'a', 5, 1)
    expect(ranked.map((c) => [c.term, Number(c.logLikelihood.toFixed(10)), c.joint])).toEqual([['b', 1.7619025654, 4], ['c', 0.5411532091, 3]])
    expect(parseFocalTerms('Dados; governo, dados\nescola')).toEqual(['dados', 'governo', 'escola'])
  })
})

describe('sentiment', () => {
  it('counts each word of the texts by its OpLexicon polarity', async () => {
    const { sentiment, loadOpLexicon } = await import('../../src/main/lexical/analyses/sentiment')
    const res = join(__dirname, '..', '..', 'resources', 'lexical')
    const lexicon = loadOpLexicon(res)
    expect(lexicon.size).toBeGreaterThan(20000)
    expect(lexicon.get('abafado')).toBe('Negativa')
    const lex = new Lexicon('pt', res)
    const corpus = prepareCorpus([{ id: '1', name: 'A', text: 'Um dia bom, um dia ruim e um dia abafado. Foi bom.' }], lex, { language: 'pt', uceSize: 40 })
    const r = sentiment(corpus, lexicon, 25)
    const count = (w: string) => r.words.find((x) => x.word === w)?.frequency ?? 0
    expect(count('bom')).toBe(2)
    expect(lexicon.get('bom')).toBe('Positivo')
    expect(r.counts.Negativa).toBeGreaterThanOrEqual(2) // ruim, abafado
    expect(r.matched).toBe(r.counts.Positivo + r.counts.Negativa + r.counts.Neutro)
  })
})

describe('similitude indices', () => {
  it('match labiia_lex for every IRaMuTeQ index', async () => {
    const { SIMILARITY_INDEX } = await import('../../src/main/lexical/analyses/similitude')
    // Values printed by labiia_lex's similitude matrix registry for a=7, b=5, c=3, d=85, n=100.
    const expected: Record<string, number> = { cooccurrence: 7, 'percentual de coocorrência': 0.07, russel: 0.07, jaccard: 0.4666666666666667, kulczynski1: 0.875, kulczynski2: 0.6416666666666666, mountford: 0.16279069767441862, fager: 0.48089576741427476, 'simple matching': 0.92, hamman: 0.84, faith: 0.495, tanimoto: 0.8518518518518519, dice: 0.6363636363636364, phi: 0.5949422064001082, stiles: 1.4706453115644598, michael: 0.27204502814258913, mozley: 5.833333333333333, yule: 0.9508196721311475, yule2: 0.7259578684880831, ochiai: 0.6390096504226938, simpson: 0.7, 'braun-blanquet': 0.5833333333333334, 'chi-squared': 35.39562289562289, 'phi-squared': 0.35395622895622897, tschuprow: 0.5949422064001082, cramer: 0.5949422064001082, pearson: 0.5949422064001082, binomial: 5.326708098187177 }
    for (const [name, value] of Object.entries(expected)) expect(SIMILARITY_INDEX[name](7, 5, 3, 85, 100), name).toBeCloseTo(value, 12)
  })
})
