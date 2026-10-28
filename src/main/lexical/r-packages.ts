/**
 * Checking and installing the CRAN packages the lexical analyses need, in
 * labiia_quali's own R library (see r-runtime.ts). Each package is checked
 * on its own, so one missing package never hides the state of the others.
 */
import { app } from 'electron'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { runRScript, cancelRun } from './r-runner'
import type { RInstallation } from './r-runtime'

const CRAN = 'https://cloud.r-project.org'
const VALID_NAME = /^[A-Za-z][A-Za-z0-9.]*$/

function tempDir(prefix: string): string {
  const base = join(app.getPath('temp'), 'labiia-lexical')
  mkdirSync(base, { recursive: true })
  return mkdtempSync(join(base, prefix))
}

/** R string literal for a path (forward slashes work on every platform). */
function rString(s: string): string {
  return JSON.stringify(s.replace(/\\/g, '/'))
}

function packageVector(packages: string[]): string {
  return `c(${packages.map((p) => JSON.stringify(p)).join(', ')})`
}

export function validPackages(packages: string[]): string[] {
  return [...new Set(packages)].filter((p) => VALID_NAME.test(p))
}

/** Which of the packages can be loaded, looking in labiia_quali's library first. */
export async function checkPackages(r: RInstallation, packages: string[]): Promise<Record<string, boolean>> {
  const pkgs = validPackages(packages)
  const result: Record<string, boolean> = {}
  if (pkgs.length === 0) return result
  const dir = tempDir('check-')
  try {
    const script = join(dir, 'check.R')
    writeFileSync(script, [
      `.libPaths(c(${rString(r.libDir)}, .libPaths()))`,
      `for (p in ${packageVector(pkgs)}) cat("@@PKG", p, if (requireNamespace(p, quietly = TRUE)) "1" else "0", "\\n")`
    ].join('\n'), 'utf-8')
    const run = await runRScript(r, `check-${Date.now()}`, { script, cwd: dir, timeoutMs: 120_000 })
    for (const p of pkgs) result[p] = false
    for (const m of run.stdout.matchAll(/@@PKG (\S+) ([01])/g)) result[m[1]] = m[2] === '1'
    return result
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export interface InstallProgress {
  /** Package being installed, or '' when done. */
  current: string
  done: number
  total: number
  line?: string
}

export interface InstallResult {
  ok: boolean
  installed: string[]
  failed: string[]
  cancelled: boolean
  log: string
}

const INSTALL_RUN_ID = 'install-packages'

/**
 * Installs the packages from CRAN (Windows and macOS binaries, so no
 * compiler is needed), with the packages they depend on. Takes several
 * minutes on a first install and needs internet.
 */
export async function installPackages(
  r: RInstallation,
  packages: string[],
  onProgress: (p: InstallProgress) => void
): Promise<InstallResult> {
  const pkgs = validPackages(packages)
  const dir = tempDir('install-')
  try {
    const script = join(dir, 'install.R')
    writeFileSync(script, [
      `lib <- ${rString(r.libDir)}`,
      'dir.create(lib, recursive = TRUE, showWarnings = FALSE)',
      '.libPaths(c(lib, .libPaths()))',
      `options(repos = c(CRAN = ${JSON.stringify(CRAN)}), timeout = 600)`,
      'type <- if (.Platform$OS.type == "windows" || Sys.info()[["sysname"]] == "Darwin") "binary" else getOption("pkgType")',
      `for (p in ${packageVector(pkgs)}) {`,
      '  cat("@@START", p, "\\n"); flush.console()',
      '  if (!requireNamespace(p, quietly = TRUE)) {',
      '    try(install.packages(p, lib = lib, type = type, dependencies = c("Depends", "Imports", "LinkingTo")), silent = FALSE)',
      '  }',
      '  cat("@@END", p, if (requireNamespace(p, quietly = TRUE)) "1" else "0", "\\n"); flush.console()',
      '}'
    ].join('\n'), 'utf-8')
    const installed: string[] = []
    const failed: string[] = []
    let done = 0
    onProgress({ current: pkgs[0] ?? '', done, total: pkgs.length })
    const run = await runRScript(r, INSTALL_RUN_ID, {
      script,
      cwd: dir,
      timeoutMs: 60 * 60_000,
      onOutput: (line) => {
        const start = line.match(/^@@START (\S+)/)
        const end = line.match(/^@@END (\S+) ([01])/)
        if (start) onProgress({ current: start[1], done, total: pkgs.length })
        else if (end) {
          done++
          ;(end[2] === '1' ? installed : failed).push(end[1])
          onProgress({ current: '', done, total: pkgs.length })
        } else if (line.trim()) onProgress({ current: '', done, total: pkgs.length, line: line.slice(0, 300) })
      }
    })
    const unreported = pkgs.filter((p) => !installed.includes(p) && !failed.includes(p))
    return {
      ok: run.ok && failed.length === 0 && unreported.length === 0,
      installed,
      failed: [...failed, ...unreported],
      cancelled: run.cancelled,
      log: (run.stdout + '\n' + run.stderr).slice(-20_000)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function cancelInstall(): boolean {
  return cancelRun(INSTALL_RUN_ID)
}
