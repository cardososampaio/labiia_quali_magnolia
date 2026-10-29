/**
 * Reads a Word (.docx) codebook into a flat list of paragraphs with the marks
 * that can carry its hierarchy: the heading level of the paragraph's style
 * ("Heading 1" / "Título 1", or any style with an outline level), whether the
 * whole line is bold, and the level of a Word numbered list. The renderer
 * turns these paragraphs into categories and codes (see
 * renderer/utils/codebook-outline.ts), so the person can switch the reading
 * rule in the preview without reading the file again.
 *
 * Paragraphs inside tables are skipped: a codebook laid out as a table is a
 * different shape from the outlines this importer reads.
 */
import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import type { OutlineParagraph } from '../../renderer/models/types'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  trimValues: false
})

type Node = Record<string, any>

function tagOf(node: Node): string | undefined {
  return Object.keys(node).find((k) => k !== ':@')
}
function childrenOf(node: Node): Node[] {
  const tag = tagOf(node)
  const value = tag ? node[tag] : undefined
  return Array.isArray(value) ? value : []
}
function attr(node: Node, name: string): string | undefined {
  return node[':@']?.[`@_${name}`]
}
function find(nodes: Node[], tag: string): Node | undefined {
  return nodes.find((n) => tagOf(n) === tag)
}

/** w:b present and not switched off with w:val="0"/"false". */
function isOn(node: Node | undefined): boolean | undefined {
  if (!node) return undefined
  const v = attr(node, 'w:val')
  return !(v === '0' || v === 'false' || v === 'off')
}

interface StyleInfo { name: string; basedOn?: string; outlineLevel?: number; bold?: boolean; isTitle: boolean; numId?: string; ilvl?: number; indent?: number }

function readStyles(xml: string | null): Map<string, StyleInfo> {
  const styles = new Map<string, StyleInfo>()
  if (!xml) return styles
  const root = parser.parse(xml) as Node[]
  const stylesNode = root.find((n) => tagOf(n) === 'w:styles')
  for (const s of stylesNode ? childrenOf(stylesNode) : []) {
    if (tagOf(s) !== 'w:style') continue
    const id = attr(s, 'w:styleId')
    if (!id) continue
    const kids = childrenOf(s)
    const name = attr(find(kids, 'w:name') ?? {}, 'w:val') ?? id
    const pPr = find(kids, 'w:pPr')
    const rPr = find(kids, 'w:rPr')
    const outline = pPr ? find(childrenOf(pPr), 'w:outlineLvl') : undefined
    const basedOn = attr(find(kids, 'w:basedOn') ?? {}, 'w:val')
    // List styles ("List Number 2") carry their own numbering and indent.
    const numPr = pPr ? find(childrenOf(pPr), 'w:numPr') : undefined
    const numKids = numPr ? childrenOf(numPr) : []
    styles.set(id, {
      numId: attr(find(numKids, 'w:numId') ?? {}, 'w:val'),
      ilvl: find(numKids, 'w:ilvl') ? Number(attr(find(numKids, 'w:ilvl')!, 'w:val')) : undefined,
      indent: pPr ? indentOf(childrenOf(pPr)) : undefined,
      name,
      basedOn,
      outlineLevel: outline ? Number(attr(outline, 'w:val')) : undefined,
      bold: rPr ? isOn(find(childrenOf(rPr), 'w:b')) : undefined,
      isTitle: /^title$|^t[ií]tulo$/i.test(name.trim())
    })
  }
  return styles
}

/** Heading level 1–9 of a paragraph style, following "based on" links. */
function headingLevel(styles: Map<string, StyleInfo>, id: string | undefined): number | null {
  for (let depth = 0; id && depth < 10; depth++) {
    const s = styles.get(id)
    if (!s) break
    const byName = /^(heading|t[ií]tulo)\s*(\d)$/i.exec(s.name.trim()) ?? /^(heading|t[ií]tulo)(\d)$/i.exec(id)
    if (byName) return Number(byName[2])
    if (s.outlineLevel !== undefined && s.outlineLevel >= 0 && s.outlineLevel < 9) return s.outlineLevel + 1
    id = s.basedOn
  }
  return null
}

