/**
 * Status bar along the bottom of the main window: whether the project is
 * saved, and how many sources and codes it holds. Auto-save writes edits
 * within seconds, so "Edited" turns back into "Saved" on its own.
 */
import { useProjectStore } from '../stores/project-store'
import { useDocumentStore } from '../stores/document-store'
import { useCodeStore } from '../stores/code-store'
import type { Code } from '../models/types'
import { Icon, faCheck, faPen } from './Icon'
import { t, tn } from '../i18n'

function countCodes(codes: Code[]): number {
  return codes.reduce((n, code) => n + 1 + countCodes(code.children), 0)
}

export function StatusBar(): JSX.Element {
  const isDirty = useProjectStore((s) => s.isDirty)
  const hasFile = useProjectStore((s) => !!s.filePath)
  const sources = useDocumentStore((s) => s.sources.length)
  const codes = useCodeStore((s) => countCodes(s.codes))

  const saveState = !hasFile ? t("Not saved yet") : isDirty ? t("Edited") : t("Saved")

  return (
    <div className="status-bar" role="status">
      <span className={`status-bar-item status-save${isDirty || !hasFile ? ' status-save-pending' : ''}`}>
        <Icon icon={isDirty || !hasFile ? faPen : faCheck} />
        {saveState}
      </span>
      <span className="status-bar-item">
        {tn(sources, '{{count}} source', '{{count}} sources')}
      </span>
      <span className="status-bar-item">
        {tn(codes, '{{count}} code', '{{count}} codes')}
      </span>
    </div>
  )
}
