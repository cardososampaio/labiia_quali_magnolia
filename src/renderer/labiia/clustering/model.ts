import type { PlainTextSelection } from '../../models/types'

export type SimilarityMeasure = 'cosine' | 'jaccard' | 'dice'
export type ClusterTarget = 'codes' | 'documents'
export type ClusterLinkage = 'average' | 'complete'

export interface ClusterRequest {
  documents: { guid: string; selections: string[][] }[]
  codes: string[]
  target: ClusterTarget
  measure: SimilarityMeasure
  linkage: ClusterLinkage
}

interface ClusterItem {
  guid: string
  profile: Record<string, number>
}

export interface ClusterNode {
  id: number
  size: number
  height: number
  left?: ClusterNode
  right?: ClusterNode
}

export type ClusterResult = { items: ClusterItem[]; excluded: string[]; limit: number } & (
  | { limited: true }
  | { limited: false; similarities: number[][]; groupsByCut: number[][]; root?: ClusterNode }
)

export function clusterLeaves(node: ClusterNode): number[] {
  return node.left && node.right ? [...clusterLeaves(node.left), ...clusterLeaves(node.right)] : [node.id]
}

/** Only references to shared features contribute to the numerator of
 *  the comparison. Codes need only occur in the same document. */
export function sharedReferences(
  sourceSelections: Readonly<Record<string, readonly PlainTextSelection[]>>,
  target: ClusterTarget,
  first: ClusterItem,
  second: ClusterItem
) {
  const shared = Object.keys(first.profile).filter((feature) => Object.hasOwn(second.profile, feature))
  const documents = target === 'codes' ? shared : [...new Set([first.guid, second.guid])]
  const codes = new Set(target === 'codes' ? [first.guid, second.guid] : shared)
  return documents.flatMap((document) =>
    (sourceSelections[document] ?? []).flatMap((selection) => {
      const matchingCodes = [...new Set(selection.codings.map(({ codeGuid }) => codeGuid).filter((guid) => codes.has(guid)))]
      return matchingCodes.length ? [{ document, selection, codes: matchingCodes }] : []
    })
  )
}
