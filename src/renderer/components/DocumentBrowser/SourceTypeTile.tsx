/**
 * The marker in front of a source in the Documents panel: a small coloured
 * tile with a white glyph, in the style of the ribbon buttons. The colour
 * says the kind of source at a glance, the way Windows colours file types:
 * PDF red, Word blue, plain text slate, image green, audio orange, video
 * pink, survey violet, note amber.
 */
import { Icon, type IconComponent } from '../Icon'

export type SourceTileKind = 'pdf' | 'word' | 'text' | 'image' | 'audio' | 'video' | 'survey' | 'note'

export function sourceTileKind(name: string, sourceType: string): SourceTileKind {
  // A Word document is shown as Word even when it is displayed through a PDF rendering.
  if (/\.(docx?|odt|rtf)$/i.test(name)) return 'word'
  if (sourceType === 'pdf' || sourceType === 'image' || sourceType === 'audio' || sourceType === 'video' || sourceType === 'survey' || sourceType === 'note') return sourceType
  return 'text'
}

export function SourceTypeTile({ kind, icon, title }: { kind: SourceTileKind; icon: IconComponent; title?: string }): JSX.Element {
  return (
    <span className="source-tile" data-kind={kind} title={title} aria-hidden={title ? undefined : true}>
      <Icon icon={icon} />
    </span>
  )
}
