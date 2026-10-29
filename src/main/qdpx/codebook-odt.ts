/**
 * Reads an OpenDocument text (.odt, LibreOffice / Google Docs export) codebook
 * into the same paragraph marks as the Word reader: heading level (text:h's
 * outline level), whole-line bold (from paragraph and span styles) and the
 * nesting depth of lists. The hierarchy rules live in
 * renderer/utils/codebook-outline.ts.
 */
import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import type { OutlineParagraph } from '../../renderer/models/types'

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', preserveOrder: true, trimValues: false })

type Node = Record<string, any>
const tagOf = (n: Node): string | undefined => Object.keys(n).find((k) => k !== ':@')
const childrenOf = (n: Node): Node[] => { const t = tagOf(n); return t && Array.isArray(n[t]) ? n[t] : [] }
const attr = (n: Node, name: string): string | undefined => n[':@']?.[`@_${name}`]

interface OdtStyle { parent?: string; bold?: boolean; displayName?: string }

function collectStyles(nodes: Node[], into: Map<string, OdtStyle>): void {
  for (const n of nodes) {
    const tag = tagOf(n)
    if (tag === 'style:style') {
      const name = attr(n, 'style:name')
      if (!name) continue
      const props = childrenOf(n).find((c) => tagOf(c) === 'style:text-properties')
      const weight = props ? attr(props, 'fo:font-weight') : undefined
      into.set(name, {
        parent: attr(n, 'style:parent-style-name'),
        bold: weight === undefined ? undefined : weight === 'bold' || Number(weight) >= 600,
        displayName: attr(n, 'style:display-name') ?? name
      })
    } else if (tag === 'office:styles' || tag === 'office:automatic-styles' || tag === 'office:document-styles' || tag === 'office:document-content') {
      collectStyles(childrenOf(n), into)
    }
  }
}

function inherited<T>(styles: Map<string, OdtStyle>, name: string | undefined, pick: (s: OdtStyle) => T | undefined): T | undefined {
  for (let d = 0; name && d < 10; d++) {
    const s = styles.get(name)
    if (!s) break
    const v = pick(s)
    if (v !== undefined) return v
    name = s.parent
  }
  return undefined
}

export async function readOdtParagraphs(data: Buffer | Uint8Array): Promise<OutlineParagraph[]> {
  const zip = await JSZip.loadAsync(data)
  const content = await zip.file('content.xml')?.async('string')
  if (!content) throw new Error('content.xml not found')
  const styles = new Map<string, OdtStyle>()
  const stylesXml = await zip.file('styles.xml')?.async('string')
  if (stylesXml) collectStyles(parser.parse(stylesXml), styles)
  const contentRoot = parser.parse(content) as Node[]
  collectStyles(contentRoot, styles)

  const out: OutlineParagraph[] = []
  const isTitleStyle = (name: string | undefined): boolean =>
    /^title$|^t[ií]tulo$/i.test(inherited(styles, name, (s) => (/^(title|t[ií]tulo)$/i.test(s.displayName ?? '') ? s.displayName : undefined)) ?? '')

  const readText = (nodes: Node[], bold: boolean, acc: { text: string; visible: number; bold: number }): void => {
    for (const n of nodes) {
      if ('#text' in n) {
        const piece = String(n['#text'])
        acc.text += piece
        const v = piece.replace(/\s/g, '').length
        acc.visible += v
        if (bold) acc.bold += v
        continue
      }
      const tag = tagOf(n)
      if (tag === 'text:s') acc.text += ' '.repeat(Number(attr(n, 'text:c') ?? 1))
      else if (tag === 'text:tab' || tag === 'text:line-break') acc.text += ' '
      else if (tag === 'text:span' || tag === 'text:a') {
        const spanBold = inherited(styles, attr(n, 'text:style-name'), (s) => s.bold)
        readText(childrenOf(n), spanBold ?? bold, acc)
      } else if (tag === 'text:note' || tag === 'office:annotation') {
        // Footnotes and comments are not part of the line.
      } else if (tag) {
        readText(childrenOf(n), bold, acc)
      }
    }
  }

  const walk = (nodes: Node[], listDepth: number): void => {
    for (const n of nodes) {
      const tag = tagOf(n)
      if (tag === 'text:p' || tag === 'text:h') {
        const style = attr(n, 'text:style-name')
        const acc = { text: '', visible: 0, bold: 0 }
        readText(childrenOf(n), inherited(styles, style, (s) => s.bold) ?? false, acc)
        const text = acc.text.replace(/\s+/g, ' ').trim()
        if (!text) continue
        out.push({
          text,
          headingLevel: tag === 'text:h' ? Number(attr(n, 'text:outline-level') ?? 1) : null,
          isTitle: isTitleStyle(style),
          bold: acc.visible > 0 && acc.bold === acc.visible,
          listLevel: listDepth > 0 ? listDepth : null
        })
      } else if (tag === 'text:list') {
        walk(childrenOf(n), listDepth + 1)
      } else if (tag === 'text:list-item' || tag === 'text:list-header' || tag === 'text:section' || tag === 'office:text' || tag === 'office:body' || tag === 'office:document-content') {
        walk(childrenOf(n), listDepth)
      }
      // Tables are skipped, as in the Word reader.
    }
  }
  walk(contentRoot, 0)
  return out
}
