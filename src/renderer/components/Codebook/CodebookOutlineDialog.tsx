/**
 * Preview of a codebook read from a text document (Word, OpenDocument, RTF,
 * Markdown) before anything enters the project. It shows the categories and
 * codes the chosen reading rule found; the person can switch the rule, leave
 * rows out, move a row up or down a level and choose whether item numbers
 * stay in the names. Nothing is imported until "Import" is pressed.
 *
 * useCodebookImport wraps the whole flow for the Codebook screens: a .qdc
 * file goes straight in, a document opens this preview, a read error is
 * shown in plain words.
 */
import { useMemo, useState, type ReactNode } from 'react'
import type { Code, OutlineParagraph } from '../../models/types'
import {
  buildOutline, detectOutline, normaliseLevels, outlineToTree, OUTLINE_RULES,
  type Outline, type OutlineCode, type OutlineRow, type OutlineRule
} from '../../utils/codebook-outline'
import { generateGuid } from '../../utils/guid'
import { nextCodeColour, useCodeColourPresets } from '../../utils/code-colours'
import { t } from '../../i18n'

const RULE_LABEL: Record<OutlineRule, string> = {
  'headings': t('labiia.codebookImport.wordHeadings'),
  'bold-number': t('labiia.codebookImport.boldAndNumber'),
  'numbering': t('labiia.codebookImport.numbering')
}
const RULE_HINT: Record<OutlineRule, string> = {
  'headings': t('labiia.codebookImport.heading1IsACategory'),
  'bold-number': t('labiia.codebookImport.aWholeBoldLineStarting'),
  'numbering': t('labiia.codebookImport.n1IsACategory1')
}

function levelLabel(level: number): string {
  // "Category" alone already names a characteristic's attribute, hence its own key.
  return level === 1 ? t('labiia.codebookImport.codebookCategory') : level === 2 ? t('labiia.codebookImport.code') : t('labiia.codebookImport.subCode')
}

/** Codes for the project: new ids, one colour per category, shared by its codes. */
function toCodes(tree: OutlineCode[], presets: readonly string[]): Code[] {
  let colour: string | undefined
  const build = (node: OutlineCode, inherited?: string): Code => {
    const color = inherited ?? (colour = nextCodeColour(presets, colour))
    return {
      guid: generateGuid(),
      name: node.name,
      isCodable: true,
      color,
      description: node.description || undefined,
      children: node.children.map((c) => build(c, color))
    }
  }
  return tree.map((n) => build(n))
}

