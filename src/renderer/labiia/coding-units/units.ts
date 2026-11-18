/**
 * Context units for qualitative code comparison and clustering.
 *
 * Researchers compare codes across different analytical granularities
 * (whole documents, survey respondents, paragraphs or transcript lines,
 * sentences, or spatially/temporally overlapping selections) so associations
 * reflect the interpretive unit of the study rather than a fixed unit.
 */
import type { AnalysisInitData, PlainTextSelection } from '../../models/types'
import { sentenceSpans } from '../../utils/sentences'
import { expandCodes } from '../../components/Lexical/lexical-units'
import type {
  ClusterLinkage,
  ClusterRequest,
  ClusterTarget,
  OverlapSource,
  SimilarityMeasure,
  SpanGeometry
} from '../clustering/model'

export type ComparisonUnit = 'document' | 'paragraph' | 'sentence' | 'overlap'

export interface HierarchyOverlap {
  ancestorGuid: string
  descendantGuid: string
}

export interface IndexedSelection {
  sourceGuid: string
  selection: PlainTextSelection
  /** Chosen top-level/selected code guids matched by this selection (direct or via subcodes). */
  matchedCodes: string[]
}

export interface PreparedClusteringInput {
  request: ClusterRequest
  target: ClusterTarget
  unit: ComparisonUnit
  includeSubcodes: boolean
  expandSurveyRespondents: boolean
  /** Human-readable display label for every document/respondent or code item id. */
  itemLabels: Map<string, string>
  /** Human-readable context label for unit ids (e.g. "Entrevista 1 · Parágrafo 3"). */
  unitLabels: Map<string, string>
  /** Selections indexed by context unit id (for document/respondent/paragraph/sentence modes). */
  unitSelections: Map<string, IndexedSelection[]>
  /** Selections indexed by source guid (for document comparison and spatial overlap inspection). */
  itemSelections: Map<string, IndexedSelection[]>
  /** Coded selections left out of paragraph/sentence segmentation because they carry no text. */
  skippedNonTextSelections: number
  /** Ancestor-descendant pairs selected together while subcodes are rolled into parents. */
  hierarchyOverlaps: HierarchyOverlap[]
}

export interface BuildClusteringOptions {
  sourceGuids: string[]
  selectedCodeGuids: string[]
  target: ClusterTarget
  unit: ComparisonUnit
  includeSubcodes: boolean
  expandSurveyRespondents: boolean
  measure: SimilarityMeasure
  linkage: ClusterLinkage
  minReferences: number
}

/** Non-empty trimmed lines separated by line breaks, returned as codepoint
 *  [start, end) intervals matching PlainTextSelection offsets. In Magnolia
 *  transcripts each speaker turn or timestamped segment occupies one line. */
export function paragraphSpans(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  let cp = 0
  let at = 0
  const toCp = (utf16Index: number): number => {
    for (; at < utf16Index; at++) {
      const c = text.charCodeAt(at)
      if (c < 0xdc00 || c > 0xdfff) cp++
    }
    return cp
  }
  const push = (start: number, end: number): void => {
    while (start < end && /\s/.test(text[start])) start++
    while (end > start && /\s/.test(text[end - 1])) end--
    if (end > start) out.push({ start: toCp(start), end: toCp(end) })
  }
  let from = 0
  for (const m of text.matchAll(/\n+/g)) {
    push(from, m.index!)
    from = m.index! + m[0].length
  }
  push(from, text.length)
  return out
}

/** Detect when both an ancestor code and one of its descendants are selected
 *  while `includeSubcodes` is active, which otherwise creates a tautological
 *  cluster between parent and child without warning the researcher. */
export function findSelectedHierarchyOverlaps(
  codes: AnalysisInitData['codes'],
  selectedCodeGuids: string[],
  includeSubcodes: boolean
): HierarchyOverlap[] {
  if (!includeSubcodes || selectedCodeGuids.length < 2) return []
  const selected = new Set(selectedCodeGuids)
  const parentByGuid = new Map<string, string | undefined>()
  for (const c of codes) parentByGuid.set(c.guid, c.parentGuid)

  const overlaps: HierarchyOverlap[] = []
  for (const guid of selectedCodeGuids) {
    let cur = parentByGuid.get(guid)
    const visited = new Set<string>()
    while (cur && !visited.has(cur)) {
      visited.add(cur)
      if (selected.has(cur)) {
        overlaps.push({ ancestorGuid: cur, descendantGuid: guid })
        break
      }
      cur = parentByGuid.get(cur)
    }
  }
  return overlaps
}

