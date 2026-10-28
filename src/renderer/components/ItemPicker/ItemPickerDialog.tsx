/**
 * Select Items — a dialog alternative to dragging.
 *
 * Wherever the app expects items to be dragged in (codes onto an analysis
 * grid, documents into the document selector, memos onto a report…), a
 * "Select manually" button opens this dialog instead. The left column lists
 * the kinds of item that place accepts; the right column lists the items of
 * the chosen kind with checkboxes, a search box and Select all / Clear.
 * Choices in several kinds are kept together and returned on OK.
 *
 * Item lists come from the project stores. Analysis tools pass their own
 * data snapshot instead, so the dialog also works in a popped-out window,
 * whose stores are not loaded.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { AnalysisInitData } from '../../models/types'
import { useCodeStore } from '../../stores/code-store'
import { useDocumentStore } from '../../stores/document-store'
import { useTagStore } from '../../stores/tag-store'
import { useQueryStore } from '../../stores/query-store'
import { useMemoStore } from '../../stores/memo-store'
import { useQuoteStore } from '../../stores/quote-store'
import { useProjectStore } from '../../stores/project-store'
import { buildSurveyEntityLabels } from '../../utils/survey/survey-labels'
import { foldForSearch } from '../../utils/apply-coding'
import type { PickKind, PickedItems } from '../../utils/drag-payload'
import { t, formatNumber } from '../../i18n'
import './ItemPicker.css'

const KIND_LABEL: Record<PickKind, () => string> = {
  code: () => t('Codes'),
  document: () => t('Documents'),
  folder: () => t('Folders'),
  tag: () => t('Tags'),
  category: () => t('Tag Categories'),
  query: () => t('Saved Queries'),
  memo: () => t('Memos'),
  quote: () => t('Quotes'),
  analysis: () => t('Saved Analyses'),
  'survey-question': () => t('Survey questions'),
  'survey-respondent': () => t('Survey respondents'),
  'respondents-group': () => t('Respondents of a survey')
}

/** One selectable row. `payload` is what goes into PickedItems on OK. */
interface Row {
  key: string
  label: string
  detail?: string
  depth: number
  color?: string
  /** Keys of the rows nested under this one (codes and folders). */
  descendants?: string[]
  payload: unknown
}

export interface ItemPickerDialogProps {
  title?: string
  /** Kinds this place accepts, in the order they are listed. */
  kinds: PickKind[]
  /** Analysis tools pass their data snapshot (see the file comment). */
  data?: AnalysisInitData
  /** Label of the confirm button; defaults to "OK". */
  confirmLabel?: string
  /** Extra controls shown above the buttons (e.g. how query codes combine). */
  extra?: ReactNode
  /** Asks for at least one item before OK is enabled; on by default. */
  requireSelection?: boolean
  onConfirm: (picked: PickedItems, options: { includeSubcodes: boolean }) => void
  onCancel: () => void
}

