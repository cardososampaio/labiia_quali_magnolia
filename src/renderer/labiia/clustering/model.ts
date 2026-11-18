import type { PlainTextSelection } from '../../models/types'
import { selectionsSpatiallyOverlap, type PreparedClusteringInput } from '../coding-units/units'

export type SimilarityMeasure = 'cosine' | 'jaccard' | 'dice'
export type ClusterTarget = 'codes' | 'documents'
export type ClusterLinkage = 'average' | 'complete'

export type SpanGeometry =
  | { kind: 'span'; space: string; start: number; end: number }
  | { kind: 'rect'; page: number; x: number; y: number; width: number; height: number }
  | { kind: 'point'; id: string }

export interface OverlapSource {
  guid: string
  selections: { geometry: SpanGeometry; codes: string[] }[]
}

export interface ClusterRequest {
  units: { id: string; selections: string[][] }[]
  overlapSources?: OverlapSource[]
  codes: string[]
  target: ClusterTarget
  measure: SimilarityMeasure
  linkage: ClusterLinkage
  minReferences?: number
}

export interface ClusterItem {
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

export interface SharedReferenceEntry {
  document: string
  unitLabel?: string
  selection: PlainTextSelection
  matchedCodes: string[]
}

export const MAX_CLUSTER_ITEMS = 120

export function clusterLeaves(node: ClusterNode): number[] {
  return node.left && node.right ? [...clusterLeaves(node.left), ...clusterLeaves(node.right)] : [node.id]
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Build a standalone, publication-ready SVG of the hierarchical dendrogram. */
export function buildDendrogramSvg(
  root: ClusterNode,
  order: readonly number[],
  names: readonly string[],
  groups: readonly number[]
): string {
  const rowHeight = 24
  const treeWidth = 220
  const maxChars = Math.max(12, ...order.map((leaf) => `${groups[leaf]} · ${names[leaf] ?? ''}`.length))
  const totalWidth = treeWidth + 16 + maxChars * 7.5
  const totalHeight = Math.max(rowHeight, order.length * rowHeight) + 16
  const rowY = new Map(order.map((leaf, index) => [leaf, 8 + (index + 0.5) * rowHeight]))
  const paths: string[] = []

  const position = (node: ClusterNode): [number, number] => {
    const x = 8 + (1 - node.height) * (treeWidth - 16)
    if (!node.left || !node.right) return [x, rowY.get(node.id) ?? 8]
    const [lx, ly] = position(node.left)
    const [rx, ry] = position(node.right)
    paths.push(`<path d="M ${lx} ${ly} H ${x} V ${ry} H ${rx}" />`)
    return [x, (ly + ry) / 2]
  }
  position(root)

  const labels = order.map((leaf) => {
    const y = (rowY.get(leaf) ?? 8) + 4
    const text = escapeXml(`${groups[leaf]} · ${names[leaf] ?? ''}`)
    return `<text x="${treeWidth + 8}" y="${y}" font-size="12" fill="#1f2937">${text}</text>`
  })

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(totalWidth)}" height="${totalHeight}" viewBox="0 0 ${Math.ceil(totalWidth)} ${totalHeight}">`,
    `<rect width="100%" height="100%" fill="#ffffff" />`,
    `<g fill="none" stroke="#334155" stroke-width="1.5">${paths.join('')}</g>`,
    `<g font-family="system-ui, -apple-system, Segoe UI, sans-serif">${labels.join('')}</g>`,
    `</svg>`
  ].join('\n')
}

function geometryOverlaps(a: SpanGeometry, b: SpanGeometry): boolean {
  if (a.kind === 'rect' && b.kind === 'rect') {
    if (a.page !== b.page) return false
    const x = Math.max(a.x, b.x)
    const y = Math.max(a.y, b.y)
    const right = Math.min(a.x + a.width, b.x + b.width)
    const bottom = Math.min(a.y + a.height, b.y + b.height)
    return x < right && y < bottom
  }
  if (a.kind === 'span' && b.kind === 'span') {
    return a.space === b.space && Math.max(a.start, b.start) < Math.min(a.end, b.end)
  }
  if (a.kind === 'point' && b.kind === 'point') {
    return a.id === b.id
  }
  return false
}

