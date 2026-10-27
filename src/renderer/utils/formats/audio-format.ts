/**
 * Audio format definition for the format registry.
 * The AudioDocumentViewer handles its own rendering (waveform + transcript),
 * so parseDocument returns null.
 */
import type { FormatDef } from '../format-registry'
import { t } from '../../i18n'

export const audioFormat: FormatDef = {
  sourceType: 'audio',
  label: t("Audio Files"),
  extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac'],
  parseDocument: () => null
}
