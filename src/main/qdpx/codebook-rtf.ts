/**
 * Reads a Rich Text Format (.rtf) codebook into the same paragraph marks as
 * the Word reader: heading level (the style's \outlinelevel), whole-line bold
 * (\b on the visible text), and list membership with its indent (\ls, \ilvl,
 * \li). Word and LibreOffice write a style's formatting out on the text
 * itself, so bold is read from the text, not from the style sheet.
 * Paragraphs in tables (\intbl) are skipped, as in the Word reader.
 */
import type { OutlineParagraph } from '../../renderer/models/types'
import { listLevelsFromIndents, type ListParagraph } from './codebook-docx'

// Groups whose text is not part of the document body.
const SKIP_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'headerl', 'headerr', 'headerf',
  'footer', 'footerl', 'footerr', 'footerf', 'listtable', 'listoverridetable', 'listtext', 'pntext',
  'pntxta', 'pntxtb', 'fldinst', 'themedata', 'colorschememapping', 'latentstyles', 'datastore',
  'xmlnstbl', 'rsidtbl', 'generator', 'footnote', 'annotation', 'object', 'shp', 'nonshppict', 'revtbl'
])

interface StyleDef { name: string; outlineLevel?: number; basedOn?: number }

interface Token { kind: 'open' | 'close' | 'word' | 'symbol' | 'text'; word?: string; param?: number; text?: string }

function* tokens(rtf: string): Generator<Token> {
  let i = 0
  while (i < rtf.length) {
    const c = rtf[i]
    if (c === '{') { yield { kind: 'open' }; i++; continue }
    if (c === '}') { yield { kind: 'close' }; i++; continue }
    if (c === '\\') {
      const next = rtf[i + 1]
      if (next !== undefined && /[a-zA-Z]/.test(next)) {
        let j = i + 1
        while (j < rtf.length && /[a-zA-Z]/.test(rtf[j])) j++
        const word = rtf.slice(i + 1, j)
        let k = j
        if (rtf[k] === '-' || /\d/.test(rtf[k] ?? '')) { k++; while (/\d/.test(rtf[k] ?? '')) k++ }
        const param = k > j ? Number(rtf.slice(j, k)) : undefined
        if (rtf[k] === ' ') k++
        yield { kind: 'word', word, param }
        i = k
        continue
      }
      if (next === "'") { yield { kind: 'symbol', word: "'", text: rtf.slice(i + 2, i + 4) }; i += 4; continue }
      yield { kind: 'symbol', word: next }
      i += 2
      continue
    }
    if (c === '\r' || c === '\n') { i++; continue }
    let j = i
    while (j < rtf.length && !'{}\\\r\n'.includes(rtf[j])) j++
    yield { kind: 'text', text: rtf.slice(i, j) }
    i = j
  }
}

interface GroupState { bold: boolean; skip: boolean; ucSkip: number; inStyleSheet: boolean }