function agglomerate(similarities: number[][], linkage: ClusterLinkage): ClusterNode | undefined {
  const n = similarities.length
  const distances = similarities.map((row) => row.map((value) => 1 - value))
  const active: (ClusterNode | undefined)[] = Array.from({ length: n }, (_, id) => ({
    id,
    size: 1,
    height: 0
  }))
  for (let id = n; id < Math.max(0, n * 2 - 1); id++) {
    let a = 0
    let b = 0
    let height = Number.POSITIVE_INFINITY
    for (let i = 0; i < n; i++) {
      if (!active[i]) continue
      for (let j = i + 1; j < n; j++) {
        if (active[j] && distances[i][j] < height) {
          a = i
          b = j
          height = distances[i][j]
        }
      }
    }
    const left = active[a]!
    const right = active[b]!
    active[a] = undefined
    active[b] = undefined
    const size = left.size + right.size
    for (let i = 0; i < n; i++) {
      if (!active[i]) continue
      const distance =
        linkage === 'average'
          ? (left.size * distances[a][i] + right.size * distances[b][i]) / size
          : Math.max(distances[a][i], distances[b][i])
      distances[a][i] = distance
      distances[i][a] = distance
    }
    active[a] = { id, size, height, left, right }
  }
  return active.find(Boolean)
}

function groupsByCut(root: ClusterNode): number[][] {
  const assign = (node: ClusterNode, group: number, labels: number[]): void => {
    if (node.left && node.right) {
      assign(node.left, group, labels)
      assign(node.right, group, labels)
    } else {
      labels[node.id] = group
    }
  }
  const groups: ClusterNode[] = [root]
  const cuts: number[][] = []
  while (true) {
    const labels = new Array<number>(root.size).fill(0)
    groups.forEach((node, idx) => assign(node, idx + 1, labels))
    cuts.push(labels)
    if (groups.length === root.size) break
    let bestIdx = 0
    for (let i = 1; i < groups.length; i++) {
      if (groups[i].id > groups[bestIdx].id) bestIdx = i
    }
    const [node] = groups.splice(bestIdx, 1)
    groups.splice(bestIdx, 0, node.left!, node.right!)
  }
  return cuts
}

/** Deterministic in-process mirror of `crates/labiia-analysis::clustering::analyze`,
 *  used by synchronous PDF report generation and verified against base R `hclust`. */
