import { dialog, type BrowserWindow } from 'electron'
import { t } from '../renderer/i18n'

// Closing the program asks first, so a stray click on the X or Alt+F4 does
// not end the session. Two closes skip the question: Windows shutting down or
// restarting (it would block the shutdown) and closing to install an update
// (the person already chose that).
export type CloseReason = 'user' | 'system-shutdown' | 'update'

export function shouldConfirmClose(reason: CloseReason): boolean {
  return reason === 'user'
}

// "Sim" closes; "Cancelar" is the default so Enter does not close by mistake.
export async function confirmClose(parent: BrowserWindow | null): Promise<boolean> {
  const options = {
    type: 'question' as const,
    title: 'labiia_quali',
    message: t('Close labiia_quali?'),
    detail: t('The project is saved automatically before closing.'),
    buttons: [t('Yes'), t('Cancel')],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  }
  const { response } = parent && !parent.isDestroyed()
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options)
  return response === 0
}
