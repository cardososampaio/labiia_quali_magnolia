// Version 0.1.1 makes the Windows look the default theme. People still on the
// old default (Magnolia, light or dark) move to the Windows look once; anyone
// who picked another theme keeps it, and choosing Magnolia again later sticks
// because the migration is marked as done in the preferences file.
export const THEME_REVISION = 1

export function migrateThemePreference<T extends { theme?: unknown; themeRevision?: unknown }>(prefs: T | null): T | null {
  if (!prefs || typeof prefs !== 'object') return prefs
  if (prefs.themeRevision === THEME_REVISION) return prefs
  const theme = prefs.theme
  const next = { ...prefs, themeRevision: THEME_REVISION }
  if (theme === 'magnolia') next.theme = 'windows'
  else if (theme === 'magnolia-dark') next.theme = 'windows-dark'
  return next
}