export function CodebookOutlineDialog({ fileName, paragraphs, onImport, onClose }: {
  fileName: string
  paragraphs: OutlineParagraph[]
  onImport: (codes: Code[]) => void
  onClose: () => void
}): JSX.Element {
  const presets = useCodeColourPresets()
  const detected = useMemo(() => detectOutline(paragraphs), [paragraphs])
  const byRule = useMemo(
    () => Object.fromEntries(OUTLINE_RULES.map((r) => [r, buildOutline(paragraphs, r)])) as Record<OutlineRule, Outline>,
    [paragraphs]
  )
  const [rule, setRule] = useState<OutlineRule>(detected?.rule ?? 'headings')
  const [rows, setRows] = useState<OutlineRow[]>(detected?.rows ?? [])
  const [keepNumbers, setKeepNumbers] = useState(false)
  const outline = byRule[rule]

  const chooseRule = (r: OutlineRule): void => {
    setRule(r)
    setRows(byRule[r].rows)
  }
  const update = (id: number, change: Partial<OutlineRow>): void =>
    setRows((prev) => normaliseLevels(prev.map((r) => (r.id === id ? { ...r, ...change } : r))))

  const included = rows.filter((r) => r.include)
  const categories = included.filter((r) => r.level === 1).length
  const codes = included.length - categories

  let body: ReactNode
  if (!rows.length) {
    body = (
      <p className="outline-empty">
        {t('labiia.codebookImport.noCategoriesOrCodesWere')}
      </p>
    )
  } else {
    body = (
      <ul className="outline-rows" aria-label={t('labiia.codebookImport.categoriesAndCodesFound')}>
        {rows.map((r, index) => (
          <li key={r.id} className={`outline-row${r.include ? '' : ' outline-row-off'}`} style={{ paddingLeft: 8 + (r.level - 1) * 22 }}>
            <input
              type="checkbox"
              checked={r.include}
              onChange={(e) => update(r.id, { include: e.target.checked })}
              aria-label={t('labiia.codebookImport.import', { name: r.name })}
            />
            <span className={`outline-level outline-level-${Math.min(r.level, 3)}`}>{levelLabel(r.level)}</span>
            <span className="outline-text">
              <span className="outline-name">{keepNumbers ? r.text : r.name}</span>
              {r.description && <span className="outline-description">{r.description}</span>}
            </span>
            <span className="outline-move">
              <button
                type="button"
                className="secondary"
                disabled={!r.include || r.level <= 1}
                title={t('labiia.codebookImport.moveUpALevel')}
                aria-label={t('labiia.codebookImport.moveUpALevel')}
                onClick={() => update(r.id, { level: r.level - 1 })}
              >←</button>
              <button
                type="button"
                className="secondary"
                disabled={!r.include || index === 0}
                title={t('labiia.codebookImport.moveDownALevel')}
                aria-label={t('labiia.codebookImport.moveDownALevel')}
                onClick={() => update(r.id, { level: r.level + 1 })}
              >→</button>
            </span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal outline-dialog" role="dialog" aria-label={t('labiia.codebookImport.importCodebook')} onClick={(e) => e.stopPropagation()}>
        <h2>{t('labiia.codebookImport.importCodebook')}</h2>
        <p className="outline-file">{fileName}</p>

        <div className="outline-rules" role="radiogroup" aria-label={t('labiia.codebookImport.howTheDocumentIsOrganised')}>
          {OUTLINE_RULES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={rule === r}
              className={rule === r ? 'outline-rule outline-rule-on' : 'outline-rule'}
              onClick={() => chooseRule(r)}
            >
              <span className="outline-rule-name">{RULE_LABEL[r]}</span>
              <span className="outline-rule-count">
                {detected?.rule === r ? t('labiia.codebookImport.detected') : ''}{t('labiia.codebookImport.item', { count: byRule[r].rows.length })}
              </span>
            </button>
          ))}
        </div>
        <p className="outline-hint">{RULE_HINT[rule]}</p>

        {(outline.bookTitle || outline.introduction.length > 0) && (
          <p className="outline-note">
            {outline.bookTitle && t('labiia.codebookImport.isTheBookSTitle', { title: outline.bookTitle })}
            {outline.bookTitle && outline.introduction.length > 0 && ' '}
            {outline.introduction.length > 0 && t('labiia.codebookImport.theParagraphBeforeTheFirst', { count: outline.introduction.length })}
          </p>
        )}

        {body}

        <div className="outline-footer">
          <label className="outline-keep">
            <input type="checkbox" checked={keepNumbers} onChange={(e) => setKeepNumbers(e.target.checked)} />
            {t('labiia.codebookImport.keepTheNumbersInThe')}
          </label>
          <span className="outline-summary">
            {t('labiia.codebookImport.codebookCategory2', { count: categories })} · {t('labiia.codebookImport.code2', { count: codes })}
          </span>
          <button type="button" className="secondary" onClick={onClose}>{t('labiia.codebookImport.cancel')}</button>
          <button
            type="button"
            disabled={included.length === 0}
            onClick={() => { onImport(toCodes(outlineToTree(rows, keepNumbers), presets)); onClose() }}
          >
            {t('labiia.codebookImport.import2')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Import button flow shared by the Codebook screens. */
export function useCodebookImport(applyCodes: (codes: Code[]) => void): { startImport: () => Promise<void>; dialog: ReactNode } {
  const [pending, setPending] = useState<{ fileName: string; paragraphs: OutlineParagraph[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startImport = async (): Promise<void> => {
    const result = await window.api.importCodebook()
    if (!result) return
    if (result.kind === 'codes') { if (result.codes.length) applyCodes(result.codes); return }
    if (result.kind === 'error') { setError(result.message); return }
    setPending({ fileName: result.fileName, paragraphs: result.paragraphs })
  }

  const dialog = (
    <>
      {pending && (
        <CodebookOutlineDialog fileName={pending.fileName} paragraphs={pending.paragraphs} onImport={applyCodes} onClose={() => setPending(null)} />
      )}
      {error && (
        <div className="modal-overlay" onClick={() => setError(null)}>
          <div className="modal" role="alertdialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h2>{t('labiia.codebookImport.importCodebook')}</h2>
            <p>{error}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setError(null)}>{t('labiia.codebookImport.ok')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
  return { startImport, dialog }
}
