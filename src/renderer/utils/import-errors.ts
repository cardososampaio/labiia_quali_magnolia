import { t } from '../i18n'

/** True when Windows refused to open the file ("Access is denied. (os error 5)"
 *  from the Rust side, EPERM / EACCES from Node), the usual
 *  sign that an antivirus shield (Avast's Sensitive Data or Ransomware
 *  Shield, Kaspersky, Windows' Controlled folder access) blocks programs it
 *  does not trust from reading documents in protected folders. */
export function isAccessDenied(message: string): boolean {
  return /\b(EPERM|EACCES)\b|os error 5\b|access is denied|operation not permitted|permission denied|acesso .* negado/i.test(message)
}

/** The import error list, with a plain explanation when files were blocked. */
export function describeImportErrors(errors: string[]): string {
  const list = errors.map((e) => e.replace(/:\s*(EPERM|EACCES|Access is denied)[^\n]*/i, `: ${t('labiia.importErrors.accessDeniedByWindows')}`)).join('\n')
  if (!errors.some(isAccessDenied)) return list
  return `${list}\n\n${t('labiia.importErrors.windowsDidNotLetLabiia')}`
}