export function readRtfParagraphs(rtf: string): OutlineParagraph[] {
  const decoder = new TextDecoder('windows-1252')
  const styles = new Map<number, StyleDef>()
  const stack: GroupState[] = []
  let state: GroupState = { bold: false, skip: false, ucSkip: 1, inStyleSheet: false }
  let pendingSkipChars = 0
  let groupStart = false
  let starDestination = false

  // Paragraph properties (reset by \pard).
  let para = { style: 0, outlineLevel: undefined as number | undefined, ls: 0, ilvl: 0, li: undefined as number | undefined, inTable: false }
  let text = ''
  let visible = 0
  let boldVisible = 0
  const out: ListParagraph[] = []

  // Style sheet entry being read.
  let styleEntry: { num?: number; outline?: number; basedOn?: number; name: string } | null = null
  let styleDepth = -1

  const addText = (piece: string): void => {
    if (state.skip || !piece) return
    if (pendingSkipChars > 0) {
      const drop = Math.min(pendingSkipChars, piece.length)
      piece = piece.slice(drop)
      pendingSkipChars -= drop
      if (!piece) return
    }
    if (state.inStyleSheet) { if (styleEntry) styleEntry.name += piece; return }
    text += piece
    const v = piece.replace(/\s/g, '').length
    visible += v
    if (state.bold) boldVisible += v
  }

  const styleOutline = (num: number): number | undefined => {
    for (let d = 0, n: number | undefined = num; n !== undefined && d < 10; d++) {
      const s = styles.get(n)
      if (!s) return undefined
      if (s.outlineLevel !== undefined) return s.outlineLevel
      n = s.basedOn
    }
    return undefined
  }

  const endParagraph = (): void => {
    const clean = text.replace(/\s+/g, ' ').trim()
    if (clean && !para.inTable) {
      const name = styles.get(para.style)?.name ?? ''
      // LibreOffice names heading styles without writing \outlinelevel.
      const byName = /^(heading|t[ií]tulo)\s*(\d)$/i.exec(name.trim())
      const outline = para.outlineLevel ?? styleOutline(para.style) ?? (byName ? Number(byName[2]) - 1 : undefined)
      out.push({
        text: clean,
        headingLevel: outline !== undefined && outline >= 0 && outline < 9 ? outline + 1 : null,
        isTitle: /^(title|t[ií]tulo)$/i.test(name.trim()),
        bold: visible > 0 && boldVisible === visible,
        listLevel: null,
        inList: para.ls > 0,
        ilvl: para.ilvl,
        indent: para.li
      })
    }
    text = ''
    visible = 0
    boldVisible = 0
  }

  for (const tok of tokens(rtf)) {
    if (tok.kind === 'open') {
      stack.push(state)
      state = { ...state }
      groupStart = true
      starDestination = false
      continue
    }
    if (tok.kind === 'close') {
      if (state.inStyleSheet && styleEntry && stack.length === styleDepth) {
        const name = styleEntry.name.replace(/;\s*$/, '').trim()
        if (styleEntry.num !== undefined || name) styles.set(styleEntry.num ?? 0, { name, outlineLevel: styleEntry.outline, basedOn: styleEntry.basedOn })
        styleEntry = null
      }
      state = stack.pop() ?? state
      groupStart = false
      pendingSkipChars = 0
      continue
    }
    const wasGroupStart: boolean = groupStart
    groupStart = false

    if (tok.kind === 'symbol') {
      if (tok.word === '*') { starDestination = true; groupStart = wasGroupStart; continue }
      if (tok.word === "'") {
        if (pendingSkipChars > 0) { pendingSkipChars--; continue }
        addText(decoder.decode(new Uint8Array([parseInt(tok.text ?? '0', 16)])))
      } else if (tok.word === '~') addText(' ')
      else if (tok.word === '-' || tok.word === '_') addText(tok.word === '_' ? '-' : '')
      else if (tok.word === '\\' || tok.word === '{' || tok.word === '}') addText(tok.word)
      continue
    }
    if (tok.kind === 'text') { addText(tok.text ?? ''); continue }

    const w = tok.word!
    const p = tok.param
    if (wasGroupStart && (starDestination || SKIP_DESTINATIONS.has(w))) {
      if (w === 'stylesheet') { state.inStyleSheet = true; continue }
      state.skip = true
      continue
    }
    if (state.inStyleSheet) {
      if (stack.length > 0 && wasGroupStart && !styleEntry) { styleEntry = { name: '' }; styleDepth = stack.length }
      if (!styleEntry) continue
      if (w === 's' || w === 'cs' || w === 'ds' || w === 'ts') styleEntry.num = w === 's' ? p ?? 0 : -1 - (p ?? 0)
      else if (w === 'outlinelevel') styleEntry.outline = p
      else if (w === 'sbasedon') styleEntry.basedOn = p
      continue
    }
    switch (w) {
      case 'par': endParagraph(); break
      case 'pard': para = { style: 0, outlineLevel: undefined, ls: 0, ilvl: 0, li: undefined, inTable: false }; break
      case 's': para.style = p ?? 0; break
      case 'outlinelevel': para.outlineLevel = p; break
      case 'ls': para.ls = p ?? 0; break
      case 'ilvl': para.ilvl = p ?? 0; break
      case 'li': case 'lin': para.li = p; break
      case 'intbl': para.inTable = true; break
      case 'b': state.bold = p !== 0; break
      case 'plain': state.bold = false; break
      case 'uc': state.ucSkip = p ?? 1; break
      case 'u': {
        const code = (p ?? 0) < 0 ? (p ?? 0) + 65536 : p ?? 0
        if (state.skip || state.inStyleSheet) break
        addText(String.fromCharCode(code))
        // The ANSI fallback written after \u is not text of its own.
        pendingSkipChars = state.ucSkip
        break
      }
      case 'tab': case 'line': addText(' '); break
      case 'emdash': addText('—'); break
      case 'endash': addText('–'); break
      case 'lquote': case 'rquote': addText("'"); break
      case 'ldblquote': case 'rdblquote': addText('"'); break
      case 'bullet': addText('•'); break
    }
  }
  endParagraph()
  return listLevelsFromIndents(out)
}
