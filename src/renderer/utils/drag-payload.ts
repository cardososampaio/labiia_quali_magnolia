/**
 * Items chosen in the Select Items dialog, delivered to a drop target as if
 * they had been dragged there.
 *
 * Most of the app is built around dragging codes, documents, tags and so on
 * onto drop zones. The "Select manually" buttons let people who prefer
 * dialogs pick the same items from a list instead. To make that behave
 * exactly like a drag — same validation, same placement, same undo step —
 * the chosen items are packed into the same payloads the drag sources write
 * (Code Browser, Document Browser, Saved Queries, Memos, Quotes, Saved
 * Analyses) and handed to the zone as a synthetic drop.
 *
 * Keep each builder in step with its drag source; a zone that reads a
 * payload the builder doesn't write would silently ignore the selection.
 */
import { t } from '../i18n'
import { RESPONDENTS_GROUP_MIME } from '../components/Analysis/group-by'

export type PickKind =
  | 'code'
  | 'document'
  | 'folder'
  | 'tag'
  | 'category'
  | 'query'
  | 'memo'
  | 'quote'
  | 'analysis'
  | 'survey-question'
  | 'survey-respondent'
  | 'respondents-group'

export interface PickedCode { guid: string; name: string; color?: string }
export interface PickedDocument { guid: string; name: string; sourceType?: string }
export interface PickedFolder { guid: string; name: string }
export interface PickedTag { guid: string; label: string }
export interface PickedCategory { guid: string; name: string; tagGuids: string[] }
export interface PickedQuery { guid: string; name: string }
export interface PickedMemo { guid: string; title: string; content: string }
export interface PickedQuote {
  guid: string
  sourceName: string
  text: string
  sourceGuid: string
  startPosition: number
  endPosition: number
  pdfRegion?: unknown
}
export interface PickedAnalysis { guid: string; name: string; toolType: string }
export interface PickedSurveyItem { surveyGuid: string; id: string; label: string }

/** What the dialog returns: the chosen items of each kind, in list order. */
export interface PickedItems {
  code?: PickedCode[]
  document?: PickedDocument[]
  folder?: PickedFolder[]
  tag?: PickedTag[]
  category?: PickedCategory[]
  query?: PickedQuery[]
  memo?: PickedMemo[]
  quote?: PickedQuote[]
  analysis?: PickedAnalysis[]
  'survey-question'?: PickedSurveyItem[]
  'survey-respondent'?: PickedSurveyItem[]
  'respondents-group'?: { surveyGuid: string; name: string }[]
}

/** One drop's worth of data: MIME type → string, as DataTransfer holds it. */
export type DropPayload = Record<string, string>

const json = (v: unknown): string => JSON.stringify(v)

/** JSON entity payload read by the relationship map and reports: a single
 *  entity, or a {kind:'multi'} wrapper when several travel together. */
function entityJson(items: Record<string, unknown>[]): string {
  return items.length === 1 ? json(items[0]) : json({ kind: 'multi', items })
}

/**
 * The drops a drag of these items would produce. Kinds the drag sources
 * carry several at a time (codes, documents, tags, queries) become one drop;
 * kinds dragged one by one (folders, categories, memos, quotes, analyses,
 * survey items) become one drop each.
 */
