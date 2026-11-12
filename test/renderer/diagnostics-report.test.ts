import { describe, expect, it } from 'vitest'
import { diagnosticItems, diagnosticReport, type DiagnosticsData } from '../../src/renderer/labiia/diagnostics-report'
import { describeImportErrors } from '../../src/renderer/utils/import-errors'

// The program's diagnostics name the part that failed and what to do, so a
// problem on a computer nobody on the team can reach can still be fixed
// from the report the researcher sends.

function healthy(): DiagnosticsData {
  return {
    program: {
      version: '0.2.2', os: 'macos', osVersion: '15.3', arch: 'aarch64', machine: 'Apple M1',
      executable: '/Applications/labiia_quali.app/Contents/MacOS/labiia_quali',
      resourceDir: '/Applications/labiia_quali.app/Contents/Resources',
      dataDir: '/Users/x/Library/Application Support/labiia_quali', dataWritable: true
    },
    node: { found: '/Applications/labiia_quali.app/Contents/MacOS/labiia-node', lookedIn: ['/Applications/labiia_quali.app/Contents/MacOS/labiia-node'] },
    helperScript: '/Applications/labiia_quali.app/Contents/Resources/helper/labiia-helper.cjs',
    lexicalResources: '/Applications/labiia_quali.app/Contents/Resources',
    ping: { ok: { node: '24.22.2', missingResources: [] } },
    selfCheck: {
      ok: {
        missingResources: [], tempWritable: true, tempDir: '/tmp',
        r: {
          found: true, configuredPath: '',
          installation: { rscript: '/Library/Frameworks/R.framework/Resources/bin/Rscript', version: '4.6.1', libDir: '/x' },
          searched: [{ path: '/Library/Frameworks/R.framework/Resources/bin/Rscript', version: '4.6.1' }]
        },
        packages: { ggplot2: true, igraph: true }
      }
    },
    libreOffice: null,
    crash: null,
    logs: { folder: '/logs', program: ['started'], helper: [] }
  }
}

const states = (d: DiagnosticsData): Record<string, string> =>
  Object.fromEntries(diagnosticItems(d).map((i) => [i.id, i.state]))

describe('program diagnostics', () => {
  it('marks every part as working on a healthy installation (LibreOffice is optional)', () => {
    const s = states(healthy())
    expect(s).toMatchObject({ program: 'ok', data: 'ok', helper: 'ok', resources: 'ok', r: 'ok', packages: 'ok', libreoffice: 'warn' })
    expect(Object.values(s).filter((v) => v === 'bad')).toHaveLength(0)
  })

  it('names a missing bundled component as an incomplete installation, not as R missing', () => {
    const d = healthy()
    d.node.found = null
    d.ping = { error: 'helper-unavailable: labiia-node not found' }
    d.selfCheck = { error: 'not-checked' }
    const items = diagnosticItems(d)
    expect(items.find((i) => i.id === 'helper')?.state).toBe('bad')
    expect(items.find((i) => i.id === 'r')?.state).toBe('warn')
    expect(diagnosticReport(d, items)).toContain('/Applications/labiia_quali.app/Contents/MacOS/labiia-node')
  })

  it('on a Mac, a component the system refused to run points to Privacy & Security', () => {
    const d = healthy()
    d.ping = { error: 'helper-unavailable: Permission denied (os error 13)' }
    d.selfCheck = { error: 'not-checked' }
    const helper = diagnosticItems(d).find((i) => i.id === 'helper')!
    expect(helper.state).toBe('bad')
    expect(helper.advice).toMatch(/Privacy|Privacidade/)
  })

  it('when R is missing, the report lists every place it was looked for', () => {
    const d = healthy()
    d.selfCheck.ok!.r = {
      found: false, configuredPath: '', problem: 'not-found',
      searched: [{ path: '/opt/homebrew/bin/Rscript', version: null }, { path: '/usr/local/bin/Rscript', version: null }]
    }
    d.selfCheck.ok!.packages = null
    const items = diagnosticItems(d)
    expect(items.find((i) => i.id === 'r')?.state).toBe('bad')
    expect(items.some((i) => i.id === 'packages')).toBe(false)
    const report = diagnosticReport(d, items)
    expect(report).toContain('/opt/homebrew/bin/Rscript')
    expect(report).toContain('/usr/local/bin/Rscript')
  })

  it('lists the missing R packages by name', () => {
    const d = healthy()
    d.selfCheck.ok!.packages = { ggplot2: true, igraph: false, sna: false }
    const p = diagnosticItems(d).find((i) => i.id === 'packages')!
    expect(p.state).toBe('warn')
    expect(p.detail).toContain('igraph')
    expect(p.detail).toContain('sna')
  })

  it('a crash last time shows up with its cause in the report', () => {
    const d = healthy()
    d.crash = 'labiia_quali 0.2.2 (macos aarch64) closed unexpectedly\npanicked at src/x.rs:1'
    const items = diagnosticItems(d)
    expect(items.find((i) => i.id === 'crash')?.state).toBe('warn')
    expect(diagnosticReport(d, items)).toContain('panicked at src/x.rs:1')
  })
})

describe('blocked files on a Mac', () => {
  it('points to the privacy setting, not to an antivirus', () => {
    const text = describeImportErrors(["a.pdf: EPERM: operation not permitted, open '/Users/x/Desktop/a.pdf'"], true)
    expect(text).not.toContain('EPERM')
    expect(text).not.toContain('Avast')
    expect(text).toMatch(/macOS/)
  })
})
