/**
 * Quick coding — code a selection without dragging.
 *
 * Selecting something in any document (text, a PDF or image region, video
 * transcript lines, survey answers) shows a small "apply code" bubble next to
 * the pointer. Clicking it opens the coding bar at the bottom of the window:
 *
 *   [position] [search code] [Code in…] [Last] [New] [New in vivo] [recent codes…]
 *
 * "Code in…" opens the code picker with every code in the project and "New"
 * opens the New Code dialog. The bar closes once a code is applied, and also
 * with ×, Esc, or when the selection goes away; selecting again brings the
 * bubble back for the next code. Dragging codes onto a selection and the
 * Ctrl+number hotkeys keep working as before.
 *
 * Codes are applied through applyCodeToSelection, the same path the New Code
 * dialog uses, so they land exactly as a drop would. When another person has
 * the project checked out, applying asks the user to take control first, as
 * every other editing action does.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Code } from '../../models/types'
import { usePendingSelectionStore, type PendingSelection } from '../../stores/pending-selection-store'
import { useCodeStore } from '../../stores/code-store'
import { useRecentCodesStore } from '../../stores/recent-codes-store'
import { useNewCodeTriggerStore } from '../../stores/new-code-trigger-store'
import { useCheckoutLockedBy, useProjectStore } from '../../stores/project-store'
import { useCodeColourPresets, nextCodeColour } from '../../utils/code-colours'
import {
  applyCodeToSelection,
  flattenCodeTree,
  foldForSearch,
  inVivoCodeName,
  selectionPositionLabel,
  selectionText,
  type FlatCode
} from '../../utils/apply-coding'
import { t } from '../../i18n'
import './QuickCoding.css'

/** Recent-code shortcuts shown in the bar. */
const BAR_SHORTCUTS = 5
/** The bubble only follows a mouse release this recent; keyboard selections
 *  and programmatic ones don't pop a bubble at a stale spot. */
const POINTER_FRESH_MS = 1500

/** Stable identity for a selection, so a viewer re-publishing the same
 *  selection (e.g. after a click on the bar) doesn't reset the bubble. */
function selectionKey(ps: PendingSelection): string {
  if (ps.kind === 'text') return `text:${ps.sourceGuid}:${ps.startCp}-${ps.endCp}`
  if (ps.kind === 'region') {
    const r = ps.pdfRegion
    return `region:${ps.sourceGuid}:${r.page}:${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`
  }
  return `cells:${ps.sourceGuid}:${ps.cells.map((c) => `${c.respondentId}/${c.questionId}/${c.start}-${c.end}`).join('|')}`
}

/** Keeps the selection highlighted: buttons take the click without moving
 *  focus out of the document, so the native text selection survives. */
const keepSelection = (e: React.MouseEvent): void => {
  if (!(e.target as HTMLElement).closest('input')) e.preventDefault()
}

function useFlatCodes(): FlatCode[] {
  const codes = useCodeStore((s) => s.codes)
  return useMemo(() => flattenCodeTree(codes), [codes])
}

function useRecentCodes(flat: FlatCode[]): Code[] {
  const recentGuids = useRecentCodesStore((s) => s.codeGuids)
  return useMemo(() => {
    const byGuid = new Map(flat.map((f) => [f.code.guid, f.code]))
    return recentGuids.map((g) => byGuid.get(g)).filter((c): c is Code => !!c && c.isCodable !== false)
  }, [flat, recentGuids])
}

function matchCodes(flat: FlatCode[], query: string): FlatCode[] {
  const q = foldForSearch(query.trim())
  if (!q) return []
  const hits = flat.filter((f) => f.code.isCodable !== false && foldForSearch(f.code.name).includes(q))
  // Names that start with the query first, then the rest in tree order.
  return [...hits.filter((f) => foldForSearch(f.code.name).startsWith(q)), ...hits.filter((f) => !foldForSearch(f.code.name).startsWith(q))]
}

function Swatch({ color }: { color?: string }) {
  return <span className="qc-swatch" style={{ background: color || 'var(--text-muted)' }} />
}

