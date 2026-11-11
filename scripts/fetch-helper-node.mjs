#!/usr/bin/env node
// Puts the Node runtime that runs labiia_quali's helper where Tauri bundles
// it (src-tauri/binaries/labiia-node-x86_64-pc-windows-msvc.exe).
//
// The version is pinned in scripts/helper-node.json and the download must
// match its SHA-256, so every build ships the same, untampered Node. A file
// already in place with the right hash is kept.
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pin = JSON.parse(readFileSync(join(root, 'scripts', 'helper-node.json'), 'utf-8'))
const target = join(root, 'src-tauri', 'binaries', 'labiia-node-x86_64-pc-windows-msvc.exe')

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

if (existsSync(target) && sha256(readFileSync(target)) === pin.sha256) {
  console.log(`helper Node ${pin.version} already in place`)
  process.exit(0)
}

console.log(`downloading Node ${pin.version} for the helper…`)
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
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target + '.tmp', buf)
renameSync(target + '.tmp', target)
console.log(`helper Node ${pin.version} saved to ${target}`)
