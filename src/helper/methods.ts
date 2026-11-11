/**
 * The lexical analyses' requests, as the interface makes them through
 * `window.api.lexical`: R status, the Rscript path chosen in Preferences,
 * package checks and installs, and running or cancelling a test.
 *
 * Same behaviour as the Electron build's IPC handlers. Picking the Rscript
 * file and saving a result file need a window, so the Rust side does those
 * with native dialogs and never sends them here.
 */
import { register, emit } from './protocol'
import { resolveR, writeConfiguredRPath } from './lexical/r-runtime'
import { checkPackages, installPackages, cancelInstall } from './lexical/r-packages'
import { runLexicalTest, cancelLexicalRun } from './lexical/engine'
import type { LexicalRunRequest } from '../renderer/models/lexical-api'

let installing = false

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export function registerLexicalMethods(): void {
  register('lexical.rStatus', (p) => resolveR((p as { refresh?: boolean } | null)?.refresh === true))

  register('lexical.setRPath', (p) => {
    const path = (p as { path?: unknown } | null)?.path
    writeConfiguredRPath(typeof path === 'string' ? path.trim() : '')
    return resolveR(true)
  })

  register('lexical.checkPackages', async (p) => {
    const r = await resolveR()
    if (!r.found || !r.installation) return { error: 'r-not-found' }
    try {
      return { status: await checkPackages(r.installation, asList((p as { packages?: unknown } | null)?.packages)) }
    } catch (err) {
      return { error: String(err) }
    }
  })

  register('lexical.installPackages', async (p) => {
    const r = await resolveR()
    if (!r.found || !r.installation) return { error: 'r-not-found' }
    if (installing) return { error: 'busy' }
    installing = true
    try {
      return await installPackages(r.installation, asList((p as { packages?: unknown } | null)?.packages), (progress) =>
        emit('lexical:r-install-progress', progress)
      )
    } finally {
      installing = false
    }
  })

  register('lexical.cancelInstall', () => cancelInstall())

  register('lexical.run', (p) =>
    runLexicalTest(p as LexicalRunRequest, (progress) => emit('lexical:run-progress', progress))
  )

  register('lexical.cancelRun', (p) => {
    const runId = (p as { runId?: unknown } | null)?.runId
    if (typeof runId === 'string') cancelLexicalRun(runId)
    return null
  })
}