function useRows(kinds: PickKind[], data?: AnalysisInitData): Record<PickKind, Row[]> {
  const storeCodes = useCodeStore((s) => s.codes)
  const storeSources = useDocumentStore((s) => s.sources)
  const storeFolders = useDocumentStore((s) => s.folders)
  const storeTags = useTagStore((s) => s.tags)
  const storeCategories = useTagStore((s) => s.categories)
  const savedQueries = useQueryStore((s) => s.savedQueries)
  const memos = useMemoStore((s) => s.memos)
  const quotes = useQuoteStore((s) => s.quotes)
  const savedAnalyses = useProjectStore((s) => s.savedAnalyses)

  return useMemo(() => {
    const rows = {} as Record<PickKind, Row[]>
    const want = new Set(kinds)

    // Codes and folders are trees: children follow their parent, indented.
    const tree = <T extends { guid: string; parentGuid?: string | null }>(
      items: T[],
      toRow: (item: T, depth: number) => Omit<Row, 'depth' | 'descendants'>
    ): Row[] => {
      const byParent = new Map<string, T[]>()
      const known = new Set(items.map((i) => i.guid))
      for (const it of items) {
        const p = it.parentGuid && known.has(it.parentGuid) ? it.parentGuid : ''
        byParent.set(p, [...(byParent.get(p) ?? []), it])
      }
      const out: Row[] = []
      const walk = (parent: string, depth: number): string[] => {
        const keys: string[] = []
        for (const it of byParent.get(parent) ?? []) {
          const row: Row = { ...toRow(it, depth), depth }
          out.push(row)
          const sub = walk(it.guid, depth + 1)
          row.descendants = sub
          keys.push(row.key, ...sub)
        }
        return keys
      }
      walk('', 0)
      return out
    }

    if (want.has('code')) {
      const flat = data
        ? data.codes
        : (() => {
            const acc: { guid: string; name: string; color?: string; parentGuid?: string }[] = []
            const visit = (cs: typeof storeCodes, parent?: string): void => {
              for (const c of cs) { acc.push({ guid: c.guid, name: c.name, color: c.color, parentGuid: parent }); visit(c.children, c.guid) }
            }
            visit(storeCodes)
            return acc
          })()
      rows.code = tree(flat, (c) => ({ key: c.guid, label: c.name, color: c.color || '#888', payload: { guid: c.guid, name: c.name, color: c.color } }))
    }

    const sources = data ? data.sources : storeSources
    const surveyName = new Map(sources.map((s) => [s.guid, s.name]))
    if (want.has('document')) {
      rows.document = sources.map((s) => ({
        key: s.guid,
        label: s.name,
        depth: 0,
        payload: { guid: s.guid, name: s.name, sourceType: (s as { sourceType?: string }).sourceType }
      }))
    }

    if (want.has('folder')) {
      const folders = data ? data.folders : storeFolders
      rows.folder = tree(folders, (f) => ({ key: f.guid, label: f.name, payload: { guid: f.guid, name: f.name } }))
    }

    const tags = data ? data.tags : storeTags
    const categories = data ? data.categories : storeCategories
    const categoryName = new Map(categories.map((c) => [c.guid, c.name]))
    if (want.has('tag')) {
      rows.tag = [...tags]
        .sort((a, b) => (categoryName.get(a.categoryGuid ?? '') ?? '').localeCompare(categoryName.get(b.categoryGuid ?? '') ?? ''))
        .map((tg) => ({
          key: tg.guid,
          label: tg.value || tg.name,
          detail: categoryName.get(tg.categoryGuid ?? ''),
          depth: 0,
          payload: { guid: tg.guid, label: tg.value || tg.name }
        }))
    }
    if (want.has('category')) {
      rows.category = categories.map((c) => {
        const tagGuids = tags.filter((tg) => tg.categoryGuid === c.guid).map((tg) => tg.guid)
        return {
          key: c.guid,
          label: c.name,
          detail: t('{{count}} tags', { count: formatNumber(tagGuids.length) }),
          depth: 0,
          payload: { guid: c.guid, name: c.name, tagGuids }
        }
      })
    }

    if (want.has('query')) {
      rows.query = savedQueries.map((q) => ({ key: q.guid, label: q.name, depth: 0, payload: { guid: q.guid, name: q.name } }))
    }
    if (want.has('memo')) {
      rows.memo = memos.map((m) => ({
        key: m.guid,
        label: m.title || t('Untitled Memo'),
        depth: 0,
        payload: { guid: m.guid, title: m.title, content: m.content }
      }))
    }
    if (want.has('quote')) {
      rows.quote = quotes.map((q) => ({
        key: q.guid,
        label: q.text.replace(/\s+/g, ' ').slice(0, 140),
        detail: q.sourceName,
        depth: 0,
        payload: {
          guid: q.guid, sourceName: q.sourceName, text: q.text, sourceGuid: q.sourceGuid,
          startPosition: q.startPosition, endPosition: q.endPosition, pdfRegion: q.pdfRegion
        }
      }))
    }
    if (want.has('analysis')) {
      rows.analysis = (savedAnalyses ?? []).map((a) => ({ key: a.guid, label: a.name, depth: 0, payload: { guid: a.guid, name: a.name, toolType: a.toolType } }))
    }

    if (want.has('survey-question') || want.has('survey-respondent') || want.has('respondents-group')) {
      const labels = data?.surveyEntityLabels ?? buildSurveyEntityLabels(storeSources)
      const surveys = Object.keys(labels)
      if (want.has('survey-question')) {
        rows['survey-question'] = surveys.flatMap((sg) => Object.entries(labels[sg].questions).map(([id, text]) => ({
          key: `${sg}:${id}`, label: text, detail: surveyName.get(sg), depth: 0, payload: { surveyGuid: sg, id, label: text }
        })))
      }
      if (want.has('survey-respondent')) {
        rows['survey-respondent'] = surveys.flatMap((sg) => Object.entries(labels[sg].respondents).map(([id, name]) => ({
          key: `${sg}:${id}`, label: name, detail: surveyName.get(sg), depth: 0, payload: { surveyGuid: sg, id, label: name }
        })))
      }
      if (want.has('respondents-group')) {
        rows['respondents-group'] = surveys.map((sg) => ({
          key: sg, label: surveyName.get(sg) ?? sg, depth: 0, payload: { surveyGuid: sg, name: surveyName.get(sg) ?? '' }
        }))
      }
    }

    for (const k of kinds) rows[k] ??= []
    return rows
  }, [kinds, data, storeCodes, storeSources, storeFolders, storeTags, storeCategories, savedQueries, memos, quotes, savedAnalyses])
}

