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
import { t, tn } from '../../i18n'

const RULE_LABEL: Record<OutlineRule, string> = {
  'headings': t("Word headings"),
  'bold-number': t("Bold and number"),
  'numbering': t("Numbering")
}
const RULE_HINT: Record<OutlineRule, string> = {
  'headings': t("Heading 1 is a category, Heading 2 a code, Heading 3 a sub-code."),
  'bold-number': t("A whole bold line starting with a number is a category; numbered lines that are not bold are its codes."),
  'numbering': t("1. is a category, 1.1 a code, 1.1.1 a sub-code (or the level of a list).")
}

function levelLabel(level: number): string {
  // "Category" alone already names a characteristic's attribute, hence its own key.
  return level === 1 ? t("Codebook category") : level === 2 ? t("Code") : t("Sub-code")
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
        {t("No categories or codes were found with this rule. Try another rule above, or mark the categories in the document with Heading 1 or with bold and a number.")}
      </p>
    )
  } else {
    body = (
      <ul className="outline-rows" aria-label={t("Categories and codes found")}>
        {rows.map((r, index) => (
          <li key={r.id} className={`outline-row${r.include ? '' : ' outline-row-off'}`} style={{ paddingLeft: 8 + (r.level - 1) * 22 }}>
            <input
              type="checkbox"
              checked={r.include}
              onChange={(e) => update(r.id, { include: e.target.checked })}
              aria-label={t("Import {{name}}", { name: r.name })}
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
                title={t("Move up a level")}
                aria-label={t("Move up a level")}
                onClick={() => update(r.id, { level: r.level - 1 })}
              >←</button>
              <button
                type="button"
                className="secondary"
                disabled={!r.include || index === 0}
                title={t("Move down a level")}
                aria-label={t("Move down a level")}
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
      <div className="modal outline-dialog" role="dialog" aria-label={t("Import codebook")} onClick={(e) => e.stopPropagation()}>
        <h2>{t("Import codebook")}</h2>
        <p className="outline-file">{fileName}</p>

        <div className="outline-rules" role="radiogroup" aria-label={t("How the document is organised")}>
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
                {detected?.rule === r ? t("detected · ") : ''}{tn(byRule[r].rows.length, '{{count}} item', '{{count}} items')}
              </span>
            </button>
          ))}
        </div>
        <p className="outline-hint">{RULE_HINT[rule]}</p>

        {(outline.bookTitle || outline.introduction.length > 0) && (
          <p className="outline-note">
            {outline.bookTitle && t("“{{title}}” is the book's title and is not imported.", { title: outline.bookTitle })}
            {outline.bookTitle && outline.introduction.length > 0 && ' '}
            {outline.introduction.length > 0 && tn(outline.introduction.length, 'The {{count}} paragraph before the first category is an introduction and is not imported.', 'The {{count}} paragraphs before the first category are an introduction and are not imported.')}
          </p>
        )}

        {body}

        <div className="outline-footer">
          <label className="outline-keep">
            <input type="checkbox" checked={keepNumbers} onChange={(e) => setKeepNumbers(e.target.checked)} />
            {t("Keep the numbers in the names")}
          </label>
          <span className="outline-summary">
            {tn(categories, '{{count}} codebook category', '{{count}} codebook categories')} · {tn(codes, '{{count}} code', '{{count}} codes')}
          </span>
          <button type="button" className="secondary" onClick={onClose}>{t("Cancel")}</button>
          <button
            type="button"
            disabled={included.length === 0}
            onClick={() => { onImport(toCodes(outlineToTree(rows, keepNumbers), presets)); onClose() }}
          >
            {t("Import")}
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
            <h2>{t("Import codebook")}</h2>
            <p>{error}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setError(null)}>{t("OK")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
  return { startImport, dialog }
}
