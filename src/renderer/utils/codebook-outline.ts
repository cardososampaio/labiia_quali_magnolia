/**
 * Turns the paragraphs of a Word codebook into categories (parent codes) and
 * codes (their children, grandchildren and so on). A codebook is written one
 * of three ways, and one rule is applied per document, never mixed:
 *
 *  - headings:     "Heading 1" / "Título 1" is a category, "Heading 2" a code,
 *                  "Heading 3" a sub-code;
 *  - bold-number:  a whole bold line that starts with a number is a category
 *                  ("1. Nível de reflexão"); numbered lines that are not bold
 *                  are its codes ("0. nenhuma", "1. opinião");
 *  - numbering:    the depth of the number gives the level ("1." category,
 *                  "1.1" code, "1.1.1" sub-code), or the level of a Word list.
 *
 * Plain paragraphs after an item are its description. Paragraphs before the
 * first item are an introduction and are left out. The rule that best
 * explains the document is picked automatically (the one that builds a
 * hierarchy with the most items; ties go to headings, then bold-number, then
 * numbering), and the person can switch it and fix rows in the preview.
 */
import type { OutlineParagraph } from '../models/types'

export type { OutlineParagraph }

export type OutlineRule = 'headings' | 'bold-number' | 'numbering'
export const OUTLINE_RULES: OutlineRule[] = ['headings', 'bold-number', 'numbering']

export interface OutlineRow {
  id: number
  /** The line as written, number included. */
  text: string
  /** The name without its leading number ("1. opinião" → "opinião"). */
  name: string
  description: string
  /** 1 = category; 2 = code; 3 and deeper = sub-codes. */
  level: number
  include: boolean
}

export interface Outline {
  rule: OutlineRule
  /** A single title at the top, kept as the book's name rather than a category. */
  bookTitle: string | null
  rows: OutlineRow[]
  /** Paragraphs before the first item, not imported. */
  introduction: string[]
}

// A leading item number: "1.", "2)", "3 -", "*1.", or a dotted number such as
// "1.1" / "1.2.3" with or without a final dot. One to three digits, so a year
// opening a sentence ("2024 foi…") is not taken for a number.
const NUMBER_RE = /^\s*\*?\s*(\d{1,3}(?:\.\d{1,3})+\.?|\d{1,3}\s*[.)\-–:])\s+(\S.*)$/

export function splitNumber(text: string): { number: string | null; name: string; depth: number } {
  const m = NUMBER_RE.exec(text)
  if (!m) return { number: null, name: text.trim(), depth: 0 }
  const number = m[1].replace(/\s+/g, '')
  const depth = number.replace(/[.)\-–:]+$/, '').split('.').length
  return { number, name: m[2].trim(), depth }
}

/** Level of a paragraph under a rule, or null when it is description text. */
function levelUnder(rule: OutlineRule, p: OutlineParagraph): number | null {
  const { number, depth } = splitNumber(p.text)
  switch (rule) {
    case 'headings':
      return p.headingLevel
    case 'bold-number': {
      const numbered = number !== null || p.listLevel !== null
      if (!numbered) return null
      if (p.bold) return 1
      if (number !== null && depth > 1) return depth
      return p.listLevel !== null && p.listLevel > 1 ? p.listLevel : 2
    }
    case 'numbering':
      if (number !== null) return depth
      return p.listLevel
  }
}

export function buildOutline(paragraphs: OutlineParagraph[], rule: OutlineRule): Outline {
  let bookTitle: string | null = null
  let items = paragraphs.map((p) => ({ p, level: levelUnder(rule, p) }))
  // Bold + number needs at least one bold numbered category; without one,
  // plain numbered lines are the numbering rule's job.
  if (rule === 'bold-number' && !items.some((x) => x.level === 1)) items = items.map((x) => ({ ...x, level: null }))

  // A Title-styled first line names the book.
  const firstItem = items.findIndex((x) => x.level !== null || x.p.isTitle)
  if (firstItem >= 0 && items[firstItem].p.isTitle) {
    bookTitle = items[firstItem].p.text
    items = items.filter((_, i) => i !== firstItem)
  }
  if (rule === 'headings') {
    // One heading alone at the top level, first in the document, with other
    // headings below it, is the document's title, not a category.
    const levels = items.filter((x) => x.level !== null).map((x) => x.level!)
    const top = Math.min(...levels)
    const atTop = items.filter((x) => x.level === top)
    const first = items.find((x) => x.level !== null)
    if (!bookTitle && atTop.length === 1 && first === atTop[0] && levels.some((l) => l > top)) {
      bookTitle = first.p.text
      items = items.filter((x) => x !== first)
    }
  }

  const levels = items.filter((x) => x.level !== null).map((x) => x.level!)
  const shift = levels.length ? Math.min(...levels) - 1 : 0
  const rows: OutlineRow[] = []
  const introduction: string[] = []
  for (const { p, level } of items) {
    if (level === null) {
      const last = rows[rows.length - 1]
      if (last) last.description = last.description ? `${last.description}\n${p.text}` : p.text
      else introduction.push(p.text)
      continue
    }
    const { name } = splitNumber(p.text)
    rows.push({ id: rows.length, text: p.text, name: name || p.text, description: '', level: level - shift, include: true })
  }
  return { rule, bookTitle, rows: normaliseLevels(rows), introduction }
}

/** A row can sit at most one level below the row before it, and the first is a category. */
export function normaliseLevels(rows: OutlineRow[]): OutlineRow[] {
  let previous = 0
  return rows.map((r) => {
    if (!r.include) return r
    const level = Math.max(1, Math.min(r.level, previous + 1))
    previous = level
    return level === r.level ? r : { ...r, level }
  })
}

function hasHierarchy(o: Outline): boolean {
  return o.rows.some((r) => r.level === 1) && o.rows.some((r) => r.level >= 2)
}

/** The rule that best explains the document, or null when none finds items. */
export function detectOutline(paragraphs: OutlineParagraph[]): Outline | null {
  const all = OUTLINE_RULES.map((rule) => buildOutline(paragraphs, rule))
  const withHierarchy = all.filter(hasHierarchy)
  const pool = withHierarchy.length ? withHierarchy : all.filter((o) => o.rows.length > 0)
  if (!pool.length) return null
  // Most items wins; on a tie the earlier rule in OUTLINE_RULES (more explicit marks) wins.
  return pool.reduce((best, o) => (o.rows.length > best.rows.length ? o : best))
}

export interface OutlineCode {
  name: string
  description: string
  children: OutlineCode[]
}

/** The included rows as a tree. Excluded rows are dropped and the rows
 *  after them re-attach to the nearest included parent. */
export function outlineToTree(rows: OutlineRow[], keepNumbers: boolean): OutlineCode[] {
  const roots: OutlineCode[] = []
  const stack: { level: number; node: OutlineCode }[] = []
  for (const r of normaliseLevels(rows.filter((x) => x.include))) {
    const node: OutlineCode = { name: keepNumbers ? r.text : r.name, description: r.description, children: [] }
    while (stack.length && stack[stack.length - 1].level >= r.level) stack.pop()
    if (stack.length) stack[stack.length - 1].node.children.push(node)
    else roots.push(node)
    stack.push({ level: r.level, node })
  }
  return roots
}
