import { describe, it, expect, vi, beforeAll } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// The R bridge must find R, run a script in its own folder, stop it on
// Cancel or when its time is up, and tell a finished run from a failed one.
// These tests run R itself and are skipped on computers without R.

const userData = mkdtempSync(join(tmpdir(), 'lexical-r-test-'))
vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'temp' ? tmpdir() : userData) }
}))

const { resolveR, rEnvironment, libDirFor } = await import('../../src/main/lexical/r-runtime')
const { runRScript, cancelRun, missingOutputs } = await import('../../src/main/lexical/r-runner')
const { checkPackages, validPackages } = await import('../../src/main/lexical/r-packages')

const status = await resolveR(true)
const r = status.installation
const withR = status.found ? it : it.skip

describe('R environment', () => {
  it('drops the Unix-only C.UTF-8 locale on Windows and sets the package folder', () => {
    const before = process.env.LC_ALL
    process.env.LC_ALL = 'C.UTF-8'
    const env = rEnvironment('X:/lib')
    if (process.platform === 'win32') expect(env.LC_ALL).toBeUndefined()
    else expect(env.LC_ALL).toBe('C.UTF-8')
    expect(env.R_LIBS_USER).toBe('X:/lib')
    if (before === undefined) delete process.env.LC_ALL
    else process.env.LC_ALL = before
  })

  it('keeps one package folder per R minor version', () => {
    expect(libDirFor('4.6.1')).toMatch(/[\\/]R[\\/]library[\\/]4\.6$/)
    expect(libDirFor('4.6.2')).toBe(libDirFor('4.6.1'))
  })

  it('accepts only valid CRAN package names', () => {
    expect(validPackages(['ggplot2', 'quanteda.textstats', 'x; system("rm")', 'ggplot2'])).toEqual(['ggplot2', 'quanteda.textstats'])
  })

  it('reports empty or missing outputs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lexical-out-'))
    writeFileSync(join(dir, 'full.txt'), 'x')
    writeFileSync(join(dir, 'empty.txt'), '')
    expect(missingOutputs([join(dir, 'full.txt'), join(dir, 'empty.txt'), join(dir, 'none.txt')]))
      .toEqual([join(dir, 'empty.txt'), join(dir, 'none.txt')])
  })
})

describe('running R', () => {
  let dir = ''
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'lexical-run-')) })

  withR('finds R 4 or newer', () => {
    expect(r!.version.split('.')[0] >= '4').toBe(true)
    expect(existsSync(r!.rscript)).toBe(true)
  })

  withR('runs a script, writes its output and reads UTF-8 text', async () => {
    const script = join(dir, 'ok.R')
    writeFileSync(script, 'writeLines(enc2utf8("ação não pré-escola"), "out.txt", useBytes = TRUE)\ncat("feito\\n")\n', 'utf-8')
    const res = await runRScript(r!, 'ok', { script, cwd: dir, timeoutMs: 60_000, expectedOutputs: [join(dir, 'out.txt')] })
    expect(res.ok).toBe(true)
    expect(res.stdout).toContain('feito')
    expect(readFileSync(join(dir, 'out.txt'), 'utf-8').trim()).toBe('ação não pré-escola')
  }, 60_000)

  withR('fails a run whose expected output is missing, even with exit code 0', async () => {
    const script = join(dir, 'noout.R')
    writeFileSync(script, 'cat("sem saída\\n")\n', 'utf-8')
    const res = await runRScript(r!, 'noout', { script, cwd: dir, timeoutMs: 60_000, expectedOutputs: [join(dir, 'never.txt')] })
    expect(res.exitCode).toBe(0)
    expect(res.ok).toBe(false)
    expect(res.missingOutputs).toEqual([join(dir, 'never.txt')])
  }, 60_000)

  withR('reports an R error as a failure', async () => {
    const script = join(dir, 'err.R')
    writeFileSync(script, 'stop("erro proposital")\n', 'utf-8')
    const res = await runRScript(r!, 'err', { script, cwd: dir, timeoutMs: 60_000 })
    expect(res.ok).toBe(false)
    expect(res.stderr).toContain('erro proposital')
  }, 60_000)

  withR('stops a run on Cancel', async () => {
    const script = join(dir, 'long.R')
    writeFileSync(script, 'Sys.sleep(60)\n', 'utf-8')
    const started = Date.now()
    const pending = runRScript(r!, 'long', { script, cwd: dir, timeoutMs: 120_000 })
    setTimeout(() => cancelRun('long'), 1500)
    const res = await pending
    expect(res.cancelled).toBe(true)
    expect(res.ok).toBe(false)
    expect(Date.now() - started).toBeLessThan(30_000)
  }, 60_000)

  withR('stops a run that exceeds its time limit', async () => {
    const script = join(dir, 'slow.R')
    writeFileSync(script, 'Sys.sleep(60)\n', 'utf-8')
    const res = await runRScript(r!, 'slow', { script, cwd: dir, timeoutMs: 2000 })
    expect(res.timedOut).toBe(true)
    expect(res.ok).toBe(false)
  }, 60_000)

  withR('checks each package on its own', async () => {
    const res = await checkPackages(r!, ['stats', 'pacoteQueNaoExiste123'])
    expect(res).toEqual({ stats: true, pacoteQueNaoExiste123: false })
  }, 120_000)
})
