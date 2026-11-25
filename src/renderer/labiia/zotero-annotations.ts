/**
 * Importing a PDF's highlights and comments from Zotero, as the researcher
 * made them while reading:
 * - each highlight (or underline) becomes a saved quote of the passage;
 * - a highlight's comment becomes a code with that text, applied to the
 *   passage, under a parent code "Comentários do Zotero"; the same comment
 *   (ignoring spaces and capitals) is one code;
 * - a highlight without a comment is only a quote;
 * - a sticky note (no highlighted text) becomes a memo on the document.
 *
 * Zotero gives the highlighted text and its page. The passage is found in
 * the text the program extracted from the PDF, on that page first and then
 * anywhere, ignoring spaces, line breaks, hyphens, ligatures and curly
 * quotes, which differ between Zotero and the extracted text. A highlight
 * that cannot be found (a scanned PDF without text, for example) is not
 * created, so no passage is marked in the wrong place; it is counted.
 */
import { useCodeStore } from '../stores/code-store'
import { useDocumentStore } from '../stores/document-store'
import { useMemoStore } from '../stores/memo-store'
import { useQuoteStore } from '../stores/quote-store'
import type { Code } from '../models/types'
import { getAll, type ZoteroGet, type ZoteroItem } from '../utils/zotero'
import { beginCodeIntent, endCodeIntent } from './code-history-model'

export interface ZoteroAnnotation {
  key: string
  annotationType: string
  annotationText?: string
  annotationComment?: string
  annotationColor?: string
  /** JSON with the 0-based `pageIndex`. */
  annotationPosition?: string
  annotationPageLabel?: string
  annotationSortIndex?: string
}

/** The annotations Zotero keeps on an attachment, in reading order. */
export async function listAnnotations(get: ZoteroGet, library: string, attachmentKey: string): Promise<ZoteroAnnotation[]> {
  // The local API leaves annotations out of an item's children unless asked for by type.
  const children = await getAll<ZoteroItem>(get, `/api/${library}/items/${attachmentKey}/children?itemType=annotation`)
  return children
    .filter((c) => c.data.itemType === 'annotation')
    .map((c) => ({ ...(c.data as unknown as ZoteroAnnotation), key: c.data.key }))
    .sort((a, b) => String(a.annotationSortIndex ?? '').localeCompare(String(b.annotationSortIndex ?? '')))
}

export function pageIndexOf(a: ZoteroAnnotation): number | null {
  try {
    const p = JSON.parse(a.annotationPosition ?? '{}')
    return Number.isInteger(p.pageIndex) ? p.pageIndex : null
  } catch {
    return null
  }
}

// ── Finding the passage ───────────────────────────────────────────────

const QUOTES: Record<string, string> = { '‘': "'", '’': "'", '‚': "'", '‛': "'", '“': '"', '”': '"', '„': '"', '«': '"', '»': '"' }
/** Characters left out when comparing: spaces, line breaks and hyphens of any kind. */
const SKIP = /[\s­\-‐‑‒–—―]/u

/** The text as compared, with the position in the original (in code
 *  points) of each of its UTF-16 units, so a match found with indexOf maps
 *  straight back. */
function comparable(chars: string[], from = 0): { text: string; at: number[] } {
  let text = ''
  const at: number[] = []
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (SKIP.test(ch)) continue
    const norm = (QUOTES[ch] ?? ch).normalize('NFKC').toLowerCase()
    for (const c of Array.from(norm)) {
      if (SKIP.test(c)) continue
      text += c
      for (let u = 0; u < c.length; u++) at.push(from + i)
    }
  }
  return { text, at }
}

function comparableText(s: string): string {
  return comparable(Array.from(s)).text
}

/**
 * Where a highlighted text is in the document's text, as code-point
 * positions: first on its page (`pageOffsets[i]` is where page i+1 starts),
 * then anywhere. Null when it is not there.
 */
