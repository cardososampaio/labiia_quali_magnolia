import { describe, expect, it } from 'vitest'
import { migrateThemePreference, THEME_REVISION } from '../../src/main/theme-migration'

// The old default theme moves to the Windows look once; other choices stay.
describe('migrateThemePreference', () => {
  it('moves Magnolia to the Windows look, light and dark', () => {
    expect(migrateThemePreference({ theme: 'magnolia' })?.theme).toBe('windows')
    expect(migrateThemePreference({ theme: 'magnolia-dark' })?.theme).toBe('windows-dark')
  })
  it('keeps any other chosen theme', () => {
    expect(migrateThemePreference({ theme: 'granola' })?.theme).toBe('granola')
    expect(migrateThemePreference({ theme: '' })?.theme).toBe('')
  })
  it('runs once: Magnolia chosen again after the migration stays', () => {
    const prefs = { theme: 'magnolia', themeRevision: THEME_REVISION }
    expect(migrateThemePreference(prefs)).toBe(prefs)
  })
  it('leaves a missing preferences file alone', () => {
    expect(migrateThemePreference(null)).toBeNull()
  })
})
