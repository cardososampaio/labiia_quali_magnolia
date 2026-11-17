import { describe, expect, it } from 'vitest'
import type { PlainTextSelection } from '../../src/renderer/models/types'
import { clusterProfiles, codingProfiles, cutClusters, sharedReferences } from '../../src/renderer/labiia/clustering/model'

const ref = (...codes: string[]) => ({
  codings: codes.map((codeGuid) => ({ codeGuid }))
}) as PlainTextSelection

describe('clustering coding profiles', () => {
  const selections = {
    a: [ref('x', 'x'), ref('x'), ref('y')],
    b: [ref('y')],
    c: [ref('z')],
    d: []
  }
  const documents = ['a', 'b', 'c', 'd']
  const codes = ['x', 'y', 'z', 'parent']

  it('counts direct references once per selection and transposes by target', () => {
    expect(codingProfiles(selections, documents, codes, 'documents').map(({ profile }) => [...profile])).toEqual([
      [['x', 2], ['y', 1]], [['y', 1]], [['z', 1]], []
    ])
    expect(codingProfiles(selections, documents, codes, 'codes').map(({ profile }) => [...profile])).toEqual([
      [['a', 2]], [['a', 1], ['b', 1]], [['c', 1]], []
    ])
  })

  it.each([['cosine', 1 / Math.sqrt(5)], ['jaccard', 1 / 2], ['dice', 2 / 3]] as const)(
    'calculates %s and excludes empty profiles',
    (measure, expected) => {
      const result = clusterProfiles(codingProfiles(selections, documents, codes, 'documents'), measure)
      expect(result.excluded).toEqual(['d'])
      if (result.limited) throw new Error('Unexpected limit')
      expect(result.similarities[0][1]).toBeCloseTo(expected)
      expect(result.similarities[1][0]).toBeCloseTo(expected)
      expect(result.similarities[0][2]).toBe(0)
      expect(result.similarities[0][0]).toBe(1)
      expect(result.root?.height).toBe(1)
      expect(cutClusters(result.root!, 2)).toEqual([[0, 1], [2]])
    }
  )

  it('weights average linkage by leaf count and cuts ties in merge order', () => {
    const profiles = [
      ['x', 'y'], ['x', 'y'], ['x'], ['z', 'x']
    ].map((features, index) => ({ guid: String(index), profile: new Map(features.map((feature) => [feature, 1])) }))
    const result = clusterProfiles(profiles, 'jaccard')
    if (result.limited) throw new Error('Unexpected limit')
    expect(result.root?.height).toBeCloseTo((2 / 3 + 2 / 3 + 1 / 2) / 3)
    expect(cutClusters(result.root!, 3)).toEqual([[0, 1], [2], [3]])
    expect(cutClusters(result.root!, 2)).toEqual([[0, 1, 2], [3]])
  })

  it('retrieves exactly the scoped references to shared features for either target', () => {
    const [firstCode, secondCode] = codingProfiles(selections, documents, codes, 'codes')
    expect(sharedReferences(selections, 'codes', firstCode, secondCode).map(({ document, codes: matches }) => [document, matches])).toEqual([
      ['a', ['x']], ['a', ['x']], ['a', ['y']]
    ])
    const [firstDocument, secondDocument, thirdDocument] = codingProfiles(selections, documents, codes, 'documents')
    expect(sharedReferences(selections, 'documents', firstDocument, secondDocument).map(({ document, codes: matches }) => [document, matches])).toEqual([
      ['a', ['y']], ['b', ['y']]
    ])
    expect(sharedReferences(selections, 'documents', firstDocument, thirdDocument)).toEqual([])
  })

  it('bounds the number of objects before computing pairwise similarities', () => {
    const result = clusterProfiles(
      Array.from({ length: 121 }, (_, id) => ({ guid: String(id), profile: new Map([['x', 1]]) })),
      'dice'
    )
    expect(result.limited).toBe(true)
  })
})
