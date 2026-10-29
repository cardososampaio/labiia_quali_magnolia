/**
 * Finding R and preparing the environment the lexical analyses run it in.
 *
 * The app does not install R itself (the Windows installer offers to): it
 * uses the newest R (4.0 or later) on the computer, or the Rscript the user
 * picked in Preferences. CRAN packages go to a library of labiia_quali's own, so
 * installing them never changes the user's other R projects, and a new R
 * version (which needs packages rebuilt for it) gets a fresh library.
 */
import { app } from 'electron'
import { execFile } from 'child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

export interface RInstallation {
  rscript: string
  /** "4.6.1" */
  version: string
  /** Where labiia_quali keeps its CRAN packages for this R version. */
  libDir: string
}

export interface RStatus {
  found: boolean
  installation?: RInstallation
  /** Path chosen in Preferences ('' = find automatically). */
  configuredPath: string
  /** Why the configured or detected R could not be used. */
  problem?: string
}

const MIN_VERSION = [4, 0, 0]
const RSCRIPT = process.platform === 'win32' ? 'Rscript.exe' : 'Rscript'

function settingsPath(): string {
  return join(app.getPath('userData'), 'lexical-r.json')
}

export function readConfiguredRPath(): string {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(), 'utf-8'))
    return typeof raw?.rscriptPath === 'string' ? raw.rscriptPath : ''
  } catch {
    return ''
  }
}

export function writeConfiguredRPath(path: string): void {
  writeFileSync(settingsPath(), JSON.stringify({ rscriptPath: path }, null, 2), 'utf-8')
  cached = null
}

/** Accepts the Rscript executable, R's bin folder or R's home folder. */
function rscriptFromUserPath(p: string): string | null {
  const candidates = [p, join(p, RSCRIPT), join(p, 'bin', RSCRIPT), join(p, 'bin', 'x64', RSCRIPT)]
  return candidates.find((c) => c.toLowerCase().endsWith(RSCRIPT.toLowerCase()) && existsSync(c)) ?? null
}

function run(file: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, windowsHide: true, env: rEnvironment() }, (err, stdout, stderr) => {
      const errCode = (err as { code?: unknown } | null)?.code
      const code = !err ? 0 : typeof errCode === 'number' ? errCode : -1
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), code })
    })
  })
}

/** Where Rscript sits inside an R home folder (64-bit builds of older R keep it in bin\x64). */
export function rscriptsInHome(home: string): string[] {
  return process.platform === 'win32' ? [join(home, 'bin', RSCRIPT), join(home, 'bin', 'x64', RSCRIPT)] : [join(home, 'bin', RSCRIPT)]
}

/** Rscript named by the environment: RSCRIPT_PATH (as labiia_lex reads it) or R's home in R_HOME. */
export function environmentCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = []
  for (const v of [env.LABIIA_RSCRIPT_PATH, env.RSCRIPT_PATH]) if (v?.trim()) out.push(v.trim())
  if (env.R_HOME?.trim()) out.push(...rscriptsInHome(env.R_HOME.trim()))
  return out
}

/** Rscript paths the Windows registry knows about (R's installer writes them, per machine or per user). */
async function registryCandidates(): Promise<string[]> {
  if (process.platform !== 'win32') return []
  const out: string[] = []
  for (const hive of ['HKLM', 'HKCU']) {
    for (const key of ['SOFTWARE\\R-core\\R64', 'SOFTWARE\\R-core\\R', 'SOFTWARE\\WOW6432Node\\R-core\\R']) {
      const { stdout } = await run('reg', ['query', `${hive}\\${key}`, '/v', 'InstallPath'], 5000)
      const m = stdout.match(/InstallPath\s+REG_SZ\s+(.+)/)
      if (m) out.push(...rscriptsInHome(m[1].trim()))
    }
  }
  return out
}

function folderCandidates(): string[] {
  const roots: string[] = []
  if (process.platform === 'win32') {
    const pf = [process.env['ProgramFiles'], process.env['ProgramW6432'], process.env['ProgramFiles(x86)']]
    for (const p of pf) if (p) roots.push(join(p, 'R'))
    if (process.env.LOCALAPPDATA) roots.push(join(process.env.LOCALAPPDATA, 'Programs', 'R'), join(process.env.LOCALAPPDATA, 'R'))
    roots.push('C:\\R', 'C:\\tools\\R')
  } else {
    return ['/usr/local/bin/Rscript', '/usr/bin/Rscript', '/opt/homebrew/bin/Rscript',
      '/Library/Frameworks/R.framework/Resources/bin/Rscript']
  }
  const out: string[] = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    try {
      for (const d of readdirSync(root)) out.push(...rscriptsInHome(join(root, d)))
    } catch { /* unreadable folder */ }
  }
  return out
}

