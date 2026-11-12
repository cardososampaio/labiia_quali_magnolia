import { t } from '../i18n'

/** A Mac build (checked when called, so the module also loads outside the window). */
const onMac = (): boolean =>
  typeof window !== 'undefined' && (window as { api?: { platform?: string } }).api?.platform === 'darwin'

/** True when Windows refused to open the file ("Access is denied. (os error 5)"
 *  from the Rust side, EPERM / EACCES from Node), the usual
 *  sign that an antivirus shield (Avast's Sensitive Data or Ransomware
 *  Shield, Kaspersky, Windows' Controlled folder access) blocks programs it
 *  does not trust from reading documents in protected folders. */
export function isAccessDenied(message: string): boolean {
  return /\b(EPERM|EACCES)\b|os error 5\b|access is denied|operation not permitted|permission denied|acesso .* negado/i.test(message)
}

/** The import error list, with a plain explanation when files were blocked.
 *  On a Mac the block comes from the privacy setting that lets each program
 *  reach the Desktop and Documents, so the explanation points there. */
export function describeImportErrors(errors: string[], mac: boolean = onMac()): string {
  const denied = t(mac ? 'labiia.importErrors.accessDeniedByMac' : 'labiia.importErrors.accessDeniedByWindows')
  const list = errors.map((e) => e.replace(/:\s*(EPERM|EACCES|Access is denied|Operation not permitted)[^\n]*/i, `: ${denied}`)).join('\n')
  if (!errors.some(isAccessDenied)) return list
  return `${list}\n\n${t(mac ? 'labiia.importErrors.macDidNotLetLabiia' : 'labiia.importErrors.windowsDidNotLetLabiia')}`
}
