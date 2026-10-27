/**
 * PDF format — PDF viewer handles its own rendering via pdfjs-dist.
 * No line-based annotation parsing needed.
 */
import type { FormatDef } from '../format-registry'
import { t } from '../../i18n'

export const pdfFormat: FormatDef = {
  sourceType: 'pdf',
  label: t("PDF Documents"),
  extensions: ['pdf'],
  parseDocument: () => null,
}
