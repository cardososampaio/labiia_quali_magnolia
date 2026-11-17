import { describe, expect, it } from 'vitest'
import type { PlainTextSelection } from '../../src/renderer/models/types'
import { clusterLeaves, sharedReferences, type ClusterNode } from '../../src/renderer/labiia/clustering/model'

const ref = (...codes: string[]) => ({
  codings: codes.map((codeGuid) => ({ codeGuid }))
}) as PlainTextSelection

describe('displaying native clustering results', () => {
  it('lists leaves in dendrogram order', () => {
    const leaves = [0, 1, 2, 3].map((id) => ({ id, height: 0, size: 1 }))
    const root: ClusterNode = {
      id: 6, height: 0.8, size: 4,
      left: { id: 4, size: 2, height: 0.2, left: leaves[0], right: leaves[2] },
      right: { id: 5, size: 2, height: 0.2, left: leaves[1], right: leaves[3] }
    }
    expect(clusterLeaves(root)).toEqual([0, 2, 1, 3])
  })

  it('retrieves scoped references to shared features for either target', () => {
    const selections = { a: [ref('x', 'x'), ref('x'), ref('y')], b: [ref('y')], c: [ref('z')] }
    const firstCode = { guid: 'x', profile: { a: 2 } }
    const secondCode = { guid: 'y', profile: { a: 1, b: 1 } }
    expect(sharedReferences(selections, 'codes', firstCode, secondCode).map(({ document, codes }) => [document, codes])).toEqual([
      ['a', ['x']], ['a', ['x']], ['a', ['y']]
    ])
    const firstDocument = { guid: 'a', profile: { x: 2, y: 1 } }
    const secondDocument = { guid: 'b', profile: { y: 1 } }
    const thirdDocument = { guid: 'c', profile: { z: 1 } }
    expect(sharedReferences(selections, 'documents', firstDocument, secondDocument).map(({ document, codes }) => [document, codes])).toEqual([
      ['a', ['y']], ['b', ['y']]
    ])
    expect(sharedReferences(selections, 'documents', firstDocument, thirdDocument)).toEqual([])
  })
})
