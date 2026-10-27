import { useState, useCallback, useEffect } from 'react'
import { Markdown } from '../Markdown'
import { MarkdownEditor } from '../MarkdownEditor'
import type { LogbookEntry, LogbookInitData } from '../../models/types'
import { generateGuid } from '../../utils/guid'
import { exportPdfWithHeader, buildPdfDocument, escHtml } from '../../utils/pdf-export'
import { t } from '../../i18n'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function EntryRow({
  entry,
  isSelected,
  onClick,
  onDoubleClick
}: {
  entry: LogbookEntry
  isSelected: boolean
  onClick: () => void
  onDoubleClick: () => void
}) {
  return (
    <div
      style={{
        padding: '6px 10px',
        borderBottom: '1px solid var(--border-color)',
        cursor: 'pointer',
        background: isSelected ? 'var(--selection-bg)' : undefined,
        transition: 'background 0.1s'
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div style={{
        fontWeight: 600,
        fontSize: 'var(--font-size-sm)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}>
        {entry.title || t("Untitled Entry")}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
        {formatDate(entry.createdDateTime)}
        {entry.modifiedDateTime && (
          <span> {t("· edited")}{' '}{formatDate(entry.modifiedDateTime)}</span>
        )}
      </div>
    </div>
  )
}

function EditEntryDialog({
  entry,
  onSave,
  onClose
}: {
  entry: LogbookEntry | null
  onSave: (title: string, content: string) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(entry?.title || '')
  const [content, setContent] = useState(entry?.content || '')

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed' }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 480 }}>
        <h2 style={{ margin: '0 0 12px' }}>{entry ? t("Edit Entry") : t("New Entry")}</h2>

        <div style={{ marginBottom: 10 }}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && title.trim()) onSave(title.trim(), content)
            }}
            placeholder={t("Entry title...")}
            autoFocus
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            {t("Content")}
          </label>
          <MarkdownEditor
            value={content}
            onChange={setContent}
          />
        </div>

        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>{t("Cancel")}</button>
          <button
            onClick={() => {
              if (title.trim()) onSave(title.trim(), content)
            }}
          >
            {t("Save")}
          </button>
        </div>
      </div>
    </div>
  )
}

function EntryDetailPane({ entry }: { entry: LogbookEntry | null }) {
  if (!entry) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
        {t("Select an entry to see its details.")}
      </div>
    )
  }
  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 'var(--font-size-lg)', marginBottom: 4 }}>
        {entry.title || t("Untitled Entry")}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>
        {t("Created")}{' '}{formatDate(entry.createdDateTime)}
        {entry.modifiedDateTime && (
          <span> {t("· edited")}{' '}{formatDate(entry.modifiedDateTime)}</span>
        )}
      </div>
      {entry.content ? (
        <Markdown
          text={entry.content}
          style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}
        />
      ) : (
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {t("No content")}
        </div>
      )}
    </div>
  )
}