/** Multimodal spatial/temporal overlap predicate consistent with the query
 *  engine: survey cells never cross respondent/question boundaries, PDF/image
 *  boxes compare 2D page rectangles, media clips compare time ranges, and text
 *  selections compare codepoint spans. */
export function selectionsSpatiallyOverlap(a: PlainTextSelection, b: PlainTextSelection): boolean {
  if (a.guid === b.guid) return true
  const ac = a.surveyCell
  const bc = b.surveyCell
  if (ac || bc) {
    if (!ac || !bc || ac.respondentId !== bc.respondentId || ac.questionId !== bc.questionId) {
      return false
    }
  }
  if (a.pdfRegion || b.pdfRegion) {
    if (!a.pdfRegion || !b.pdfRegion) return false
    if (a.pdfRegion.page !== b.pdfRegion.page) return false
    const x = Math.max(a.pdfRegion.x, b.pdfRegion.x)
    const y = Math.max(a.pdfRegion.y, b.pdfRegion.y)
    const right = Math.min(a.pdfRegion.x + a.pdfRegion.width, b.pdfRegion.x + b.pdfRegion.width)
    const bottom = Math.min(a.pdfRegion.y + a.pdfRegion.height, b.pdfRegion.y + b.pdfRegion.height)
    return x < right && y < bottom
  }
  if (
    a.timeRange &&
    b.timeRange &&
    a.endPosition <= a.startPosition &&
    b.endPosition <= b.startPosition
  ) {
    return (
      Math.max(a.timeRange.startTime, b.timeRange.startTime) <
      Math.min(a.timeRange.endTime, b.timeRange.endTime)
    )
  }
  return Math.max(a.startPosition, b.startPosition) < Math.min(a.endPosition, b.endPosition)
}

function geometryForSelection(sel: PlainTextSelection): SpanGeometry {
  if (sel.pdfRegion) {
    const { page, x, y, width, height } = sel.pdfRegion
    return width > 0 && height > 0
      ? { kind: 'rect', page, x, y, width, height }
      : { kind: 'point', id: sel.guid }
  }
  if (sel.timeRange && sel.endPosition <= sel.startPosition) {
    const { startTime, endTime } = sel.timeRange
    return endTime > startTime
      ? { kind: 'span', space: 'time', start: startTime, end: endTime }
      : { kind: 'point', id: sel.guid }
  }
  if (sel.endPosition > sel.startPosition) {
    const space = sel.surveyCell
      ? `cell:${sel.surveyCell.respondentId}\u0000${sel.surveyCell.questionId}`
      : 'text'
    return { kind: 'span', space, start: sel.startPosition, end: sel.endPosition }
  }
  return { kind: 'point', id: sel.guid }
}

export function respondentItemId(sourceGuid: string, respondentId: string): string {
  return `${sourceGuid}\u0000resp\u0000${respondentId}`
}