export function ItemPickerDialog({
  title, kinds, data, confirmLabel, extra, requireSelection = true, onConfirm, onCancel
}: ItemPickerDialogProps) {
  const rows = useRows(kinds, data)
  const [kind, setKind] = useState<PickKind>(() => kinds.find((k) => (rows[k]?.length ?? 0) > 0) ?? kinds[0])
  const [checked, setChecked] = useState<Partial<Record<PickKind, Set<string>>>>({})
  const [query, setQuery] = useState('')
  const [autoSubcodes, setAutoSubcodes] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { searchRef.current?.focus() }, [kind])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  const current = rows[kind] ?? []
  const q = foldForSearch(query.trim())
  const visible = q ? current.filter((r) => foldForSearch(`${r.label} ${r.detail ?? ''}`).includes(q)) : current
  const sel = checked[kind] ?? new Set<string>()
  const total = kinds.reduce((n, k) => n + (checked[k]?.size ?? 0), 0)

  const update = (k: PickKind, next: Set<string>): void => setChecked((prev) => ({ ...prev, [k]: next }))
  const toggle = (row: Row): void => {
    const next = new Set(sel)
    const on = !next.has(row.key)
    // "Select subitems automatically" carries the tick down the tree, as in
    // other QDA tools; off, every row is ticked on its own.
    const keys = autoSubcodes && row.descendants?.length ? [row.key, ...row.descendants] : [row.key]
    for (const key of keys) on ? next.add(key) : next.delete(key)
    update(kind, next)
  }
  const selectAll = (): void => update(kind, new Set([...sel, ...visible.map((r) => r.key)]))
  const clear = (): void => update(kind, new Set([...sel].filter((key) => !visible.some((r) => r.key === key))))

  const confirm = (): void => {
    const picked: PickedItems = {}
    for (const k of kinds) {
      const keys = checked[k]
      if (!keys?.size) continue
      ;(picked as Record<string, unknown[]>)[k] = (rows[k] ?? []).filter((r) => keys.has(r.key)).map((r) => r.payload)
    }
    onConfirm(picked, { includeSubcodes: autoSubcodes })
  }

  const hasTree = kind === 'code' || kind === 'folder'

  return createPortal(
    <div className="modal-overlay ip-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal ip-dialog" role="dialog" aria-modal="true" aria-label={title ?? t('Select items')}>
        <h2 className="ip-title">{title ?? t('Select items')}</h2>

        <div className="ip-body">
          {kinds.length > 1 && (
            <div className="ip-kinds" role="tablist">
              {kinds.map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={k === kind}
                  className={`ip-kind${k === kind ? ' active' : ''}`}
                  onClick={() => { setKind(k); setQuery('') }}
                >
                  <span className="ip-kind-name">{KIND_LABEL[k]()}</span>
                  {(checked[k]?.size ?? 0) > 0 && <span className="ip-badge">{formatNumber(checked[k]!.size)}</span>}
                </button>
              ))}
            </div>
          )}

          <div className="ip-main">
            <div className="ip-toolbar">
              <input
                ref={searchRef}
                className="ip-search"
                value={query}
                placeholder={t('Search...')}
                aria-label={t('Search')}
                onChange={(e) => setQuery(e.target.value)}
              />
              {hasTree && (
                <label className="ip-option">
                  <input type="checkbox" checked={autoSubcodes} onChange={(e) => setAutoSubcodes(e.target.checked)} />
                  {kind === 'code' ? t('Select subcodes automatically') : t('Select subfolders automatically')}
                </label>
              )}
            </div>

            <div className="ip-list" role="listbox" aria-multiselectable="true">
              {visible.map((r) => (
                <label key={r.key} className={`ip-row${sel.has(r.key) ? ' checked' : ''}`} style={{ paddingLeft: 10 + (q ? 0 : r.depth) * 18 }}>
                  <input type="checkbox" checked={sel.has(r.key)} onChange={() => toggle(r)} />
                  {r.color && <span className="color-pip" style={{ background: r.color }} />}
                  <span className="ip-label" title={r.label}>{r.label}</span>
                  {r.detail && <span className="ip-detail">{r.detail}</span>}
                </label>
              ))}
              {visible.length === 0 && (
                <div className="ip-empty">{current.length === 0 ? t('Nothing of this kind in the project yet.') : t('Nothing matches this search.')}</div>
              )}
            </div>

            <div className="ip-list-actions">
              <button className="secondary" onClick={selectAll} disabled={visible.length === 0}>{t('Select All')}</button>
              <button className="secondary" onClick={clear} disabled={sel.size === 0}>{t('Clear')}</button>
              <span className="ip-count">{t('{{count}} selected', { count: formatNumber(total) })}</span>
            </div>
          </div>
        </div>

        {extra && <div className="ip-extra">{extra}</div>}

        <div className="ip-footer">
          <button className="secondary" onClick={onCancel}>{t('Cancel')}</button>
          <button onClick={confirm} disabled={requireSelection && total === 0}>{confirmLabel ?? t('OK')}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