export function QuickCoding() {
  const selection = usePendingSelectionStore((s) => s.selection)
  const lockedBy = useCheckoutLockedBy()
  const flat = useFlatCodes()
  const recent = useRecentCodes(flat)
  const presets = useCodeColourPresets()

  const [mode, setMode] = useState<'hidden' | 'bubble' | 'bar'>('hidden')
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const lastPointer = useRef<{ x: number; y: number; at: number } | null>(null)
  const lastKey = useRef<string | null>(null)
  const dismissedKey = useRef<string | null>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode

  // Remember where the mouse was released; selections are published on mouseup.
  useEffect(() => {
    const onUp = (e: MouseEvent): void => {
      if (e.button === 0) lastPointer.current = { x: e.clientX, y: e.clientY, at: Date.now() }
    }
    window.addEventListener('mouseup', onUp, true)
    return () => window.removeEventListener('mouseup', onUp, true)
  }, [])

  // React to selections appearing, changing and going away.
  useEffect(() => {
    if (!selection) {
      lastKey.current = null
      dismissedKey.current = null
      setMode('hidden')
      setPickerOpen(false)
      return
    }
    const key = selectionKey(selection)
    if (key === lastKey.current) return
    lastKey.current = key
    // An open bar follows the new selection, ready for the next code.
    if (modeRef.current === 'bar') return
    const p = lastPointer.current
    if (!p || Date.now() - p.at > POINTER_FRESH_MS || dismissedKey.current === key) {
      setMode('hidden')
      return
    }
    setAnchor({ x: p.x, y: p.y })
    setMode('bubble')
  }, [selection])

  const close = useCallback(() => {
    if (selection) dismissedKey.current = selectionKey(selection)
    setMode('hidden')
    setPickerOpen(false)
  }, [selection])

  useEffect(() => {
    if (mode === 'hidden') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (pickerOpen) setPickerOpen(false)
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, pickerOpen, close])

  const apply = useCallback((code: Code) => {
    const ps = usePendingSelectionStore.getState().selection
    if (!ps) return
    if (lockedBy) { useProjectStore.getState().promptCheckoutConflict(); return }
    applyCodeToSelection(ps, code.guid)
    // Done with this passage: the code now shows in the margin, and the
    // bubble stays away until the user selects something else.
    dismissedKey.current = selectionKey(ps)
    setMode('hidden')
    setPickerOpen(false)
  }, [lockedBy])

  /** Opens the New Code dialog; App applies the created code to the
   *  pending selection, as it does for the Code Browser's + button. */
  const openNewCodeDialog = useCallback(() => {
    close()
    useNewCodeTriggerStore.getState().request()
  }, [close])

  /** Creates a code (optionally under a parent) and applies it. A code with
   *  the same name at the same level is reused instead of duplicated. */
  const createAndApply = useCallback((rawName: string, parentGuid?: string) => {
    const name = rawName.trim()
    if (!name) return
    if (lockedBy) { useProjectStore.getState().promptCheckoutConflict(); return }
    const store = useCodeStore.getState()
    const siblings = parentGuid ? store.findCode(parentGuid)?.children ?? [] : store.codes
    const same = siblings.find((c) => foldForSearch(c.name) === foldForSearch(name))
    if (same) { apply(same); return }
    const all = store.flatCodes()
    const color = nextCodeColour(presets, all[all.length - 1]?.color)
    const guid = store.addCode(name, color, parentGuid)
    const created = useCodeStore.getState().findCode(guid)
    if (created) apply(created)
  }, [apply, lockedBy, presets])

  if (!selection || mode === 'hidden') return null

  if (mode === 'bubble' && anchor) {
    const left = Math.min(Math.max(8, anchor.x - 70), window.innerWidth - 190)
    const top = anchor.y - 52 < 8 ? anchor.y + 18 : anchor.y - 52
    return createPortal(
      <div className="qc-bubble" style={{ left, top }} onMouseDown={keepSelection} onMouseUpCapture={(e) => e.stopPropagation()}>
        <button className="qc-bubble-main" onClick={() => setMode('bar')}>
          {t('apply code')} <span aria-hidden className="qc-caret">▾</span>
        </button>
        <button className="qc-bubble-close" aria-label={t('Close')} title={t('Close')} onClick={close}>×</button>
      </div>,
      document.body
    )
  }

  return createPortal(
    <CodingBar
      selection={selection}
      flat={flat}
      recent={recent}
      pickerOpen={pickerOpen}
      setPickerOpen={setPickerOpen}
      onApply={apply}
      onNewCode={openNewCodeDialog}
      onCreate={createAndApply}
      onClose={close}
    />,
    document.body
  )
}

