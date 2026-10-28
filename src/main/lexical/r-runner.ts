/**
 * Running R scripts for the lexical analyses: one Rscript process per run,
 * in its own temporary folder, with a time limit and a Cancel that stops R
 * and everything it started.
 */
import { spawn, execFile, type ChildProcess } from 'child_process'
import { existsSync, statSync } from 'fs'
import { rEnvironment, ensureLibDir, type RInstallation } from './r-runtime'

export interface RRunOptions {
  /** Script file to run. */
  script: string
  args?: string[]
  /** Folder R works in; outputs are written there. */
  cwd: string
  timeoutMs: number
  /** Output files the run must produce. Also used to judge Windows exit codes, see below. */
  expectedOutputs?: string[]
  onOutput?: (line: string, stream: 'stdout' | 'stderr') => void
}

export interface RRunResult {
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  cancelled: boolean
  /** Expected outputs that are missing or empty. */
  missingOutputs: string[]
}

/**
 * Exit codes R on Windows sometimes reports while shutting down after the
 * work is done (access violation, heap corruption, stack overrun). A run that
 * ends with one of these still counts when every expected output was
 * written; without expected outputs it is a failure like any other.
 */
const WINDOWS_SHUTDOWN_CODES = new Set([
  0xC0000005, 0xC0000374, 0xC0000409, 0xC000041D,
  -1073741819, -1073740940, -1073740791, -1073740771
])

const running = new Map<string, ChildProcess>()

export function missingOutputs(files: string[]): string[] {
  return files.filter((f) => {
    try { return !existsSync(f) || statSync(f).size === 0 } catch { return true }
  })
}

/** Stops R and every process it started. */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return
  if (process.platform === 'win32') {
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => { /* already gone */ })
  } else {
    child.kill('SIGKILL')
  }
}

export function cancelRun(runId: string): boolean {
  const child = running.get(runId)
  if (!child) return false
  ;(child as ChildProcess & { cancelled?: boolean }).cancelled = true
  killTree(child)
  return true
}

export function runRScript(r: RInstallation, runId: string, opts: RRunOptions): Promise<RRunResult> {
  ensureLibDir(r.libDir)
  return new Promise((resolve) => {
    const child = spawn(r.rscript, ['--vanilla', opts.script, ...(opts.args ?? [])], {
      cwd: opts.cwd,
      env: rEnvironment(r.libDir),
      windowsHide: true
    })
    running.set(runId, child)
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; killTree(child) }, opts.timeoutMs)

    const lineReader = (stream: 'stdout' | 'stderr') => {
      let pending = ''
      return (chunk: Buffer): void => {
        const text = chunk.toString('utf-8')
        if (stream === 'stdout') stdout += text
        else stderr += text
        if (!opts.onOutput) return
        pending += text
        const lines = pending.split(/\r?\n/)
        pending = lines.pop() ?? ''
        for (const line of lines) opts.onOutput(line, stream)
      }
    }
    child.stdout?.on('data', lineReader('stdout'))
    child.stderr?.on('data', lineReader('stderr'))

    let finished = false
    const finish = (exitCode: number | null): void => {
      // 'error' (R could not start) may be followed by 'close'; report once.
      if (finished) return
      finished = true
      clearTimeout(timer)
      running.delete(runId)
      const cancelled = (child as ChildProcess & { cancelled?: boolean }).cancelled === true
      const expected = opts.expectedOutputs ?? []
      const missing = missingOutputs(expected)
      const cleanExit = exitCode === 0
      const acceptedShutdownCrash = exitCode !== null && WINDOWS_SHUTDOWN_CODES.has(exitCode) && expected.length > 0 && missing.length === 0
      resolve({
        ok: !timedOut && !cancelled && (cleanExit || acceptedShutdownCrash) && missing.length === 0,
        exitCode,
        stdout,
        stderr,
        timedOut,
        cancelled,
        missingOutputs: missing
      })
    }
    child.on('error', (err) => { stderr += String(err); finish(-1) })
    child.on('close', (code) => finish(code))
  })
}