export function analyzeClusteringLocal(request: ClusterRequest): ClusterResult {
  const minRefs = Math.max(1, request.minReferences ?? 1)
  const codeSet = new Set(request.codes)

  if (request.target === 'codes' && request.overlapSources) {
    const seenCodes = new Set<string>()
    const orderedCodes: string[] = []
    for (const c of request.codes) {
      if (!seenCodes.has(c)) {
        seenCodes.add(c)
        orderedCodes.push(c)
      }
    }
    const counts = new Map<string, number>(orderedCodes.map((c) => [c, 0]))
    for (const src of request.overlapSources) {
      for (const sel of src.selections) {
        for (const c of new Set(sel.codes)) {
          if (counts.has(c)) counts.set(c, (counts.get(c) ?? 0) + 1)
        }
      }
    }
    const items: ClusterItem[] = []
    const excluded: string[] = []
    for (const c of orderedCodes) {
      const total = counts.get(c) ?? 0
      if (total >= minRefs) items.push({ guid: c, profile: { overlap: total } })
      else excluded.push(c)
    }
    if (items.length > MAX_CLUSTER_ITEMS) {
      return { items, excluded, limited: true, limit: MAX_CLUSTER_ITEMS }
    }
    const activeIndex = new Map(items.map((item, idx) => [item.guid, idx]))
    const m = items.length
    const directed = Array.from({ length: m }, () => new Array<number>(m).fill(0))
    for (const src of request.overlapSources) {
      const sels = src.selections.map((s) => ({
        geometry: s.geometry,
        indices: [...new Set(s.codes)]
          .map((c) => activeIndex.get(c))
          .filter((idx): idx is number => idx !== undefined)
      }))
      for (let sIdx = 0; sIdx < sels.length; sIdx++) {
        const s = sels[sIdx]
        if (!s.indices.length) continue
        const touched = new Set<number>(s.indices)
        for (let tIdx = 0; tIdx < sels.length; tIdx++) {
          if (tIdx === sIdx) continue
          const t = sels[tIdx]
          if (!t.indices.length) continue
          if (geometryOverlaps(s.geometry, t.geometry)) {
            for (const codeIdx of t.indices) touched.add(codeIdx)
          }
        }
        for (const a of s.indices) {
          for (const b of touched) {
            if (a !== b) directed[a][b] += 1
          }
        }
      }
    }
    const similarities = Array.from({ length: m }, () => new Array<number>(m).fill(0))
    for (let i = 0; i < m; i++) {
      similarities[i][i] = 1
      const ni = items[i].profile.overlap
      for (let j = 0; j < i; j++) {
        const nj = items[j].profile.overlap
        const aij = directed[i][j]
        const bij = directed[j][i]
        let sim = 0
        if (aij > 0 && bij > 0) {
          if (request.measure === 'cosine') {
            sim = Math.min(1, Math.sqrt(aij * bij) / Math.sqrt(ni * nj))
          } else if (request.measure === 'dice') {
            sim = Math.min(1, (aij + bij) / (ni + nj))
          } else {
            const meanShared = 0.5 * (aij + bij)
            sim = Math.min(1, meanShared / (ni + nj - meanShared))
          }
        }
        similarities[i][j] = sim
        similarities[j][i] = sim
      }
    }
    const root = agglomerate(similarities, request.linkage)
    return {
      items,
      excluded,
      limited: false,
      limit: MAX_CLUSTER_ITEMS,
      similarities,
      root,
      groupsByCut: root ? groupsByCut(root) : []
    }
  }

  const candidateGuids =
    request.target === 'codes' ? request.codes : request.units.map((u) => u.id)
  const rawItems: ClusterItem[] = []
  const indexByGuid = new Map<string, number>()
  for (const guid of candidateGuids) {
    if (indexByGuid.has(guid)) continue
    indexByGuid.set(guid, rawItems.length)
    rawItems.push({ guid, profile: {} })
  }

  const visitedUnits = new Set<string>()
  for (const unit of request.units) {
    if (visitedUnits.has(unit.id)) continue
    visitedUnits.add(unit.id)
    for (const sel of unit.selections) {
      for (const code of new Set(sel)) {
        if (!codeSet.has(code)) continue
        const [itemGuid, feature] =
          request.target === 'codes' ? [code, unit.id] : [unit.id, code]
        const idx = indexByGuid.get(itemGuid)
        if (idx === undefined) continue
        rawItems[idx].profile[feature] = (rawItems[idx].profile[feature] ?? 0) + 1
      }
    }
  }

  const items: ClusterItem[] = []
  const excluded: string[] = []
  for (const item of rawItems) {
    const totalRefs = Object.values(item.profile).reduce((a, b) => a + b, 0)
    if (totalRefs >= minRefs) items.push(item)
    else excluded.push(item.guid)
  }

  if (items.length > MAX_CLUSTER_ITEMS) {
    return { items, excluded, limited: true, limit: MAX_CLUSTER_ITEMS }
  }

  const norms = items.map((item) =>
    Math.sqrt(Object.values(item.profile).reduce((sum, count) => sum + count * count, 0))
  )
  const similarities = Array.from({ length: items.length }, () =>
    new Array<number>(items.length).fill(0)
  )
  for (let i = 0; i < items.length; i++) {
    similarities[i][i] = 1
    const firstKeys = Object.keys(items[i].profile)
    for (let j = 0; j < i; j++) {
      const secondKeys = Object.keys(items[j].profile)
      const [small, large] =
        firstKeys.length <= secondKeys.length
          ? [items[i].profile, items[j].profile]
          : [items[j].profile, items[i].profile]
      let common = 0
      let dot = 0
      for (const [feature, count] of Object.entries(small)) {
        const other = large[feature]
        if (other !== undefined) {
          common += 1
          dot += count * other
        }
      }
      const size = firstKeys.length + secondKeys.length
      const sim =
        request.measure === 'cosine'
          ? Math.min(1, dot / (norms[i] * norms[j]))
          : request.measure === 'jaccard'
            ? common / (size - common)
            : (2 * common) / size
      similarities[i][j] = sim
      similarities[j][i] = sim
    }
  }

  const root = agglomerate(similarities, request.linkage)
  return {
    items,
    excluded,
    limited: false,
    limit: MAX_CLUSTER_ITEMS,
    similarities,
    root,
    groupsByCut: root ? groupsByCut(root) : []
  }
}

/** Representative cross-branch pair for a dendrogram merge node: selects the
 *  most similar leaf pair across the left and right subtrees so clicking any
 *  junction in the tree opens concrete shared evidence. */
