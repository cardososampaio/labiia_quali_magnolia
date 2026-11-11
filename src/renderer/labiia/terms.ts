/**
 * labiia_quali's words over Magnolia's catalogues (locales/labiia/*.json).
 *
 * Researchers in Brazil describe a participant or source by its
 * "características" grouped in "atributos" (gender, city, date), so what
 * Magnolia calls tags and tag categories appear under those names; the
 * program calls itself labiia_quali, and Magnolia is named where it is
 * credited. Magnolia's own catalogues stay untouched, so a new Magnolia
 * release brings its strings in without conflicts. The Rust side applies
 * the same files to the menus and dialogs (src-tauri/src/i18n.rs).
 */
import type { i18n as I18n } from 'i18next'
import enTerms from '../locales/labiia/en.json'
import ptBRTerms from '../locales/labiia/pt-BR.json'

export const LABIIA_TERMS: Record<string, object> = { en: enTerms, 'pt-BR': ptBRTerms }

export function applyLabiiaTerms(i18n: I18n): void {
  for (const [language, terms] of Object.entries(LABIIA_TERMS)) {
    i18n.addResourceBundle(language, 'translation', terms, true, true)
  }
}