export function buildClusteringInput(
  data: AnalysisInitData,
  options: BuildClusteringOptions
): PreparedClusteringInput {
  const {
    sourceGuids,
    selectedCodeGuids,
    target,
    unit,
    includeSubcodes,
    expandSurveyRespondents,
    measure,
    linkage,
    minReferences
  } = options

  const effectiveUnit: ComparisonUnit = target === 'documents' ? 'document' : unit
  const hierarchyOverlaps = findSelectedHierarchyOverlaps(
    data.codes,
    selectedCodeGuids,
    includeSubcodes
  )

  // Reverse lookup: any raw codeGuid (direct or subcode) → matching chosen codeGuids.
  const matchingChosenByRawCode = new Map<string, string[]>()
  for (const chosenGuid of selectedCodeGuids) {
    const members = expandCodes(data, [chosenGuid], includeSubcodes)
    for (const memberGuid of members) {
      const list = matchingChosenByRawCode.get(memberGuid) ?? []
      list.push(chosenGuid)
      matchingChosenByRawCode.set(memberGuid, list)
    }
  }

  const mapSelectionCodes = (sel: PlainTextSelection): string[] => {
    const matched = new Set<string>()
    for (const c of sel.codings) {
      const mapped = matchingChosenByRawCode.get(c.codeGuid)
      if (mapped) for (const g of mapped) matched.add(g)
    }
    return [...matched]
  }

  const itemLabels = new Map<string, string>()
  const unitLabels = new Map<string, string>()
  const unitSelections = new Map<string, IndexedSelection[]>()
  const itemSelections = new Map<string, IndexedSelection[]>()
  for (const code of data.codes) {
    if (selectedCodeGuids.includes(code.guid)) itemLabels.set(code.guid, code.name)
  }

  const sourceByGuid = new Map(data.sources.map((s) => [s.guid, s]))
  const units: { id: string; selections: string[][] }[] = []
  const overlapSources: OverlapSource[] = []
  let skippedNonTextSelections = 0

  const addUnitSelection = (unitId: string, entry: IndexedSelection): void => {
    const list = unitSelections.get(unitId) ?? []
    list.push(entry)
    unitSelections.set(unitId, list)
  }
  const addItemSelection = (itemId: string, entry: IndexedSelection): void => {
    const list = itemSelections.get(itemId) ?? []
    list.push(entry)
    itemSelections.set(itemId, list)
  }

  if (!selectedCodeGuids.length) {
    return {
      request: {
        units: [],
        codes: [],
        target,
        measure,
        linkage,
        minReferences: Math.max(1, minReferences)
      },
      target,
      unit: effectiveUnit,
      includeSubcodes,
      expandSurveyRespondents,
      itemLabels,
      unitLabels,
      unitSelections,
      itemSelections,
      skippedNonTextSelections: 0,
      hierarchyOverlaps
    }
  }

  for (const sourceGuid of sourceGuids) {
    const source = sourceByGuid.get(sourceGuid)
    const sourceName = source?.name ?? sourceGuid
    const sourceType = source?.sourceType ?? 'text'
    const rawSelections = data.sourceSelections[sourceGuid] ?? []

    const matchedSelections: IndexedSelection[] = []
    for (const selection of rawSelections) {
      const matchedCodes = mapSelectionCodes(selection)
      if (matchedCodes.length > 0) {
        matchedSelections.push({ sourceGuid, selection, matchedCodes })
      }
    }

    if (effectiveUnit === 'overlap') {
      itemLabels.set(sourceGuid, sourceName)
      for (const entry of matchedSelections) addItemSelection(sourceGuid, entry)
      if (matchedSelections.length > 0) {
        overlapSources.push({
          guid: sourceGuid,
          selections: matchedSelections.map((entry) => ({
            geometry: geometryForSelection(entry.selection),
            codes: entry.matchedCodes
          }))
        })
      }
      continue
    }

    if (effectiveUnit === 'document') {
      if (sourceType === 'survey' && expandSurveyRespondents) {
        const respLabels = data.surveyEntityLabels?.[sourceGuid]?.respondents ?? {}
        const respondentOrder: string[] = []
        const seenResp = new Set<string>()
        for (const cell of data.surveyCodableCells?.[sourceGuid] ?? []) {
          if (!seenResp.has(cell.respondentId)) {
            seenResp.add(cell.respondentId)
            respondentOrder.push(cell.respondentId)
          }
        }
        for (const entry of matchedSelections) {
          const rid = entry.selection.surveyCell?.respondentId
          if (rid && !seenResp.has(rid)) {
            seenResp.add(rid)
            respondentOrder.push(rid)
          }
        }
        const byResp = new Map<string, IndexedSelection[]>()
        for (const entry of matchedSelections) {
          const rid = entry.selection.surveyCell?.respondentId
          if (!rid) continue
          const arr = byResp.get(rid) ?? []
          arr.push(entry)
          byResp.set(rid, arr)
        }
        for (const rid of respondentOrder) {
          const id = respondentItemId(sourceGuid, rid)
          const label = `${sourceName} · ${respLabels[rid] ?? rid}`
          itemLabels.set(id, label)
          unitLabels.set(id, label)
          const entries = byResp.get(rid) ?? []
          for (const e of entries) {
            addUnitSelection(id, e)
            addItemSelection(id, e)
          }
          units.push({ id, selections: entries.map((e) => e.matchedCodes) })
        }
      } else {
        itemLabels.set(sourceGuid, sourceName)
        unitLabels.set(sourceGuid, sourceName)
        for (const e of matchedSelections) {
          addUnitSelection(sourceGuid, e)
          addItemSelection(sourceGuid, e)
        }
        units.push({ id: sourceGuid, selections: matchedSelections.map((e) => e.matchedCodes) })
      }
      continue
    }

    // Paragraph or Sentence segmentation (`effectiveUnit === 'paragraph' | 'sentence'`).
    const segment = effectiveUnit === 'paragraph' ? paragraphSpans : sentenceSpans
    const kindTag = effectiveUnit === 'paragraph' ? 'p' : 's'

    if (sourceType === 'survey') {
      const cells = data.surveyCodableCells?.[sourceGuid] ?? []
      const respLabels = data.surveyEntityLabels?.[sourceGuid]?.respondents ?? {}
      const qLabels = data.surveyEntityLabels?.[sourceGuid]?.questions ?? {}
      const byCell = new Map<string, IndexedSelection[]>()
      for (const entry of matchedSelections) {
        const cell = entry.selection.surveyCell
        if (!cell || entry.selection.endPosition <= entry.selection.startPosition) {
          skippedNonTextSelections++
          continue
        }
        const cellKey = `${cell.respondentId}\u0000${cell.questionId}`
        const arr = byCell.get(cellKey) ?? []
        arr.push(entry)
        byCell.set(cellKey, arr)
      }
      for (const cell of cells) {
        const cellKey = `${cell.respondentId}\u0000${cell.questionId}`
        const cellEntries = byCell.get(cellKey)
        if (!cellEntries?.length || !cell.text) continue
        const spans = segment(cell.text)
        spans.forEach((span, index) => {
          const touching = cellEntries.filter(
            (e) => e.selection.startPosition < span.end && e.selection.endPosition > span.start
          )
          if (touching.length === 0) return
          const unitId = `${sourceGuid}\u0000cell\u0000${cell.respondentId}\u0000${cell.questionId}\u0000${kindTag}\u0000${index}`
          const rName = respLabels[cell.respondentId] ?? cell.respondentId
          const qName = qLabels[cell.questionId] ?? cell.questionId
          unitLabels.set(unitId, `${sourceName} · ${rName} · ${qName} (#${index + 1})`)
          for (const e of touching) addUnitSelection(unitId, e)
          units.push({ id: unitId, selections: touching.map((e) => e.matchedCodes) })
        })
      }
      continue
    }

    const content = data.sourceContents[sourceGuid] ?? ''
    if (sourceType === 'image' || !content) {
      skippedNonTextSelections += matchedSelections.length
      continue
    }

    const textSelections: IndexedSelection[] = []
    for (const entry of matchedSelections) {
      if (entry.selection.pdfRegion || entry.selection.endPosition <= entry.selection.startPosition) {
        skippedNonTextSelections++
      } else {
        textSelections.push(entry)
      }
    }
    if (textSelections.length === 0) continue

    const spans = segment(content)
    spans.forEach((span, index) => {
      const touching = textSelections.filter(
        (e) => e.selection.startPosition < span.end && e.selection.endPosition > span.start
      )
      if (touching.length === 0) return
      const unitId = `${sourceGuid}\u0000${kindTag}\u0000${index}`
      unitLabels.set(unitId, `${sourceName} (#${index + 1})`)
      for (const e of touching) addUnitSelection(unitId, e)
      units.push({ id: unitId, selections: touching.map((e) => e.matchedCodes) })
    })
  }

  return {
    request: {
      units,
      ...(effectiveUnit === 'overlap' ? { overlapSources } : {}),
      codes: selectedCodeGuids,
      target,
      measure,
      linkage,
      minReferences: Math.max(1, minReferences)
    },
    target,
    unit: effectiveUnit,
    includeSubcodes,
    expandSurveyRespondents,
    itemLabels,
    unitLabels,
    unitSelections,
    itemSelections,
    skippedNonTextSelections,
    hierarchyOverlaps
  }
}
