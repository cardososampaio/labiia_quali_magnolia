#!/usr/bin/env node
// Puts the Node runtime that runs labiia_quali's helper where Tauri bundles
// it: src-tauri/binaries/labiia-node-<target> (Tauri's sidecar naming).
//
// The target is the one Tauri is building for (TAURI_ENV_TARGET_TRIPLE, or
// `--target <triple>`), else this machine's own. Each target's download is
// pinned in scripts/helper-node.json and must match its SHA-256, so every
// build ships the same, untampered Node. A file already in place whose pin
// is unchanged is kept.
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pins = JSON.parse(readFileSync(join(root, 'scripts', 'helper-node.json'), 'utf-8'))

function hostTriple() {
  if (process.platform === 'win32' && process.arch === 'x64') return 'x86_64-pc-windows-msvc'
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'aarch64-apple-darwin'
  return `${process.arch}-${process.platform}`
}

const argTarget = process.argv.indexOf('--target')
const triple =
  (argTarget > 0 && process.argv[argTarget + 1]) || process.env.TAURI_ENV_TARGET_TRIPLE || hostTriple()
const pin = pins.targets[triple]
if (!pin) {
  console.error(
    `No helper Node is pinned for ${triple}. labiia_quali is built for: ${Object.keys(pins.targets).join(', ')}.`
  )
  process.exit(1)
}

const exe = triple.includes('windows') ? '.exe' : ''
const target = join(root, 'src-tauri', 'binaries', `labiia-node-${triple}${exe}`)
// Remembers which download the file in place came from: for an archive the
// hash is the archive's, not the extracted program's.
const stamp = target + '.sha256'

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

if (existsSync(target) && existsSync(stamp) && readFileSync(stamp, 'utf-8').trim() === pin.sha256) {
  console.log(`helper Node ${pins.version} for ${triple} already in place`)
  process.exit(0)
}
if (!pin.member && existsSync(target) && sha256(readFileSync(target)) === pin.sha256) {
  writeFileSync(stamp, pin.sha256)
  console.log(`helper Node ${pins.version} for ${triple} already in place`)
  process.exit(0)
}

console.log(`downloading Node ${pins.version} for the helper (${triple})…`)
const res = await fetch(pin.url)
if (!res.ok) {
  console.error(`download failed: HTTP ${res.status} ${pin.url}`)
  process.exit(1)
}
const buf = Buffer.from(await res.arrayBuffer())
const got = sha256(buf)
if (got !== pin.sha256) {
  console.error(`SHA-256 mismatch for ${pin.url}\n  expected ${pin.sha256}\n  got      ${got}`)
  process.exit(1)
}

let program = buf
if (pin.member) {
  // The macOS download is a .tar.gz; only its `bin/node` is shipped.
  const work = mkdtempSync(join(tmpdir(), 'labiia-node-'))
  try {
    writeFileSync(join(work, 'node.tar.gz'), buf)
    // Relative names: some tar builds read `C:\…` as a remote host.
    execFileSync('tar', ['-xzf', 'node.tar.gz', pin.member], { cwd: work })
    program = readFileSync(join(work, pin.member))
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

mkdirSync(dirname(target), { recursive: true })
writeFileSync(target + '.tmp', program)
renameSync(target + '.tmp', target)
if (!exe) chmodSync(target, 0o755)
writeFileSync(stamp, pin.sha256)
console.log(`helper Node ${pins.version} saved to ${target}`)