export function dendrogramPairForNode(
  node: ClusterNode,
  items: readonly ClusterItem[],
  similarities: readonly (readonly number[])[]
): [string, string] | null {
  if (!node.left || !node.right) {
    const item = items[node.id]
    return item ? [item.guid, item.guid] : null
  }
  const leftLeaves = clusterLeaves(node.left)
  const rightLeaves = clusterLeaves(node.right)
  let bestL = leftLeaves[0]
  let bestR = rightLeaves[0]
  let bestScore = -1
  for (const l of leftLeaves) {
    for (const r of rightLeaves) {
      const score = similarities[l]?.[r] ?? -1
      if (score > bestScore) {
        bestScore = score
        bestL = l
        bestR = r
      }
    }
  }
  const a = items[bestL]
  const b = items[bestR]
  return a && b ? [a.guid, b.guid] : null
}

/** Retrieve only the references that actually sustain the similarity between
 *  two items under the active target, context unit, and subcode setting. */
export function sharedReferences(
  prepared: PreparedClusteringInput,
  first: ClusterItem,
  second: ClusterItem
): SharedReferenceEntry[] {
  const out: SharedReferenceEntry[] = []
  const seen = new Set<string>()

  if (prepared.target === 'documents') {
    const sharedCodes = new Set(
      first.guid === second.guid
        ? Object.keys(first.profile)
        : Object.keys(first.profile).filter((feature) => Object.hasOwn(second.profile, feature))
    )
    if (sharedCodes.size === 0) return []
    const itemIds = first.guid === second.guid ? [first.guid] : [first.guid, second.guid]
    for (const itemId of itemIds) {
      const unitLabel = prepared.unitLabels.get(itemId)
      for (const entry of prepared.itemSelections.get(itemId) ?? []) {
        const matchedCodes = entry.matchedCodes.filter((c) => sharedCodes.has(c))
        if (matchedCodes.length === 0) continue
        const key = `${entry.sourceGuid}/${entry.selection.guid}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          document: entry.sourceGuid,
          unitLabel,
          selection: entry.selection,
          matchedCodes
        })
      }
    }
    return out
  }

  // Target === 'codes'
  const wantedCodes = new Set([first.guid, second.guid])

  if (prepared.unit === 'overlap') {
    for (const [sourceGuid, entries] of prepared.itemSelections.entries()) {
      if (first.guid === second.guid) {
        for (const entry of entries) {
          if (!entry.matchedCodes.includes(first.guid)) continue
          const key = `${sourceGuid}/${entry.selection.guid}`
          if (seen.has(key)) continue
          seen.add(key)
          out.push({ document: sourceGuid, selection: entry.selection, matchedCodes: [first.guid] })
        }
        continue
      }
      const firstEntries = entries.filter((e) => e.matchedCodes.includes(first.guid))
      const secondEntries = entries.filter((e) => e.matchedCodes.includes(second.guid))
      if (!firstEntries.length || !secondEntries.length) continue
      const involved = new Set<string>()
      for (const a of firstEntries) {
        for (const b of secondEntries) {
          if (selectionsSpatiallyOverlap(a.selection, b.selection)) {
            involved.add(a.selection.guid)
            involved.add(b.selection.guid)
          }
        }
      }
      for (const entry of entries) {
        if (!involved.has(entry.selection.guid)) continue
        const matchedCodes = entry.matchedCodes.filter((c) => wantedCodes.has(c))
        if (!matchedCodes.length) continue
        const key = `${sourceGuid}/${entry.selection.guid}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ document: sourceGuid, selection: entry.selection, matchedCodes })
      }
    }
    return out
  }

  const sharedUnits =
    first.guid === second.guid
      ? Object.keys(first.profile)
      : Object.keys(first.profile).filter((u) => Object.hasOwn(second.profile, u))

  for (const unitId of sharedUnits) {
    const unitLabel = prepared.unitLabels.get(unitId)
    for (const entry of prepared.unitSelections.get(unitId) ?? []) {
      const matchedCodes = entry.matchedCodes.filter((c) => wantedCodes.has(c))
      if (matchedCodes.length === 0) continue
      const key = `${unitId}/${entry.selection.guid}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        document: entry.sourceGuid,
        unitLabel,
        selection: entry.selection,
        matchedCodes
      })
    }
  }
  return out
}
