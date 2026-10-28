/**
 * Prepared corpora kept on disk, so running a second test (or the same test
 * again) on the same documents skips preparation.
 *
 * A cached corpus is found by a fingerprint (SHA-256) of everything that
 * changes the result: the preparation version, the language, the segment
 * size, and each document's id, name and text. Editing one document, or
 * choosing another language, gives a new fingerprint, so a stale corpus is
 * never reused. The folder is capped; the least recently used corpora are
 * removed first.
 */
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import { serialize, deserialize } from 'v8'
import { PREPARATION_VERSION, type PreparedCorpus, type PrepareOptions, type TextUnitInput } from './prepare'

export const CACHE_LIMIT_BYTES = 2 * 1024 ** 3

export function corpusKey(units: TextUnitInput[], options: PrepareOptions): string {
  const h = createHash('sha256')
  h.update(`v${PREPARATION_VERSION}\u0000${options.language}\u0000${options.uceSize}\u0000${units.length}\u0000`)
  // Content-word segments are a different corpus; the default keeps the earlier keys.
  if (options.segmentCount === 'content') h.update('segments:content\u0000')
  for (const u of units) {
    // Lengths before each field keep "ab"+"c" and "a"+"bc" apart.
    for (const field of [u.id, u.name, u.text]) {
      h.update(`${field.length}:`)
      h.update(field)
    }
  }
  return h.digest('hex')
}

const fileFor = (dir: string, key: string): string => join(dir, `${key}.corpus`)

export function hasCachedCorpus(dir: string, key: string): boolean {
  return existsSync(fileFor(dir, key))
}

export function readCachedCorpus(dir: string, key: string): PreparedCorpus | null {
  const file = fileFor(dir, key)
  if (!existsSync(file)) return null
  try {
    const corpus = deserialize(readFileSync(file)) as PreparedCorpus
    if (corpus?.version !== PREPARATION_VERSION) return null
    const now = new Date()
    utimesSync(file, now, now)
    return corpus
  } catch {
    // A damaged file is ignored and replaced on the next write.
    return null
  }
}

export function writeCachedCorpus(dir: string, key: string, corpus: PreparedCorpus, limitBytes = CACHE_LIMIT_BYTES): void {
  mkdirSync(dir, { recursive: true })
  const file = fileFor(dir, key)
  // Written under another name first, so an interrupted write never leaves a half file under the real name.
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, serialize(corpus))
  renameSync(tmp, file)
  pruneCache(dir, limitBytes, file)
}

export function pruneCache(dir: string, limitBytes: number, keep?: string): void {
  let entries: { path: string; size: number; used: number }[]
  try {
    entries = readdirSync(dir)
      .filter((f) => f.endsWith('.corpus'))
      .map((f) => {
        const p = join(dir, f)
        const st = statSync(p)
        return { path: p, size: st.size, used: st.mtimeMs }
      })
  } catch {
    return
  }
  let total = entries.reduce((n, e) => n + e.size, 0)
  for (const e of entries.sort((a, b) => a.used - b.used)) {
    if (total <= limitBytes) break
    if (e.path === keep) continue
    try { unlinkSync(e.path); total -= e.size } catch { /* in use or gone */ }
  }
}