interface CodingBarProps {
  selection: PendingSelection
  flat: FlatCode[]
  recent: Code[]
  pickerOpen: boolean
  setPickerOpen: (open: boolean) => void
  onApply: (code: Code) => void
  onNewCode: () => void
  onCreate: (name: string, parentGuid?: string) => void
  onClose: () => void
}

function CodingBar({ selection, flat, recent, pickerOpen, setPickerOpen, onApply, onNewCode, onCreate, onClose }: CodingBarProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const matches = useMemo(() => matchCodes(flat, query).slice(0, 8), [flat, query])
  const text = selectionText(selection)
  const inVivoName = text ? inVivoCodeName(text) : ''

  // Viewers listen for mouse releases anywhere in the document to finish or
  // clear their selection; a click on the bar must not count as one.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const stop = (e: MouseEvent): void => e.stopPropagation()
    el.addEventListener('mouseup', stop)
    return () => el.removeEventListener('mouseup', stop)
  }, [])

  useEffect(() => setActive(0), [query])

  const applyAndReset = (code: Code): void => {
    onApply(code)
    setQuery('')
  }

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (active < matches.length) applyAndReset(matches[active].code)
      else if (query.trim()) { onCreate(query); setQuery('') }
    } else if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery('') }
  }

  const showSuggestions = query.trim().length > 0

  return (
    <div ref={rootRef} className="qc-bar" role="toolbar" aria-label={t('Coding bar')} onMouseDown={keepSelection}>
      <span className="qc-position" title={t('Position of the selection')}>{selectionPositionLabel(selection)}</span>

      <div className="qc-search">
        <input
          className="qc-input"
          value={query}
          placeholder={t('Search code')}
          aria-label={t('Search code')}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
        />
        {showSuggestions && (
          <div className="qc-suggestions" role="listbox">
            {matches.map((f, i) => (
              <button
                key={f.code.guid}
                role="option"
                aria-selected={i === active}
                className={`qc-suggestion${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => applyAndReset(f.code)}
              >
                <Swatch color={f.code.color} />
                <span className="qc-name">{f.code.name}</span>
                {f.path.length > 0 && <span className="qc-path">{f.path.join(' › ')}</span>}
              </button>
            ))}
            <button
              className={`qc-suggestion qc-create${active === matches.length ? ' active' : ''}`}
              onMouseEnter={() => setActive(matches.length)}
              onClick={() => { onCreate(query); setQuery('') }}
            >
              {t('+ Create code “{{name}}”', { name: query.trim() })}
            </button>
          </div>
        )}
      </div>

      <div className="qc-picker-anchor">
        <button className={`qc-btn${pickerOpen ? ' pressed' : ''}`} onClick={() => setPickerOpen(!pickerOpen)} aria-expanded={pickerOpen}>
          {t('Code in…')}
        </button>
        {pickerOpen && (
          <CodePicker
            selectionText={text}
            flat={flat}
            recent={recent}
            onApply={onApply}
            onCreate={onCreate}
            onNewCode={onNewCode}
          />
        )}
      </div>

      <button
        className="qc-btn"
        disabled={recent.length === 0}
        title={recent[0] ? t('Apply “{{name}}” again', { name: recent[0].name }) : t('No code applied yet')}
        onClick={() => recent[0] && onApply(recent[0])}
      >
        {t('Last')}
      </button>

      <button className="qc-btn" title={t('Create a new code and apply it to the selection')} onClick={onNewCode}>
        {t('New')}
      </button>

      {inVivoName && (
        <button className="qc-btn" title={t('Create a code named “{{name}}” and apply it', { name: inVivoName })} onClick={() => onCreate(inVivoName)}>
          {t('New in vivo')}
        </button>
      )}

      {recent.slice(0, BAR_SHORTCUTS).map((code) => (
        <button
          key={code.guid}
          className="qc-chip"
          style={{ borderLeftColor: code.color || 'var(--text-muted)' }}
          title={t('Apply “{{name}}”', { name: code.name })}
          onClick={() => onApply(code)}
        >
          {code.name}
        </button>
      ))}

      <button className="qc-close" aria-label={t('Close coding bar')} title={t('Close coding bar')} onClick={onClose}>×</button>
    </div>
  )
}

interface CodePickerProps {
  selectionText: string
  flat: FlatCode[]
  recent: Code[]
  onApply: (code: Code) => void
  onCreate: (name: string, parentGuid?: string) => void
  onNewCode: () => void
}

/** Every code in the project, with search, the recently used ones on top,
 *  rename (pencil) and new subcode (+) on each row. */
function CodePicker({ selectionText, flat, recent, onApply, onCreate, onNewCode }: CodePickerProps) {
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [addingUnder, setAddingUnder] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { searchRef.current?.focus() }, [])

  const q = foldForSearch(query.trim())
  const rows = q ? flat.filter((f) => foldForSearch(f.code.name).includes(q)) : flat
  const preview = selectionText.replace(/\s+/g, ' ').trim()

  const startRename = (code: Code): void => { setAddingUnder(null); setRenaming(code.guid); setDraft(code.name) }
  const startAdd = (code: Code): void => { setRenaming(null); setAddingUnder(code.guid); setDraft('') }
  const finishEdit = (): void => {
    const name = draft.trim()
    if (renaming && name) useCodeStore.getState().renameCode(renaming, name)
    if (addingUnder && name) onCreate(name, addingUnder)
    setRenaming(null)
    setAddingUnder(null)
    setDraft('')
  }
  const editKeys = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') { e.preventDefault(); finishEdit() }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRenaming(null); setAddingUnder(null) }
  }

  const row = (code: Code, depth: number, keyPrefix: string) => {
    const codable = code.isCodable !== false
    return (
      <div key={keyPrefix + code.guid}>
        <div className="qc-row" style={{ paddingLeft: 10 + depth * 16 }}>
          {renaming === code.guid ? (
            <input className="qc-input qc-inline" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} onKeyDown={editKeys} onBlur={finishEdit} aria-label={t('Code name')} />
          ) : (
            <button
              className="qc-row-main"
              disabled={!codable}
              title={codable ? t('Apply “{{name}}”', { name: code.name }) : t('This code is a category and cannot be applied')}
              onClick={() => onApply(code)}
            >
              <Swatch color={code.color} />
              <span className="qc-name">{code.name}</span>
            </button>
          )}
          <button className="qc-icon" title={t('Rename')} aria-label={t('Rename “{{name}}”', { name: code.name })} onClick={() => startRename(code)}>✎</button>
          <button className="qc-icon" title={t('New subcode')} aria-label={t('New subcode of “{{name}}”', { name: code.name })} onClick={() => startAdd(code)}>+</button>
        </div>
        {addingUnder === code.guid && (
          <div className="qc-row" style={{ paddingLeft: 26 + depth * 16 }}>
            <input className="qc-input qc-inline" value={draft} autoFocus placeholder={t('Subcode name')} onChange={(e) => setDraft(e.target.value)} onKeyDown={editKeys} onBlur={finishEdit} aria-label={t('Subcode name')} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="qc-picker" role="dialog" aria-label={t('Codes')}>
      {preview && <div className="qc-preview" title={preview}>“{preview}”</div>}
      <input
        ref={searchRef}
        className="qc-input qc-picker-search"
        value={query}
        placeholder={t('search code...')}
        aria-label={t('Search code')}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const first = rows.find((f) => f.code.isCodable !== false)
            if (first) onApply(first.code)
          }
        }}
      />
      <div className="qc-list">
        {!q && recent.length > 0 && (
          <>
            <div className="qc-heading">{t('Recent')}</div>
            {recent.map((code) => row(code, 0, 'recent-'))}
            <div className="qc-heading">{t('All codes')}</div>
          </>
        )}
        {rows.map((f) => row(f.code, q ? 0 : f.depth, ''))}
        {rows.length === 0 && (
          <div className="qc-empty">{flat.length === 0 ? t('No codes yet.') : t('No code matches this search.')}</div>
        )}
      </div>
      <button className="qc-new" onClick={onNewCode}>
        {t('+ Create new code')}
      </button>
    </div>
  )
}
