import { describe, expect, it } from 'vitest'
import { shouldConfirmClose } from '../../src/main/close-confirm'

// Closing asks first, except when Windows shuts down or an update installs.
describe('shouldConfirmClose', () => {
  it('asks when the person closes the program', () => {
    expect(shouldConfirmClose('user')).toBe(true)
  })
  it('does not ask when Windows is shutting down or an update installs', () => {
    expect(shouldConfirmClose('system-shutdown')).toBe(false)
    expect(shouldConfirmClose('update')).toBe(false)
  })
})
