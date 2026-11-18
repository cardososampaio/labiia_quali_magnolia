import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AnalysisInitData, PlainTextSelection } from '../../src/renderer/models/types'
import { buildClusteringInput } from '../../src/renderer/labiia/coding-units/units'
import {
  analyzeClusteringLocal,
  buildDendrogramSvg,
  clusterLeaves,
  dendrogramPairForNode,
  sharedReferences,
  type ClusterNode
} from '../../src/renderer/labiia/clustering/model'

const ref = (guid: string, startPosition: number, endPosition: number, ...codes: string[]): PlainTextSelection => ({
  guid,
  startPosition,
  endPosition,
  codings: codes.map((codeGuid, i) => ({ guid: `${guid}-${i}`, codeGuid }))
})

describe('displaying native clustering results', () => {
  it('lists leaves in dendrogram order and picks the closest cross-branch pair for any merge node', () => {
    const leaves = [0, 1, 2, 3].map((id) => ({ id, height: 0, size: 1 }))
    const root: ClusterNode = {
      id: 6,
      height: 0.8,
      size: 4,
      left: { id: 4, size: 2, height: 0.2, left: leaves[0], right: leaves[2] },
      right: { id: 5, size: 2, height: 0.2, left: leaves[1], right: leaves[3] }
    }
    expect(clusterLeaves(root)).toEqual([0, 2, 1, 3])

    const items = [{ guid: 'd0', profile: {} }, { guid: 'd1', profile: {} }, { guid: 'd2', profile: {} }, { guid: 'd3', profile: {} }]
    const similarities = [
      [1, 0.1, 0.8, 0.2],
      [0.1, 1, 0.3, 0.8],
      [0.8, 0.3, 1, 0.6],
      [0.2, 0.8, 0.6, 1]
    ]
    // Left subtree has {0, 2}, right subtree has {1, 3}; highest cross-similarity is (2, 3) = 0.6.
    expect(dendrogramPairForNode(root, items, similarities)).toEqual(['d2', 'd3'])
    expect(dendrogramPairForNode(root.left!, items, similarities)).toEqual(['d0', 'd2'])
  })

  it('retrieves references strictly from shared context units, including subcode matches and spatial overlaps', () => {
    const text = 'Parágrafo compartilhado.\nParágrafo só de X.\nParágrafo só de Y.'
    const data: AnalysisInitData = {
      toolType: 'coding-clusters',
      theme: 'light',
      sources: [{ guid: 'doc1', name: 'Entrevista 1', sourceType: 'text' }],
      folders: [],
      codes: [
        { guid: 'x', name: 'Código X', isCodable: true },
        { guid: 'xSub', name: 'Sub X', isCodable: true, parentGuid: 'x' },
        { guid: 'y', name: 'Código Y', isCodable: true }
      ],
      tags: [],
      categories: [],
      sourceContents: { doc1: text },
      sourceSelections: {
        doc1: [
          ref('sSharedX', 0, 10, 'xSub'),
          ref('sSharedY', 11, 24, 'y'),
          ref('sOnlyX', 25, 43, 'x'),
          ref('sOnlyY', 44, 62, 'y')
        ]
      },
      tagMembers: {}
    }

    const prepared = buildClusteringInput(data, {
      sourceGuids: ['doc1'],
      selectedCodeGuids: ['x', 'y'],
      target: 'codes',
      unit: 'paragraph',
      includeSubcodes: true,
      expandSurveyRespondents: false,
      measure: 'jaccard',
      linkage: 'average',
      minReferences: 1
    })

    const firstCode = { guid: 'x', profile: { 'doc1\u0000p\u00000': 1, 'doc1\u0000p\u00001': 1 } }
    const secondCode = { guid: 'y', profile: { 'doc1\u0000p\u00000': 1, 'doc1\u0000p\u00002': 1 } }

    const refs = sharedReferences(prepared, firstCode, secondCode)
    // Only selections inside paragraph 0 (the shared paragraph) should appear!
    expect(refs.map((r) => r.selection.guid)).toEqual(['sSharedX', 'sSharedY'])
    expect(refs[0].matchedCodes).toEqual(['x'])

    // In overlap mode, non-overlapping selections inside the same paragraph do not match,
    // while overlapping selections do!
    const overlapData: AnalysisInitData = {
      ...data,
      sourceSelections: {
        doc1: [
          ref('ov1', 0, 15, 'xSub'),
          ref('ov2', 10, 22, 'y'),
          ref('disjoint', 25, 40, 'x')
        ]
      }
    }
    const overlapPrepared = buildClusteringInput(overlapData, {
      sourceGuids: ['doc1'],
      selectedCodeGuids: ['x', 'y'],
      target: 'codes',
      unit: 'overlap',
      includeSubcodes: true,
      expandSurveyRespondents: false,
      measure: 'jaccard',
      linkage: 'average',
      minReferences: 1
    })
    const overlapRefs = sharedReferences(
      overlapPrepared,
      { guid: 'x', profile: { overlap: 2 } },
      { guid: 'y', profile: { overlap: 1 } }
    )
    expect(overlapRefs.map((r) => r.selection.guid)).toEqual(['ov1', 'ov2'])
  })

  it('keeps overlap similarity bounded in [0, 1] when multiple short selections fall inside one long selection', () => {
    for (const measure of ['cosine', 'jaccard', 'dice'] as const) {
      const result = analyzeClusteringLocal({
        units: [],
        overlapSources: [
          {
            guid: 'doc1',
            selections: [
              { geometry: { kind: 'span', space: 'text', start: 0, end: 100 }, codes: ['broad'] },
              { geometry: { kind: 'span', space: 'text', start: 5, end: 10 }, codes: ['narrow'] },
              { geometry: { kind: 'span', space: 'text', start: 20, end: 25 }, codes: ['narrow'] },
              { geometry: { kind: 'span', space: 'text', start: 40, end: 45 }, codes: ['narrow'] },
              { geometry: { kind: 'span', space: 'text', start: 60, end: 65 }, codes: ['narrow'] }
            ]
          }
        ],
        codes: ['broad', 'narrow'],
        target: 'codes',
        measure,
        linkage: 'average',
        minReferences: 1
      })
      expect(result.limited).toBe(false)
      if (!result.limited) {
        expect(result.similarities[0][1]).toBeCloseTo(1.0, 12)
        expect(result.root?.height).toBeCloseTo(0.0, 12)
      }
    }
  })

  it('filters sparse items below minReferences and matches base R hclust to 1e-12', () => {
    const filtered = analyzeClusteringLocal({
      units: [
        { id: 'd1', selections: [['x'], ['x'], ['y']] },
        { id: 'd2', selections: [['x'], ['y'], ['y']] },
        { id: 'sparse', selections: [['x']] }
      ],
      codes: ['x', 'y'],
      target: 'documents',
      measure: 'cosine',
      linkage: 'average',
      minReferences: 2
    })
    expect(filtered.excluded).toEqual(['sparse'])
    expect(filtered.items.map((i) => i.guid)).toEqual(['d1', 'd2'])

    const rCandidates = [
      process.env.RSCRIPT,
      'C:\\Program Files\\R\\R-4.6.1\\bin\\Rscript.exe'
    ].filter((p): p is string => !!p && existsSync(p))
    const rscript = rCandidates[0]
    if (!rscript) return

    const scriptPath = resolve(__dirname, '../../crates/labiia-analysis/tests/clustering-reference.R')

    const lines: string[] = []
    const units: { id: string; selections: string[][] }[] = []
    const codes = Array.from({ length: 30 }, (_, j) => String(j))
    for (let i = 0; i < 24; i++) {
      const rowCounts: number[] = []
      const selections: string[][] = []
      for (let j = 0; j < 30; j++) {
        const count =
          (i * 17 + j * 37 + i * j * 13) % 53 < 19 ? 0 : ((i * 41 + j * 31 + i * j) % 17) + 1
        rowCounts.push(count)
        for (let k = 0; k < count; k++) selections.push([String(j)])
      }
      lines.push(rowCounts.join(' '))
      units.push({ id: String(i), selections })
    }

    const stdout = execFileSync(rscript, ['--vanilla', scriptPath], {
      input: lines.join('\n') + '\n',
      encoding: 'utf8'
    })
    const rows = stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/).map(Number))

    const cosineRes = analyzeClusteringLocal({
      units,
      codes,
      target: 'documents',
      measure: 'cosine',
      linkage: 'average'
    })
    const jaccardRes = analyzeClusteringLocal({
      units,
      codes,
      target: 'documents',
      measure: 'jaccard',
      linkage: 'average'
    })
    const diceRes = analyzeClusteringLocal({
      units,
      codes,
      target: 'documents',
      measure: 'dice',
      linkage: 'average'
    })

    for (const [res, expected] of [
      [cosineRes, rows[0]],
      [jaccardRes, rows[1]],
      [diceRes, rows[2]]
    ] as const) {
      expect(res.limited).toBe(false)
      if (res.limited) continue
      const flat = res.similarities.flat()
      expect(flat.length).toBe(expected.length)
      for (let idx = 0; idx < flat.length; idx++) {
        expect(Math.abs(flat[idx] - expected[idx])).toBeLessThan(1e-12)
      }
    }

    const collectHeights = (node: ClusterNode | undefined, out: number[]): void => {
      if (node?.left && node.right) {
        collectHeights(node.left, out)
        collectHeights(node.right, out)
        out.push(node.height)
      }
    }

    const completeRes = analyzeClusteringLocal({
      units,
      codes,
      target: 'documents',
      measure: 'cosine',
      linkage: 'complete'
    })

    for (const [res, expectedHeights, expectedCut] of [
      [cosineRes, rows[3], rows[4]],
      [completeRes, rows[5], rows[6]]
    ] as const) {
      expect(res.limited).toBe(false)
      if (res.limited) continue
      const heights: number[] = []
      collectHeights(res.root, heights)
      heights.sort((a, b) => a - b)
      expect(heights.length).toBe(expectedHeights.length)
      for (let idx = 0; idx < heights.length; idx++) {
        expect(Math.abs(heights[idx] - expectedHeights[idx])).toBeLessThan(1e-12)
      }
      const labels = res.groupsByCut[4]
      for (let i = 0; i < labels.length; i++) {
        for (let j = 0; j < i; j++) {
          expect(labels[i] === labels[j]).toBe(expectedCut[i] === expectedCut[j])
        }
      }
    }
  })

  it('builds a standalone escaped SVG for the dendrogram', () => {
    const root: ClusterNode = {
      id: 2,
      size: 2,
      height: 0.4,
      left: { id: 0, size: 1, height: 0 },
      right: { id: 1, size: 1, height: 0 }
    }
    const svg = buildDendrogramSvg(root, [0, 1], ['Código <A> & B', 'Código C'], [1, 2])
    expect(svg).toContain('<svg ')
    expect(svg).toContain('Código &lt;A&gt; &amp; B')
    expect(svg).toContain('2 · Código C')
  })
})
