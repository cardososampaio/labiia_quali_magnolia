/**
 * "Select manually" — opens the Select Items dialog and hands the chosen
 * items to the drop zone this button sits in, exactly as if they had been
 * dragged there (see utils/drag-payload.ts). Place it inside the element
 * that has the onDrop handler, or point `target` at that element.
 */
import { useRef, useState, type CSSProperties } from 'react'
import type { AnalysisInitData } from '../../models/types'
import { ItemPickerDialog } from './ItemPickerDialog'
import { entityPayloadsEach, deliverAsDrop, payloadsFor, type PickKind, type PickedItems } from '../../utils/drag-payload'
import { t } from '../../i18n'

export interface ManualSelectButtonProps {
  /** Kinds of item the drop zone accepts, as listed in the dialog. */
  kinds: PickKind[]
  data?: AnalysisInitData
  title?: string
  label?: string
  /** Drop target when the button is not inside it; receives the button so
   *  the target can be found relative to it. */
  target?: (button: HTMLElement) => Element | null | undefined
  className?: string
  style?: CSSProperties
  /** Canvas targets: deliver one item per drop, laid out side by side. */
  spread?: boolean
  /** Called instead of delivering a drop, for places that are not drop zones. */
  onPicked?: (picked: PickedItems) => void
}

export function ManualSelectButton({ kinds, data, title, label, target, className, style, spread, onPicked }: ManualSelectButtonProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const confirm = (picked: PickedItems): void => {
    setOpen(false)
    if (onPicked) { onPicked(picked); return }
    const button = buttonRef.current
    const el = (button && target ? target(button) : null) ?? button
    if (el) void deliverAsDrop(el, spread ? entityPayloadsEach(picked) : payloadsFor(picked), { spread })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`secondary ip-manual-btn${className ? ' ' + className : ''}`}
        style={style}
        title={t('Choose items from a list instead of dragging them')}
        // Keep the click from starting a drag or a marquee on canvases.
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
      >
        {label ?? t('Select manually…')}
      </button>
      {open && (
        <ItemPickerDialog
          title={title}
          kinds={kinds}
          data={data}
          onConfirm={confirm}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  )
}
