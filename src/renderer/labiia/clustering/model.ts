import type { PlainTextSelection } from '../../models/types'

export type SimilarityMeasure = 'cosine' | 'jaccard' | 'dice'
export type ClusterTarget = 'codes' | 'documents'
type Profile = Map<string, number>

export const CLUSTER_LIMIT = 120

interface ClusterItem {
  guid: string
  profile: Profile
}

export interface ClusterNode {
  id: number
  size: number
  height: number
  left?: ClusterNode
  right?: ClusterNode
}

/** Each reference is one selection with a directly assigned code. */
export function codingProfiles(
  sourceSelections: Readonly<Record<string, readonly PlainTextSelection[]>>,
  documents: readonly string[],
  codes: readonly string[],
  target: ClusterTarget
): ClusterItem[] {
  const items = new Map((target === 'codes' ? codes : documents).map((guid) => [guid, new Map<string, number>()]))
  const selectedCodes = new Set(codes)
  for (const document of new Set(documents)) {
    for (const selection of sourceSelections[document] ?? []) {
      const assignedCodes = new Set(selection.codings.map(({ codeGuid }) => codeGuid))
      for (const code of assignedCodes) {
        if (!selectedCodes.has(code)) continue
        const profile = items.get(target === 'codes' ? code : document)!
        const feature = target === 'codes' ? document : code
        profile.set(feature, (profile.get(feature) ?? 0) + 1)
      }
    }
  }
  return Array.from(items, ([guid, profile]) => ({ guid, profile }))
}

export function clusterProfiles(profiles: ClusterItem[], measure: SimilarityMeasure) {
  const items = profiles.filter(({ profile }) => profile.size > 0)
  const excluded = profiles.filter(({ profile }) => profile.size === 0).map(({ guid }) => guid)
  if (items.length > CLUSTER_LIMIT) return { items, excluded, limited: true as const }

  const norms = items.map(({ profile }) => {
    let squaredNorm = 0
    for (const count of profile.values()) squaredNorm += count * count
    return Math.sqrt(squaredNorm)
  })
  const similarities = items.map((_, index) => items.map((_, column) => Number(column === index)))
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = items[i].profile
      const b = items[j].profile
      const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a]
      let intersection = 0
      let dot = 0
      for (const [feature, count] of smaller) {
        const match = larger.get(feature)
        if (match === undefined) continue
        intersection++
        dot += count * match
      }
      let similarity: number
      switch (measure) {
        case 'cosine':
          similarity = Math.min(1, dot / (norms[i] * norms[j]))
          break
        case 'jaccard':
          similarity = intersection / (a.size + b.size - intersection)
          break
        case 'dice':
          similarity = (2 * intersection) / (a.size + b.size)
          break
      }
      similarities[i][j] = similarities[j][i] = similarity
    }
  }
  return { items, excluded, limited: false as const, similarities, root: averageLinkage(similarities) }
}

/** At each merge the distance to another group is the mean distance over
 *  all pairs of leaves, so group sizes weight the two previous distances. */
function averageLinkage(similarities: number[][]): ClusterNode | undefined {
  const distances = similarities.map((row) => row.map((similarity) => 1 - similarity))
  const active = similarities.map<ClusterNode | undefined>((_, id) => ({ id, size: 1, height: 0 }))
  for (let id = active.length; id < 2 * active.length - 1; id++) {
    let a = -1
    let b = -1
    let height = Infinity
    for (let i = 0; i < active.length; i++) {
      if (!active[i]) continue
      for (let j = i + 1; j < active.length; j++) {
        if (active[j] && distances[i][j] < height) {
          a = i
          b = j
          height = distances[i][j]
        }
      }
    }
    const left = active[a]!
    const right = active[b]!
    const size = left.size + right.size
    for (let i = 0; i < active.length; i++) {
      if (!active[i] || i === a || i === b) continue
      distances[a][i] = distances[i][a] = (left.size * distances[a][i] + right.size * distances[b][i]) / size
    }
    active[a] = { id, size, height, left, right }
    active[b] = undefined
  }
  return active.find((node) => node !== undefined)
}

export function clusterLeaves(node: ClusterNode): number[] {
  return node.left && node.right ? [...clusterLeaves(node.left), ...clusterLeaves(node.right)] : [node.id]
}

export function cutClusters(root: ClusterNode, groupCount: number): number[][] {
  const groups = [root]
  while (groups.length < groupCount) {
    // Merge IDs break ties the same way as in the original agglomeration.
    const latest = groups.reduce((best, node, index) => node.id > groups[best].id ? index : best, 0)
    const { left, right } = groups[latest]
    if (!left || !right) break
    groups.splice(latest, 1, left, right)
  }
  return groups.map(clusterLeaves)
}
