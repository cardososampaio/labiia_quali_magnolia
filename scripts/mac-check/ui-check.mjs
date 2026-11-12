#!/usr/bin/env node
/**
 * Opens the real program (a development build) on a made-up project and
 * checks, as a researcher would:
 *   - the main window opens;
 *   - Program diagnostics marks every part as working;
 *   - Word cloud, CHD and Textual network run and show their result.
 * Photos of the window are taken on a Mac (where window capture exists),
 * so a build for a system nobody on the team has can still be seen.
 *
 *   node scripts/mac-check/ui-check.mjs [--out <folder>] [--data <folder>] [--skip-build]
 *
 * --out   where photos, the log (report.txt) and the diagnostics data go
 *         (default mac-check-report/ui)
 * --data  the program's data folder for this run (default <out>/userdata);
 *         give the folder a parity run installed R packages into to reuse them
 * --mode  no-r: a counter-check on a computer without R, where Program
 *         diagnostics must mark R as missing and a lexical analysis must
 *         offer to download it, while analyses without R still run
 *
 * Uses Magnolia's debug-only automation hook (src-tauri/src/automation.rs):
 * the project is a scratch copy and the preferences are the run's own, so a
 * researcher's projects and settings are untouched. Exits with 1 when a
 * check fails (a line starting with ISSUE in report.txt).
 */
import { spawn, execFileSync } from 'node:child_process'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { corpus } from './corpus.mjs'

const ROOT = path.resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const option = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args.splice(i, 2)[1] }
const OUT = path.resolve(option('--out') ?? path.join(ROOT, 'mac-check-report', 'ui'))
const DATA = path.resolve(option('--data') ?? path.join(OUT, 'userdata'))
const MODE = option('--mode') ?? 'normal'
const ONLY = (option('--only') ?? '').split(',').filter(Boolean)
const skipBuild = args.includes('--skip-build')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const exe = process.platform === 'win32' ? '.exe' : ''

const portOpenOn = (port, host) => new Promise((resolve) => {
  const s = net.connect(port, host)
  s.on('connect', () => { s.destroy(); resolve(true) })
  s.on('error', () => resolve(false))
})
const portOpen = async (port) => (await portOpenOn(port, '127.0.0.1')) || (await portOpenOn(port, '::1'))

/** The project: the check corpus as documents, nothing coded. */
function fixture() {
  let n = 0
  const id = () => `00000000-0000-4000-8000-${(++n).toString(16).toUpperCase().padStart(12, '0')}`
  const WHEN = '2026-01-15T10:00:00.000Z'
  const user = id()
  const docs = corpus().map((d) => ({ guid: id(), ...d }))
  return {
    project: {
      name: 'Teste do Mac',
      origin: 'labiia_quali mac-check',
      description: 'Entrevistas inventadas para conferir o programa.',
      creatingUserGUID: user, creationDateTime: WHEN, modifyingUserGUID: '', modifiedDateTime: WHEN,
      users: [{ guid: user, name: 'Teste' }],
      codes: [],
      sources: docs.map(({ guid, name }) => ({
        guid, name, plainTextPath: `internal://${guid}.txt`, creatingUser: user, creationDateTime: WHEN, modifyingUser: '', selections: []
      })),
      folders: [], sourceFolder: {}, quotes: [], notes: [], savedAnalyses: [], tagCategories: [], sets: [], savedQueries: [], memos: []
    },
    sourceContents: Object.fromEntries(docs.map((d) => [d.guid, d.text]))
  }
}

const targetDir = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1', '--no-deps'], { cwd: ROOT, maxBuffer: 64 << 20 }).toString()).target_directory

fs.rmSync(path.join(OUT, 'run'), { recursive: true, force: true })
fs.mkdirSync(path.join(OUT, 'run'), { recursive: true })
fs.mkdirSync(DATA, { recursive: true })

let vite = null
if (!(await portOpen(5173))) {
  vite = spawn('npx', ['vite'], { cwd: ROOT, stdio: 'ignore', detached: process.platform !== 'win32', shell: process.platform === 'win32' })
  for (let i = 0; i < 120 && !(await portOpen(5173)); i++) await sleep(500)
}