function styleBold(styles: Map<string, StyleInfo>, id: string | undefined): boolean {
  for (let depth = 0; id && depth < 10; depth++) {
    const s = styles.get(id)
    if (!s) break
    if (s.bold !== undefined) return s.bold
    id = s.basedOn
  }
  return false
}

/** First value of `pick` along a style's "based on" chain. */
function inherited<T>(styles: Map<string, StyleInfo>, id: string | undefined, pick: (s: StyleInfo) => T | undefined): T | undefined {
  for (let depth = 0; id && depth < 10; depth++) {
    const s = styles.get(id)
    if (!s) break
    const v = pick(s)
    if (v !== undefined) return v
    id = s.basedOn
  }
  return undefined
}

/** Left indent in twips from a w:ind element among `pPrKids`. */
function indentOf(pPrKids: Node[]): number | undefined {
  const ind = find(pPrKids, 'w:ind')
  if (!ind) return undefined
  const v = attr(ind, 'w:left') ?? attr(ind, 'w:start')
  return v !== undefined ? Number(v) : undefined
}

/** numId -> ilvl -> left indent, from word/numbering.xml. */
type Numbering = Map<string, Map<number, number>>

function readNumbering(xml: string | null): Numbering {
  const out: Numbering = new Map()
  if (!xml) return out
  const root = parser.parse(xml) as Node[]
  const numberingNode = root.find((n) => tagOf(n) === 'w:numbering')
  const abstract = new Map<string, Map<number, number>>()
  const nums: [string, string][] = []
  for (const n of numberingNode ? childrenOf(numberingNode) : []) {
    if (tagOf(n) === 'w:abstractNum') {
      const levels = new Map<number, number>()
      for (const lvl of childrenOf(n)) {
        if (tagOf(lvl) !== 'w:lvl') continue
        const pPr = find(childrenOf(lvl), 'w:pPr')
        const indent = pPr ? indentOf(childrenOf(pPr)) : undefined
        if (indent !== undefined) levels.set(Number(attr(lvl, 'w:ilvl') ?? 0), indent)
      }
      abstract.set(attr(n, 'w:abstractNumId') ?? '', levels)
    } else if (tagOf(n) === 'w:num') {
      nums.push([attr(n, 'w:numId') ?? '', attr(find(childrenOf(n), 'w:abstractNumId') ?? {}, 'w:val') ?? ''])
    }
  }
  for (const [numId, abstractId] of nums) out.set(numId, abstract.get(abstractId) ?? new Map())
  return out
}

/** A paragraph before its list level is known: in a list or not, with the
 *  list's own level (0-based) and left indent in twips when known. */
export interface ListParagraph extends OutlineParagraph {
  inList: boolean
  ilvl: number
  indent?: number
}

/** List level = rank of the paragraph's indent among the list indents used
 *  in the document (indents within a quarter centimetre count as one), or the
 *  list's own level when no indent is known. The visible indent is what the
 *  reader sees: Word's "List Number 2" style is level 0 of its own list, only
 *  indented further. */
export function listLevelsFromIndents(raw: ListParagraph[]): OutlineParagraph[] {
  const indents = [...new Set(raw.filter((r) => r.inList && r.indent !== undefined).map((r) => r.indent!))].sort((a, b) => a - b)
  const steps: number[] = []
  for (const v of indents) if (!steps.length || v - steps[steps.length - 1] > 140) steps.push(v)
  return raw.map(({ inList, ilvl, indent, ...p }) => {
    if (!inList) return p
    const rank = indent !== undefined ? steps.filter((st) => st <= indent + 140).length : 0
    return { ...p, listLevel: rank > 0 ? rank : ilvl + 1 }
  })
}

