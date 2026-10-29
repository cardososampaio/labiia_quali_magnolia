import { t } from '../i18n'

/** True when Windows refused to open the file (EPERM / EACCES), the usual
 *  sign that an antivirus shield (Avast's Sensitive Data or Ransomware
 *  Shield, Kaspersky, Windows' Controlled folder access) blocks programs it
 *  does not trust from reading documents in protected folders. */
export function isAccessDenied(message: string): boolean {
  return /\b(EPERM|EACCES)\b|operation not permitted|permission denied|acesso .* negado/i.test(message)
}

/** The import error list, with a plain explanation when files were blocked. */
export function describeImportErrors(errors: string[]): string {
  const list = errors.map((e) => e.replace(/:\s*(EPERM|EACCES)[^\n]*/i, `: ${t("access denied by Windows")}`)).join('\n')
  if (!errors.some(isAccessDenied)) return list
  return `${list}\n\n${t("Windows did not let labiia_quali open these files. This is usually an antivirus protecting documents in folders such as the Desktop or Documents (in Avast: Protection → Sensitive Data Shield or Ransomware Shield). Allow labiia_quali in the antivirus, or copy the files to another folder, and import again.")}`
}
