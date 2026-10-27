import type { FormatDef } from '../format-registry'
import { t } from '../../i18n'

export const plainTextFormat: FormatDef = {
  sourceType: 'text',
  label: t("Text Files"),
  extensions: ['txt'],
  parseDocument: () => null,
}
