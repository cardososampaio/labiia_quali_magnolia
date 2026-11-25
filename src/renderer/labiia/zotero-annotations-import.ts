/**
 * The Zotero import's step for highlights and comments (see
 * zotero-annotations.ts): for each imported PDF, the annotations Zotero
 * keeps on its attachment are put in the project, and at the end the
 * researcher is told how many came in and how many passages were not found.
 */
import { t } from '../i18n'
import type { ZoteroGet } from '../utils/zotero'
import { applyAnnotations, listAnnotations, type AnnotationSummary } from './zotero-annotations'

export type { AnnotationSummary }

/** One imported document's annotations; only PDFs have them placed by page. */
export async function importAnnotationsFor(
  get: ZoteroGet,
  library: string,
  attachmentKey: string | undefined,
  sourceGuid: string,
  sourceName: string,
  file: { content?: string; extension?: string; name?: string; formatting?: { pdfPageOffsets?: number[] } },
  total: AnnotationSummary
): Promise<void> {
  if (!attachmentKey || typeof file.content !== 'string') return
  const ext = (file.extension || String(file.name ?? '').split('.').pop() || '').toLowerCase()
  if (ext !== 'pdf') return
  const annotations = await listAnnotations(get, library, attachmentKey).catch(() => [])
  if (annotations.length === 0) return
  const s = applyAnnotations(sourceGuid, sourceName, annotations, file.content, file.formatting?.pdfPageOffsets, {
    parentCode: t('labiia.zotero.annotations.parentCode'),
    noteTitle: (page) => (page ? t('labiia.zotero.annotations.noteTitlePage', { page }) : t('labiia.zotero.annotations.noteTitle'))
  })
  total.found += s.found
  total.notFound += s.notFound
}

/** Tells the researcher what came in. */
export function reportAnnotations(total: AnnotationSummary): void {
  let message = total.found > 0 ? t('labiia.zotero.annotations.summary', { count: total.found }) : t('labiia.zotero.annotations.none')
  if (total.notFound > 0) message += '\n\n' + t('labiia.zotero.annotations.notFound', { count: total.notFound })
  try { window.alert(message) } catch { /* no window (tests) */ }
}