function readParagraph(p: Node, styles: Map<string, StyleInfo>, numbering: Numbering): ListParagraph {
  const kids = childrenOf(p)
  const pPr = find(kids, 'w:pPr')
  const pPrKids = pPr ? childrenOf(pPr) : []
  const styleId = attr(find(pPrKids, 'w:pStyle') ?? {}, 'w:val')
  const numKids = childrenOf(find(pPrKids, 'w:numPr') ?? {})
  const numId = attr(find(numKids, 'w:numId') ?? {}, 'w:val') ?? inherited(styles, styleId, (s) => s.numId)
  const ilvlNode = find(numKids, 'w:ilvl')
  const ilvl = ilvlNode ? Number(attr(ilvlNode, 'w:val') ?? 0) : inherited(styles, styleId, (s) => s.ilvl) ?? 0
  const inList = !!numId && numId !== '0'
  const indent = indentOf(pPrKids) ?? inherited(styles, styleId, (s) => s.indent) ?? (inList ? numbering.get(numId!)?.get(ilvl) : undefined)
  const paragraphBold = styleBold(styles, styleId)

  let text = ''
  let boldChars = 0
  let visibleChars = 0
  const walkRuns = (nodes: Node[]): void => {
    for (const n of nodes) {
      const tag = tagOf(n)
      if (tag === 'w:r') {
        const rKids = childrenOf(n)
        const rPr = find(rKids, 'w:rPr')
        const rPrKids = rPr ? childrenOf(rPr) : []
        // Bold set on the run wins; then a character style; then the paragraph style.
        const explicit = isOn(find(rPrKids, 'w:b'))
        const charStyle = attr(find(rPrKids, 'w:rStyle') ?? {}, 'w:val')
        const bold = explicit !== undefined
          ? explicit
          : charStyle && styles.get(charStyle)?.bold !== undefined ? styleBold(styles, charStyle) : paragraphBold
        for (const r of rKids) {
          const rt = tagOf(r)
          let piece = ''
          if (rt === 'w:t') piece = childrenOf(r).map((c) => String(c['#text'] ?? '')).join('')
          else if (rt === 'w:tab') piece = '\t'
          else if (rt === 'w:br' || rt === 'w:cr') piece = ' '
          text += piece
          const visible = piece.replace(/\s/g, '').length
          visibleChars += visible
          if (bold) boldChars += visible
        }
      } else if (tag === 'w:hyperlink' || tag === 'w:ins' || tag === 'w:smartTag' || tag === 'w:sdt' || tag === 'w:sdtContent' || tag === 'w:fldSimple') {
        walkRuns(childrenOf(n))
      }
    }
  }
  walkRuns(kids)

  return {
    text: text.replace(/\s+/g, ' ').trim(),
    headingLevel: headingLevel(styles, styleId),
    isTitle: !!(styleId && styles.get(styleId)?.isTitle),
    bold: visibleChars > 0 && boldChars === visibleChars,
    listLevel: null,
    inList,
    ilvl,
    indent
  }
}

export async function readDocxParagraphs(data: Buffer | Uint8Array): Promise<OutlineParagraph[]> {
  const zip = await JSZip.loadAsync(data)
  const documentXml = await zip.file('word/document.xml')?.async('string')
  if (!documentXml) throw new Error('word/document.xml not found')
  const styles = readStyles((await zip.file('word/styles.xml')?.async('string')) ?? null)
  const numbering = readNumbering((await zip.file('word/numbering.xml')?.async('string')) ?? null)
  const root = parser.parse(documentXml) as Node[]
  const doc = root.find((n) => tagOf(n) === 'w:document')
  const body = doc ? find(childrenOf(doc), 'w:body') : undefined
  const raw: ListParagraph[] = []
  for (const node of body ? childrenOf(body) : []) {
    if (tagOf(node) === 'w:p') {
      const para = readParagraph(node, styles, numbering)
      if (para.text) raw.push(para)
    }
  }
  return listLevelsFromIndents(raw)
}