const lines = []
const programLines = []
try {
  if (!skipBuild) {
    execFileSync('cargo', ['build'], { cwd: path.join(ROOT, 'src-tauri'), stdio: 'inherit' })
    execFileSync('cargo', ['build', '--example', 'qdpx_tool', '-p', 'magnolia-core'], { cwd: ROOT, stdio: 'inherit' })
  }
  const project = path.join(OUT, 'run', 'Teste do Mac.qdpx')
  const json = path.join(OUT, 'run', 'fixture.json')
  fs.writeFileSync(json, JSON.stringify(fixture()))
  execFileSync(path.join(targetDir, 'debug', 'examples', `qdpx_tool${exe}`), ['write', json, project])

  // Preferences of a researcher who chose Portuguese and the ribbon. Kept
  // if the data folder already has some (a parity run's).
  const prefs = path.join(DATA, 'magnolia-preferences.json')
  if (!fs.existsSync(prefs)) fs.writeFileSync(prefs, JSON.stringify({ userName: 'Teste', toolbarStyle: 'ribbon', language: 'pt-BR' }))

  const script = path.join(OUT, 'run', 'checks.js')
  fs.writeFileSync(script, `const OUT = ${JSON.stringify(OUT.replace(/\\/g, '/'))};\nconst MODE = ${JSON.stringify(MODE)};\nconst ONLY = ${JSON.stringify(ONLY)};\n` + fs.readFileSync(path.join(import.meta.dirname, 'ui-checks.js'), 'utf8'))

  // A window can fail to open while the web view of a copy that just closed
  // is still letting go of its files; the program then closes at once. Try
  // again a little later.
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      console.log(`  the program closed before starting the checks; trying again (${attempt}/3)`)
      lines.length = 0
      await sleep(20000)
    }
    await runProgram()
    if (lines.some((l) => !l.startsWith('ISSUE the program closed'))) break
  }
  // The program's own logs (labiia_quali.log, helper.log) go with the report.
  fs.cpSync(path.join(DATA, 'logs'), path.join(OUT, 'logs'), { recursive: true, force: true })

  function runProgram() {
    return new Promise((resolve) => {
      const child = spawn(path.join(targetDir, 'debug', `magnolia${exe}`), [project], {
        env: { ...process.env, MAGNOLIA_AUTOMATION: script, MAGNOLIA_AUTOMATION_DATA: DATA },
        stdio: ['ignore', 'ignore', 'pipe']
      })
      if (process.platform === 'darwin') {
        setTimeout(() => {
          try { execFileSync('osascript', ['-e', `tell application "System Events" to set frontmost of (first process whose unix id is ${child.pid}) to true`]) } catch { /* captures still work */ }
        }, 5000)
      }
      const timer = setTimeout(() => { lines.push('ISSUE the check took longer than 30 minutes'); child.kill() }, 30 * 60 * 1000)
      let buf = ''
      child.stderr.on('data', (d) => {
        buf += d
        const parts = buf.split('\n')
        buf = parts.pop()
        for (const line of parts) {
          const m = line.match(/\[automation\] (.*)/)
          if (!m) {
            // The program's own messages, kept for when it closes too early.
            programLines.push(line)
            continue
          }
          if (m[1].startsWith('DIAGNOSTICS ')) {
            fs.writeFileSync(path.join(OUT, 'diagnostics.json'), m[1].slice(12))
            continue
          }
          lines.push(m[1])
          console.log('  ' + m[1].slice(0, 300))
        }
      })
      child.on('exit', (code) => {
        clearTimeout(timer)
        if (!lines.some((l) => l.startsWith('DONE'))) lines.push(`ISSUE the program closed before the checks ended (exit ${code})`)
        resolve()
      })
    })
  }
} finally {
  if (vite) {
    try {
      if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(vite.pid), '/T', '/F'], { stdio: 'ignore' })
      else process.kill(-vite.pid)
    } catch { /* already gone */ }
  }
}

fs.writeFileSync(path.join(OUT, 'report.txt'), lines.join('\n') + '\n')
fs.writeFileSync(path.join(OUT, 'program.txt'), programLines.join('\n') + '\n')
if (lines.some((l) => l.startsWith('ISSUE the program closed'))) console.log(programLines.slice(-40).join('\n'))
const issues = lines.filter((l) => l.startsWith('ISSUE'))
console.log(issues.length ? `\n${issues.length} problem(s):\n${issues.join('\n')}` : '\nAll checks passed.')
process.exitCode = issues.length ? 1 : 0
