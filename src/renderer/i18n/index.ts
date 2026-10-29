/**
 * Interface language.
 *
 * labiia_quali is written for Brazilian researchers, so the interface opens in
 * Brazilian Portuguese unless the user picks English in Preferences.
 *
 * The English text in the source code is the translation key: `t('Save')`
 * returns "Salvar" in Portuguese and "Save" in English. A string missing from
 * the Portuguese dictionary falls back to English instead of showing a blank,
 * so an untranslated screen still works.
 *
 * The language is fixed for the lifetime of a window. Changing it in
 * Preferences takes effect on the next launch, because reloading the windows
 * mid-session would discard unsaved project work.
 *
 * This module has no DOM or Electron dependency so the main process (native
 * menus and dialogs) and the renderer share the same dictionary.
 */
import { ptBR } from './pt-BR'
import { en } from './en'

export type Language = 'pt-BR' | 'en'

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'pt-BR', label: 'Português (Brasil)' },
  { id: 'en', label: 'English' }
]

/** Used when no preference has been saved yet (first launch). */
export const DEFAULT_LANGUAGE: Language = 'pt-BR'

export function normalizeLanguage(value: unknown): Language {
  return value === 'en' || value === 'pt-BR' ? value : DEFAULT_LANGUAGE
}

/** Renderer windows read the language from the preload bridge as soon as this
 *  module loads, so labels built at module scope are already translated. The
 *  main process and tests have no bridge and call setLanguage() themselves;
 *  until then they get the English source text. */
function detectLanguage(): Language {
  try {
    const api = (globalThis as { api?: { getLanguage?: () => unknown } }).api
    if (api?.getLanguage) return normalizeLanguage(api.getLanguage())
  } catch { /* no bridge in this context */ }
  return 'en'
}

let current: Language = detectLanguage()

export function setLanguage(language: Language): void {
  current = language
}

export function getLanguage(): Language {
  return current
}

/** BCP 47 tag for Intl number/date formatting and locale-aware sorting. */
export function getLocale(): string {
  return current === 'pt-BR' ? 'pt-BR' : 'en-US'
}

export type TranslationVars = Record<string, string | number | null | undefined>

/** Translate `key` (the English text). `{{name}}` placeholders are filled
 *  from `vars`; a missing value renders as empty text. */
export function t(key: string, vars?: TranslationVars): string {
  const template = current === 'pt-BR' ? ptBR[key] ?? key : en[key] ?? key
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in vars ? String(vars[name] ?? '') : match
  )
}

/** Singular/plural pick: `tn(n, '{{count}} code', '{{count}} codes')`.
 *  Both forms are translation keys; `count` is always available. */
export function tn(
  count: number,
  singular: string,
  plural: string,
  vars?: TranslationVars
): string {
  return t(count === 1 ? singular : plural, { count: formatNumber(count), ...vars })
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getLocale(), options).format(value)
}

export function formatDate(value: Date | number | string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(getLocale(), options).format(new Date(value))
}