export function LogbookWindow() {
  const [entries, setEntries] = useState<LogbookEntry[]>([])
  const [selectedGuid, setSelectedGuid] = useState<string | null>(null)
  const [editingEntry, setEditingEntry] = useState<LogbookEntry | null | 'new'>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [entryContextMenu, setEntryContextMenu] = useState<{ x: number; y: number; guid: string } | null>(null)

  const applyInitData = useCallback((initData: LogbookInitData) => {
    if (initData.theme !== undefined) {
      document.documentElement.setAttribute('data-theme', initData.theme)
    }
    setEntries(initData.entries)
  }, [])

  useEffect(() => {
    window.api.getLogbookData().then((initData) => {
      if (initData) applyInitData(initData)
    })
    const unsub = window.api.onLogbookData((initData) => {
      if (initData) applyInitData(initData)
    })
    return unsub
  }, [applyInitData])

  const handleNewEntry = useCallback(() => {
    setEditingEntry('new')
  }, [])

  const handleSaveEntry = useCallback((title: string, content: string) => {
    if (editingEntry === 'new') {
      const guid = generateGuid()
      const now = new Date().toISOString()
      const newEntry: LogbookEntry = { guid, title, content, createdDateTime: now }
      setEntries((prev) => [newEntry, ...prev])
      setSelectedGuid(guid)
      window.api.sendLogbookUpdate('add-entry', newEntry)
    } else if (editingEntry) {
      const updated = {
        ...editingEntry,
        title,
        content,
        modifiedDateTime: new Date().toISOString()
      }
      setEntries((prev) => prev.map((e) => (e.guid === updated.guid ? updated : e)))
      window.api.sendLogbookUpdate('update-entry', updated.guid, updated.title, updated.content)
    }
    setEditingEntry(null)
  }, [editingEntry])

  const handleDeleteEntry = useCallback((guid: string) => {
    setEntries((prev) => prev.filter((e) => e.guid !== guid))
    if (selectedGuid === guid) setSelectedGuid(null)
    window.api.sendLogbookUpdate('remove-entry', guid)
    setDeleteConfirm(null)
  }, [selectedGuid])

  const handleExportPdf = useCallback(async () => {
    const now = new Date().toLocaleString()
    const { markdownToHtml } = await import('../Markdown')

    const body = entries.map((e) => {
      const contentHtml = e.content ? markdownToHtml(e.content) : '<em>No content</em>'
      return `<div class="entry">
        <div class="entry-title">${escHtml(e.title || 'Untitled Entry')}</div>
        <div class="entry-date">${escHtml(formatDate(e.createdDateTime))}${e.modifiedDateTime ? ` · edited ${escHtml(formatDate(e.modifiedDateTime))}` : ''}</div>
        <div class="entry-content">${contentHtml}</div>
      </div>`
    }).join('')

    // Per-entry block styling lives here; shared body typography,
    // h1, .subtitle, and markdown chrome (code/pre/blockquote) are
    // provided by buildPdfDocument.
    const extraCss = `
  .entry { padding: 10px 0; border-bottom: 1px solid #eee; }
  .entry-title { font-weight: 600; font-size: 13px; margin-bottom: 2px; }
  .entry-date { font-size: 10px; color: #888; margin-bottom: 6px; }
  .entry-content { font-size: 11px; color: #444; }
  .entry-content p { margin: 0 0 6px; } .entry-content p:last-child { margin-bottom: 0; }
  .entry-content ul, .entry-content ol { margin: 0 0 6px; padding-left: 18px; }
`

    const html = buildPdfDocument({
      title: t("Logbook"),
      subtitle: t("{{length}} entr{{x1}} &mdash; exported {{x2}}", { length: entries.length, x1: entries.length !== 1 ? 'ies' : 'y', x2: escHtml(now) }),
      body,
      extraCss
    })

    await exportPdfWithHeader(html, t("Logbook"))
  }, [entries])

  const selectedEntry = selectedGuid ? entries.find((e) => e.guid === selectedGuid) ?? null : null

  return (
    <div className="logbook-window" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', color: 'var(--text-primary)' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 10px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        gap: 6,
        flexShrink: 0,
        WebkitAppRegion: 'drag' as any
      }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', flex: 1 }}>
          {t("Logbook")}
          <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
            {entries.length} {t("entr")}{entries.length !== 1 ? 'ies' : 'y'}
          </span>
        </span>
        <button
          style={{ fontSize: 11, padding: '3px 8px', WebkitAppRegion: 'no-drag' as any }}
          onClick={handleNewEntry}
        >
          {t("+ Entry")}
        </button>
        <button
          className="secondary"
          style={{ fontSize: 11, padding: '3px 8px', WebkitAppRegion: 'no-drag' as any }}
          onClick={handleExportPdf}
        >
          {t("Export PDF")}
        </button>
      </div>

      {/* Main content: two-pane — entry list on left, detail on right */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Entry list */}
        <div style={{ width: '40%', borderRight: '1px solid var(--border-color)', overflowY: 'auto' }}>
          {entries.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
              {t("No entries yet. Click \"+ Entry\" to create one.")}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 10px', borderBottom: '1px solid var(--border-color)' }}>
                {t("Click to preview · Double-click to edit · Right-click for options")}
              </div>
              {entries.map((entry) => (
                <div
                  key={entry.guid}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setSelectedGuid(entry.guid)
                    setEntryContextMenu({ x: e.clientX, y: e.clientY, guid: entry.guid })
                  }}
                >
                  <EntryRow
                    entry={entry}
                    isSelected={selectedGuid === entry.guid}
                    onClick={() => setSelectedGuid(entry.guid)}
                    onDoubleClick={() => setEditingEntry(entry)}
                  />
                </div>
              ))}
            </>
          )}
        </div>

        {/* Detail pane */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <EntryDetailPane entry={selectedEntry} />
        </div>
      </div>

      {/* Edit/New entry dialog */}
      {editingEntry !== null && (
        <EditEntryDialog
          entry={editingEntry === 'new' ? null : editingEntry}
          onSave={handleSaveEntry}
          onClose={() => setEditingEntry(null)}
        />
      )}

      {/* Entry context menu */}
      {entryContextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setEntryContextMenu(null)} />
          <div
            className="context-menu"
            style={{ position: 'fixed', left: entryContextMenu.x, top: entryContextMenu.y, zIndex: 100 }}
          >
            <div className="context-menu-item" onClick={() => {
              const entry = entries.find((e) => e.guid === entryContextMenu.guid)
              setEntryContextMenu(null)
              if (entry) setEditingEntry(entry)
            }}>
              {t("Edit Entry")}
            </div>
            <div className="context-menu-separator" />
            <div
              className="context-menu-item"
              style={{ color: 'var(--menu-fg-danger)' }}
              onClick={() => {
                setDeleteConfirm(entryContextMenu.guid)
                setEntryContextMenu(null)
              }}
            >
              {t("Delete Entry")}
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)} style={{ position: 'fixed' }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 12px' }}>{t("Delete Entry")}</h2>
            <p style={{ margin: '0 0 16px', fontSize: 'var(--font-size-sm)' }}>
              {t("Are you sure you want to delete this logbook entry? This cannot be undone.")}
            </p>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setDeleteConfirm(null)}>{t("Cancel")}</button>
              <button
                style={{ background: 'var(--danger)' }}
                onClick={() => handleDeleteEntry(deleteConfirm)}
              >
                {t("Delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