export function payloadsFor(picked: PickedItems): DropPayload[] {
  const drops: DropPayload[] = []

  if (picked.code?.length) {
    const codes = picked.code.map((c) => ({ guid: c.guid, name: c.name, color: c.color }))
    drops.push({
      'application/x-magnolia-code': json(codes[0]),
      'application/x-magnolia-codes': json(codes),
      'application/json': entityJson(codes.map((c) => ({ kind: 'code', entityGuid: c.guid, label: c.name, codeColor: c.color })))
    })
  }

  if (picked.document?.length) {
    drops.push({
      'application/x-magnolia-docs': json(picked.document.map((d) => d.guid)),
      'application/json': entityJson(picked.document.map((d) => ({
        kind: 'document', entityGuid: d.guid, label: d.name || t('Document'), sourceType: d.sourceType
      })))
    })
  }

  for (const f of picked.folder ?? []) {
    drops.push({
      'application/x-magnolia-folder': f.guid,
      'application/x-magnolia-folder-info': json({ guid: f.guid, name: f.name }),
      'application/json': json({ kind: 'folder', entityGuid: f.guid, label: f.name })
    })
  }

  if (picked.tag?.length) {
    drops.push({
      'application/x-magnolia-tag': json(picked.tag.map((tg) => tg.guid)),
      'application/json': entityJson(picked.tag.map((tg) => ({ kind: 'tag', entityGuid: tg.guid, label: tg.label })))
    })
  }

  for (const c of picked.category ?? []) {
    drops.push({
      'application/x-magnolia-tag': json(c.tagGuids),
      'application/x-magnolia-category': json({ categoryGuid: c.guid, name: c.name, tagGuids: c.tagGuids }),
      'application/json': json({ kind: 'tag-category', entityGuid: c.guid, label: c.name })
    })
  }

  if (picked.query?.length) {
    const items = picked.query.map((q) => ({ guid: q.guid, name: q.name }))
    drops.push({
      'application/x-magnolia-query': json(items.length === 1 ? items[0] : items),
      'application/json': entityJson(items.map((q) => ({ kind: 'query', entityGuid: q.guid, label: q.name })))
    })
  }

  for (const m of picked.memo ?? []) {
    drops.push({
      'application/x-magnolia-memo': json({ guid: m.guid }),
      'application/json': json({ kind: 'memo', entityGuid: m.guid, label: m.title, snippet: m.content })
    })
  }

  for (const q of picked.quote ?? []) {
    drops.push({
      'application/json': json({
        kind: 'quote',
        entityGuid: q.guid,
        label: q.sourceName,
        snippet: q.text,
        sourceGuid: q.sourceGuid,
        startPosition: q.startPosition,
        endPosition: q.endPosition,
        pdfRegion: q.pdfRegion
      })
    })
  }

  for (const a of picked.analysis ?? []) {
    drops.push({ 'application/json': json({ kind: 'analysis', entityGuid: a.guid, label: a.name, toolType: a.toolType }) })
  }

  for (const q of picked['survey-question'] ?? []) {
    drops.push({ 'application/json': json({ kind: 'survey-question', entityGuid: q.id, label: q.label, surveyGuid: q.surveyGuid }) })
  }

  for (const r of picked['survey-respondent'] ?? []) {
    drops.push({ 'application/json': json({ kind: 'survey-respondent', entityGuid: r.id, label: r.label, surveyGuid: r.surveyGuid }) })
  }

  for (const g of picked['respondents-group'] ?? []) {
    drops.push({ [RESPONDENTS_GROUP_MIME]: g.surveyGuid, 'text/plain': 'Respondents' })
  }

  return drops
}

/** Each chosen item as its own entity drop, for canvases such as the
 *  relationship map; pair with `spread` so they land side by side. */
export function entityPayloadsEach(picked: PickedItems): DropPayload[] {
  return payloadsFor(picked).flatMap((d) => {
    if (!d['application/json']) return []
    const e = JSON.parse(d['application/json'])
    return (e.kind === 'multi' ? e.items : [e]).map((item: unknown) => ({ 'application/json': json(item) }))
  })
}

/**
 * Hands each payload to `target` as a dragenter → dragover → drop sequence,
 * the events a real drag fires, aimed at the target's centre, or laid out
 * in a grid with `spread` (zones such as the relationship map place dropped
 * items at the pointer). Drops are spaced
 * out so a zone that keeps the dropped items in React state re-renders
 * between them instead of overwriting one with the next.
 */
export async function deliverAsDrop(target: Element, drops: DropPayload[], options: { spread?: boolean } = {}): Promise<void> {
  const SPREAD_COLS = 4
  for (const [i, payload] of drops.entries()) {
    const rect = target.getBoundingClientRect()
    // Spread drops lay items out in a grid from the upper left of the
    // target, so items placed at the pointer don't pile up on one spot.
    const x = options.spread ? rect.left + 140 + (i % SPREAD_COLS) * 220 : rect.left + rect.width / 2
    const y = options.spread ? rect.top + 60 + Math.floor(i / SPREAD_COLS) * 90 : rect.top + rect.height / 2
    const init = (dataTransfer: DataTransfer): DragEventInit => ({
      bubbles: true,
      cancelable: true,
      composed: true,
      dataTransfer,
      clientX: x,
      clientY: y
    })
    const dt = new DataTransfer()
    for (const [type, value] of Object.entries(payload)) dt.setData(type, value)
    dt.effectAllowed = 'copyMove'
    target.dispatchEvent(new DragEvent('dragenter', init(dt)))
    target.dispatchEvent(new DragEvent('dragover', init(dt)))
    target.dispatchEvent(new DragEvent('drop', init(dt)))
    target.dispatchEvent(new DragEvent('dragleave', init(dt)))
    await new Promise((resolve) => setTimeout(resolve, 60))
  }
}