export function locateAnnotation(
  content: string,
  pageOffsets: number[] | undefined,
  pageIndex: number | null,
  text: string
): { start: number; end: number } | null {
  const needle = comparableText(text)
  if (!needle) return null
  const chars = Array.from(content)
  const search = (from: number, to: number) => {
    const { text: hay, at } = comparable(chars.slice(from, to), from)
    const i = hay.indexOf(needle)
    return i < 0 ? null : { start: at[i], end: at[i + needle.length - 1] + 1 }
  }
  const hasPage = !!pageOffsets?.length && pageIndex !== null && pageIndex >= 0 && pageIndex < pageOffsets.length
  if (hasPage) {
    const onPage = search(pageOffsets![pageIndex!], pageOffsets![pageIndex! + 1] ?? chars.length)
    if (onPage) return onPage
  }
  const anywhere = search(0, chars.length)
  if (anywhere) return anywhere
  // The extracted text can interrupt a passage with something the reader
  // skipped: a page's header or footer, a table caption. Then the passage is
  // found by its beginning and its end, close to each other, and runs from
  // one to the other.
  const all = comparable(chars)
  const needleChars = Array.from(needle)
  if (needleChars.length < 40) return null
  const k = Math.min(60, Math.floor(needleChars.length / 3))
  const head = needleChars.slice(0, k).join('')
  const tail = needleChars.slice(-k).join('')
  const reach = needle.length * 2 + 600
  const pageStart = hasPage ? all.at.findIndex((pos) => pos >= pageOffsets![pageIndex!]) : 0
  const starts: number[] = []
  for (let i = all.text.indexOf(head); i >= 0; i = all.text.indexOf(head, i + 1)) starts.push(i)
  // Prefer a beginning on the page Zotero gives.
  starts.sort((a, b) => Number(a < pageStart) - Number(b < pageStart) || a - b)
  for (const s of starts) {
    const e = all.text.indexOf(tail, s + head.length)
    if (e >= 0 && e + tail.length - s <= reach) return { start: all.at[s], end: all.at[e + tail.length - 1] + 1 }
  }
  return null
}

// ── Putting them in the project ───────────────────────────────────────

export interface AnnotationLabels {
  /** The parent code of the comment codes ("Comentários do Zotero"). */
  parentCode: string
  /** A sticky note's memo title, for its page label. */
  noteTitle: (page: string) => string
}

export interface AnnotationSummary {
  /** Highlights that came in. */
  found: number
  /** Highlights whose passage was not found in the text. */
  notFound: number
}

const sameName = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toLocaleLowerCase() === b.replace(/\s+/g, ' ').trim().toLocaleLowerCase()

/** The code for a comment, under the parent code, made the first time. */
function commentCode(comment: string, color: string, labels: AnnotationLabels): string {
  const store = useCodeStore.getState()
  let parent: Code | undefined = store.codes.find((c) => sameName(c.name, labels.parentCode))
  const parentGuid = parent?.guid ?? store.addCode(labels.parentCode, '#7a7a7a')
  parent = useCodeStore.getState().findCode(parentGuid)
  const found = parent?.children.find((c) => sameName(c.name, comment))
  return found?.guid ?? useCodeStore.getState().addCode(comment, color, parentGuid)
}

/** Puts a document's annotations in the project. */
export function applyAnnotations(
  sourceGuid: string,
  sourceName: string,
  annotations: ZoteroAnnotation[],
  content: string,
  pageOffsets: number[] | undefined,
  labels: AnnotationLabels
): AnnotationSummary {
  const summary: AnnotationSummary = { found: 0, notFound: 0 }
  const chars = Array.from(content)
  beginCodeIntent({ kind: 'import', from: 'zotero' })
  try {
    for (const a of annotations) {
      const comment = (a.annotationComment ?? '').replace(/\s+/g, ' ').trim()
      if (a.annotationType === 'note') {
        if (comment) {
          useMemoStore.getState().addMemo('document', labels.noteTitle(a.annotationPageLabel ?? ''), {
            content: a.annotationComment!.trim(), sourceGuids: [sourceGuid]
          })
        }
        continue
      }
      if ((a.annotationType !== 'highlight' && a.annotationType !== 'underline') || !a.annotationText?.trim()) continue
      const place = locateAnnotation(content, pageOffsets, pageIndexOf(a), a.annotationText)
      if (!place) {
        summary.notFound += 1
        continue
      }
      const passage = chars.slice(place.start, place.end).join('')
      useQuoteStore.getState().addQuote(sourceGuid, sourceName, place.start, place.end, passage)
      if (comment) {
        const codeGuid = commentCode(comment, a.annotationColor || '#ffd400', labels)
        const docs = useDocumentStore.getState()
        const name = passage.replace(/\s+/g, ' ').trim().slice(0, 60)
        const selGuid = docs.addSelection(sourceGuid, place.start, place.end, name)
        useDocumentStore.getState().addCodingToSelection(sourceGuid, selGuid, codeGuid)
      }
      summary.found += 1
    }
  } finally {
    endCodeIntent()
  }
  return summary
}
