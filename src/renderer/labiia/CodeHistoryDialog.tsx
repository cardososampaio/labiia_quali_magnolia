/**
 * "Histórico dos códigos": every recorded change to the project's codes, in
 * the order it happened, with who made it and a justification the
 * researcher can write at any time. It can be filtered by code and by kind
 * of change, paused for the project, and exported as a spreadsheet or a
 * report (see code-history-model.ts for what is recorded).
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCodeStore } from '../stores/code-store'
import { useProjectStore } from '../stores/project-store'
import { type HistoryAction, type HistoryEntry, HISTORY_ACTIONS } from './code-history-model'
import { closeCodeHistory, setHistoryEnabled, setJustification, useCodeHistory, useCodeHistoryDialog } from './code-history-store'
import { actionLabel, entryDetails, exportHistoryCsv, exportHistoryMarkdown, formatWhen, originLabel } from './code-history-export'
import './code-history.css'

export function CodeHistoryDialog() {
  const open = useCodeHistoryDialog((s) => s.open)
  if (!open) return null
  return <CodeHistoryWindow />
}

function CodeHistoryWindow() {
  const { t } = useTranslation()
  const initialCode = useCodeHistoryDialog((s) => s.codeGuid)
  const history = useCodeHistory()
  const codes = useCodeStore((s) => s.codes)
  const projectName = useProjectStore((s) => s.name)
  const [codeGuid, setCodeGuid] = useState<string | undefined>(initialCode)
  const [query, setQuery] = useState('')
  const [action, setAction] = useState<HistoryAction | ''>('')
  const [newestFirst, setNewestFirst] = useState(true)
  const [busy, setBusy] = useState(false)

  const codeName = useMemo(() => {
    if (!codeGuid) return ''
    const found = [...history.entries].reverse().find((e) => e.codeGuid === codeGuid)
    return found?.codeName ?? ''
  }, [codeGuid, history.entries])

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    const list = history.entries.filter((e) => {
      if (codeGuid && e.codeGuid !== codeGuid && e.targetGuid !== codeGuid) return false
      if (action && e.action !== action) return false
      if (q) {
        const hay = [e.codeName, e.path, e.before, e.after, e.targetName, e.user, e.justification, ...(e.codes ?? []).map((c) => c.path)]
          .filter(Boolean).join(' ').toLocaleLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    return newestFirst ? [...list].reverse() : list
  }, [history.entries, codeGuid, action, query, newestFirst])

  const toggleEnabled = () => {
    if (history.enabled && !window.confirm(t('labiia.codeHistory.pauseConfirm'))) return
    setHistoryEnabled(!history.enabled)
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={closeCodeHistory}>
      <div className="modal labiia-history" role="dialog" aria-label={t('labiia.codeHistory.title')} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') closeCodeHistory() }}>
        <h2>{t('labiia.codeHistory.title')}</h2>
        <p className="labiia-history-intro">{t('labiia.codeHistory.intro')}</p>

        <label className="labiia-history-switch">
          <input type="checkbox" checked={history.enabled} onChange={toggleEnabled} />
          <span>{t('labiia.codeHistory.enabled')}</span>
        </label>
        {!history.enabled && <p className="labiia-history-paused">{t('labiia.codeHistory.pausedNotice')}</p>}

        <div className="labiia-history-filters">
          <input
            type="search"
            value={query}
            placeholder={t('labiia.codeHistory.search')}
            aria-label={t('labiia.codeHistory.search')}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select value={action} onChange={(e) => setAction(e.target.value as HistoryAction | '')} aria-label={t('labiia.codeHistory.filterAction')}>
            <option value="">{t('labiia.codeHistory.allActions')}</option>
            {HISTORY_ACTIONS.map((a) => <option key={a} value={a}>{t(`labiia.codeHistory.action.${a}`)}</option>)}
          </select>
          <select value={newestFirst ? 'new' : 'old'} onChange={(e) => setNewestFirst(e.target.value === 'new')} aria-label={t('labiia.codeHistory.order')}>
            <option value="new">{t('labiia.codeHistory.newestFirst')}</option>
            <option value="old">{t('labiia.codeHistory.oldestFirst')}</option>
          </select>
          {codeGuid && (
            <span className="labiia-history-chip">
              {t('labiia.codeHistory.onlyCode', { name: codeName || '…' })}
              <button className="labiia-history-chip-x" onClick={() => setCodeGuid(undefined)} title={t('labiia.codeHistory.showAll')} aria-label={t('labiia.codeHistory.showAll')}>×</button>
            </span>
          )}
        </div>

        <div className="labiia-history-table-wrap">
          {history.entries.length === 0 ? (
            <p className="labiia-history-empty">{t('labiia.codeHistory.emptyHistory')}</p>
          ) : rows.length === 0 ? (
            <p className="labiia-history-empty">{t('labiia.codeHistory.noMatch')}</p>
          ) : (
            <table className="labiia-history-table">
              <thead>
                <tr>
                  <th>{t('labiia.codeHistory.column.date')}</th>
                  <th>{t('labiia.codeHistory.column.user')}</th>
                  <th>{t('labiia.codeHistory.column.action')}</th>
                  <th>{t('labiia.codeHistory.column.code')}</th>
                  <th>{t('labiia.codeHistory.column.change')}</th>
                  <th>{t('labiia.codeHistory.column.justification')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => <HistoryRow key={e.id} entry={e} onPickCode={setCodeGuid} />)}
              </tbody>
            </table>
          )}
        </div>

        <div className="modal-actions">
          <button className="secondary" disabled={busy || history.entries.length === 0} onClick={() => void run(() => exportHistoryCsv(history, projectName))}>
            {t('labiia.codeHistory.exportCsv')}
          </button>
          <button className="secondary" disabled={busy || history.entries.length === 0} onClick={() => void run(() => exportHistoryMarkdown(history, projectName, codes))}>
            {t('labiia.codeHistory.exportReport')}
          </button>
          <button onClick={closeCodeHistory}>{t('labiia.codeHistory.close')}</button>
        </div>
      </div>
    </div>
  )
}

function HistoryRow({ entry: e, onPickCode }: { entry: HistoryEntry; onPickCode: (guid: string) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(e.justification ?? '')
  const empty = t('labiia.codeHistory.empty')
  let change = ''
  if (e.action === 'merged') change = `→ ${e.targetName ?? ''}`
  else if (e.before !== undefined && e.after !== undefined) change = `${e.before || empty} → ${e.after || empty}`
  else if (e.after !== undefined) change = e.after
  else if (e.before !== undefined) change = e.before
  const details = entryDetails(e)
  const origin = e.origin !== 'edit' && e.origin !== 'undo' && e.origin !== 'redo' ? originLabel(e) : ''
  return (
    <tr className={e.origin === 'undo' || e.origin === 'redo' ? 'labiia-history-undo' : undefined}>
      <td className="labiia-history-when">{formatWhen(e.at)}</td>
      <td>{e.user || '—'}</td>
      <td>
        <span className={`labiia-history-action labiia-history-action-${e.action}`}>{actionLabel(e)}</span>
        {origin && <div className="labiia-history-muted">{origin}</div>}
      </td>
      <td>
        {e.codeGuid ? (
          <button className="labiia-history-link" title={t('labiia.codeHistory.filterThisCode')} onClick={() => onPickCode(e.codeGuid!)}>
            {e.codeName}
          </button>
        ) : null}
        {e.path && e.path !== e.codeName && <div className="labiia-history-muted">{e.path}</div>}
        {e.codes && (
          <details>
            <summary>{details}</summary>
            <ul className="labiia-history-codes">{e.codes.map((c) => <li key={c.guid}>{c.path}</li>)}</ul>
          </details>
        )}
      </td>
      <td>
        <div className="labiia-history-change">{change}</div>
        {!e.codes && details && <div className="labiia-history-muted">{details}</div>}
      </td>
      <td>
        <textarea
          className="labiia-history-why"
          rows={1}
          value={draft}
          placeholder={t('labiia.codeHistory.justificationPlaceholder')}
          aria-label={t('labiia.codeHistory.column.justification')}
          onChange={(ev) => setDraft(ev.target.value)}
          onBlur={() => { if (draft !== (e.justification ?? '')) setJustification(e.id, draft) }}
        />
      </td>
    </tr>
  )
}
