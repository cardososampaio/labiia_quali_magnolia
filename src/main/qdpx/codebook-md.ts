/**
 * Reads a Markdown (.md) codebook into the same paragraph marks as the Word
 * reader: "#" headings give the heading level, a line wrapped whole in
 * **bold** (or __bold__) is bold, and list items ("1.", "1)", "-", "*", "+")
 * give the list level by their indentation (two or more spaces, or a tab,
 * per level). Numbered list items keep their number in the text, so the
 * bold-number and numbering rules can read it.
 */
import type { OutlineParagraph } from '../../renderer/models/types'
import { listLevelsFromIndents, type ListParagraph } from './codebook-docx'

const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const ORDERED = /^(\s*)(\d{1,3}[.)])\s+(.*)$/
const BULLET = /^(\s*)[-*+]\s+(.*)$/
const SETEXT = /^\s{0,3}(=+|-+)\s*$/

/** Removes inline Markdown and reports whether the whole line was bold. */
function inline(text: string): { text: string; bold: boolean } {
  let t = text.trim()
  const whole = /^(\*\*|__)(.+)\1$/.exec(t)
  const bold = !!whole && !/(\*\*|__)/.test(whole[2])
  if (whole) t = whole[2]
  t = t
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^*\w])[*_](\S(?:.*?\S)?)[*_](?=$|[^*\w])/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')
  return { text: t.trim(), bold }
}

function indentWidth(spaces: string): number {
  return spaces.replace(/\t/g, '    ').length
}

export function readMarkdownParagraphs(md: string): OutlineParagraph[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const out: ListParagraph[] = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue }
    if (inFence || !line.trim() || /^\s*([-*_]\s*){3,}$/.test(line) || /^\s*\|/.test(line)) continue

    const heading = HEADING.exec(line)
    if (heading) {
      const { text } = inline(heading[2])
      if (text) out.push({ text, headingLevel: heading[1].length, isTitle: false, bold: true, listLevel: null, inList: false, ilvl: 0 })
      continue
    }
    // "Title\n=====" and "Title\n-----" headings.
    const underline = lines[i + 1] !== undefined ? SETEXT.exec(lines[i + 1]) : null
    if (underline && !ORDERED.test(line) && !BULLET.test(line)) {
      const { text } = inline(line)
      out.push({ text, headingLevel: underline[1][0] === '=' ? 1 : 2, isTitle: false, bold: true, listLevel: null, inList: false, ilvl: 0 })
      i++
      continue
    }
    const ordered = ORDERED.exec(line)
    const bullet = ordered ? null : BULLET.exec(line)
    if (ordered || bullet) {
      const indent = indentWidth((ordered ?? bullet)![1])
      const body = ordered ? `${ordered[2]} ${ordered[3]}` : bullet![2]
      // "**1. Nível**" and "1. **Nível**" both make a bold numbered line.
      const marked = ordered ? inline(ordered[3]) : inline(body)
      const text = ordered ? `${ordered[2]} ${marked.text}` : marked.text
      if (marked.text) out.push({ text, headingLevel: null, isTitle: false, bold: marked.bold, listLevel: null, inList: true, ilvl: 0, indent: indent * 100 })
      continue
    }
    const { text, bold } = inline(line.replace(/^\s*>\s?/, ''))
    if (text) out.push({ text, headingLevel: null, isTitle: false, bold, listLevel: null, inList: false, ilvl: 0 })
  }
  return listLevelsFromIndents(out)
}
