import { describe, expect, it } from 'vitest'
import { describeImportErrors, isAccessDenied } from '../../src/renderer/utils/import-errors'

// A file Windows refuses to open is explained in plain words, not as "EPERM".
describe('import errors', () => {
  it('recognises access denied', () => {
    expect(isAccessDenied("Campos,2004.pdf: EPERM: operation not permitted, open 'C:\\x\\Campos,2004.pdf'")).toBe(true)
    expect(isAccessDenied('a.pdf: unsupported format')).toBe(false)
  })
  it('replaces the system code and adds the explanation once', () => {
    const text = describeImportErrors(["a.pdf: EPERM: operation not permitted, open 'C:\\a.pdf'", "b.pdf: EPERM: operation not permitted, open 'C:\\b.pdf'"])
    expect(text).not.toContain('EPERM')
    expect(text.split('Avast').length - 1).toBe(1)
  })
  it('leaves other errors as they are', () => {
    expect(describeImportErrors(['a.pdf: unsupported format'])).toBe('a.pdf: unsupported format')
  })
})

describe('access denied from the Rust side', () => {
  it('reads Windows\' "os error 5" as an antivirus block', () => {
    expect(isAccessDenied('Access is denied. (os error 5)')).toBe(true)
    expect(describeImportErrors(['a.docx: Access is denied. (os error 5)'])).toContain('\n\n')
  })
})