async function pathCandidates(): Promise<string[]> {
  const { stdout } = await run(process.platform === 'win32' ? 'where' : 'which', [RSCRIPT], 5000)
  return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
}

function parseVersion(text: string): string | null {
  const m = text.match(/version\s+(\d+)\.(\d+)\.(\d+)/i)
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null
}

function versionAtLeast(v: string, min: number[]): boolean {
  const parts = v.split('.').map(Number)
  for (let i = 0; i < min.length; i++) {
    if ((parts[i] ?? 0) !== min[i]) return (parts[i] ?? 0) > min[i]
  }
  return true
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

async function probe(rscript: string): Promise<string | null> {
  if (!existsSync(rscript)) return null
  const { stdout, stderr } = await run(rscript, ['--version'], 15000)
  return parseVersion(stdout + '\n' + stderr)
}

export function libDirFor(version: string): string {
  const [major, minor] = version.split('.')
  const base = process.platform === 'win32' && process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'labiia_quali')
    : app.getPath('userData')
  return join(base, 'R', 'library', `${major}.${minor}`)
}

let cached: RStatus | null = null

/** Finds R. The result is kept until `refresh` is asked for or the path changes. */
export async function resolveR(refresh = false): Promise<RStatus> {
  if (cached && !refresh) return cached
  const configuredPath = readConfiguredRPath()

  if (configuredPath) {
    const rscript = rscriptFromUserPath(configuredPath)
    const version = rscript ? await probe(rscript) : null
    if (!rscript || !version) {
      cached = { found: false, configuredPath, problem: 'not-runnable' }
      return cached
    }
    if (!versionAtLeast(version, MIN_VERSION)) {
      cached = { found: false, configuredPath, problem: 'too-old', installation: { rscript, version, libDir: libDirFor(version) } }
      return cached
    }
    cached = { found: true, configuredPath, installation: { rscript, version, libDir: libDirFor(version) } }
    return cached
  }

  const seen = new Set<string>()
  const candidates: string[] = []
  // The same places labiia_lex looks; the newest R wins.
  for (const c of [...environmentCandidates(), ...(await registryCandidates()), ...folderCandidates(), ...(await pathCandidates())]) {
    const key = c.toLowerCase()
    if (!seen.has(key)) { seen.add(key); candidates.push(c) }
  }
  let best: { rscript: string; version: string } | null = null
  for (const rscript of candidates) {
    const version = await probe(rscript)
    if (!version || !versionAtLeast(version, MIN_VERSION)) continue
    if (!best || compareVersions(version, best.version) > 0) best = { rscript, version }
  }
  cached = best
    ? { found: true, configuredPath, installation: { ...best, libDir: libDirFor(best.version) } }
    : { found: false, configuredPath, problem: 'not-found' }
  return cached
}

/**
 * Environment for Rscript. R on Windows cannot read UTF-8 scripts under the
 * Unix-only "C.UTF-8" locale that some terminals pass down, so that value is
 * dropped there; every other variable is kept.
 */
export function rEnvironment(libDir?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  if (process.platform === 'win32') {
    for (const k of Object.keys(env)) {
      if ((k === 'LANG' || k.startsWith('LC_')) && /^c\.utf-?8$/i.test(env[k] ?? '')) delete env[k]
    }
  }
  if (libDir) {
    env.R_LIBS_USER = libDir
    env.LABIIA_R_LIBS = libDir
  }
  return env
}

export function ensureLibDir(libDir: string): void {
  if (!existsSync(libDir)) mkdirSync(libDir, { recursive: true })
}

/** R's home folder, from the Rscript path (…/R-4.6.1/bin/Rscript.exe). */
export function rHomeOf(rscript: string): string {
  const bin = dirname(rscript)
  return bin.toLowerCase().endsWith('x64') ? dirname(dirname(bin)) : dirname(bin)
}
