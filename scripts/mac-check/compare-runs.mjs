#!/usr/bin/env node
/**
 * Compares two runs of the lexical analyses on the same corpus (written by
 * test/helper/parity.local.test.ts with PARITY_OUT), e.g. a Mac and a
 * Windows build:
 *
 *   node scripts/mac-check/compare-runs.mjs <run A> <run B> [report.md]
 *
 * The rule: the same corpus gives the same results on every system. Each
 * test must finish on both; its tables and data files must match, numbers
 * allowed to differ only in the last digits (different maths libraries
 * round differently). Figures (PNG, SVG) are drawn by each system's fonts,
 * so only their presence is compared; so are drawing positions (a network's
 * layout comes from a random start each system computes slightly
 * differently). A CHD's classes must be the same, while the left-to-right
 * order its dendrogram draws them in may differ. Exits with 1 when a rule
 * is broken.
 */
import fs from 'node:fs'
import path from 'node:path'

const [a, b, reportFile] = process.argv.slice(2)
if (!a || !b) {
  console.error('usage: compare-runs.mjs <run A> <run B> [report.md]')
  process.exit(2)
}

const FIGURES = new Set(['.png', '.svg', '.jpg', '.jpeg', '.pdf'])
/** Drawing positions: compared like figures. */
const LAYOUTS = /^layout.*\.json$/i
// Decimal point or decimal comma (R writes "0,935" in the Portuguese tables).
const NUMBER = /-?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?/gi
const num = (t) => Number(t.replace(',', '.'))

/** A Newick tree with every node's children in a fixed order. */
function canonicalTree(text) {
  let i = 0
  const s = text.trim().replace(/;$/, '')
  const node = () => {
    if (s[i] === '(') {
      i++
      const kids = [node()]
      while (s[i] === ',') { i++; kids.push(node()) }
      i++ // ')'
      let label = ''
      while (i < s.length && !',)'.includes(s[i])) label += s[i++]
      return '(' + kids.sort().join(',') + ')' + label
    }
    let label = ''
    while (i < s.length && !',)'.includes(s[i])) label += s[i++]
    return label
  }
  return node()
}

/** A CHD dendrogram's classes, without the order they are drawn in. */
function chdClasses(text) {
  const j = JSON.parse(text)
  return JSON.stringify((j.classes ?? []).map(({ x, color, ...c }) => c).sort((p, q) => p.id - q.id))
}

/** Equal text, or equal once numbers are compared with a small tolerance. */
function sameText(x, y) {
  if (x === y) return { same: true }
  const norm = (s) => s.replace(/\r\n/g, '\n')
  x = norm(x)
  y = norm(y)
  if (x === y) return { same: true }
  if (x.replace(NUMBER, '#') !== y.replace(NUMBER, '#')) return { same: false, why: 'text differs' }
  const nx = x.match(NUMBER) ?? []
  const ny = y.match(NUMBER) ?? []
  let worst = 0
  for (let i = 0; i < nx.length; i++) {
    const p = num(nx[i])
    const q = num(ny[i])
    const diff = Math.abs(p - q) / Math.max(1, Math.abs(p), Math.abs(q))
    worst = Math.max(worst, diff)
  }
  return worst <= 1e-6 ? { same: true, note: `numbers within ${worst.toExponential(1)}` } : { same: false, why: `numbers differ (up to ${worst.toExponential(2)})` }
}

const tests = [...new Set([...fs.readdirSync(a), ...fs.readdirSync(b)])]
  .filter((t) => fs.statSync(path.join(fs.existsSync(path.join(a, t)) ? a : b, t)).isDirectory())
  .sort()

const lines = [`# Lexical analyses: ${path.basename(a)} × ${path.basename(b)}`, '']
let broken = 0
for (const test of tests) {
  const da = path.join(a, test)
  const db = path.join(b, test)
  const summary = (d) => {
    try { return JSON.parse(fs.readFileSync(path.join(d, '_summary.json'), 'utf8')) } catch { return { error: 'no result' } }
  }
  const sa = summary(da)
  const sb = summary(db)
  const problems = []
  const notes = []
  if (sa.error || sb.error) problems.push(`did not finish: A=${sa.error ?? 'ok'} ${sa.detail ?? ''} | B=${sb.error ?? 'ok'} ${sb.detail ?? ''}`.trim())
  const files = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f !== '_summary.json') : [])
  const fa = files(da)
  const fb = files(db)
  for (const f of [...new Set([...fa, ...fb])].sort()) {
    if (!fa.includes(f) || !fb.includes(f)) { problems.push(`${f} only in ${fa.includes(f) ? 'A' : 'B'}`); continue }
    const ext = path.extname(f).toLowerCase()
    if (FIGURES.has(ext) || LAYOUTS.test(f)) {
      const za = fs.statSync(path.join(da, f)).size
      const zb = fs.statSync(path.join(db, f)).size
      if (!za || !zb) problems.push(`${f} is empty`)
      else notes.push(`${f}: figure (${za} / ${zb} bytes)`)
      continue
    }
    let ta = fs.readFileSync(path.join(da, f), 'utf8')
    let tb = fs.readFileSync(path.join(db, f), 'utf8')
    if (ext === '.nwk') { ta = canonicalTree(ta); tb = canonicalTree(tb) }
    if (f === 'chd_dendrogram.json') { ta = chdClasses(ta); tb = chdClasses(tb) }
    const r = sameText(ta, tb)
    if (!r.same) problems.push(`${f}: ${r.why}`)
    else if (r.note) notes.push(`${f}: ${r.note}`)
  }
  const s = JSON.stringify(sa.summary ?? null)
  const t = JSON.stringify(sb.summary ?? null)
  if (s !== t && !sameText(s, t).same) problems.push(`summary differs: A=${s} B=${t}`)
  if (problems.length) broken++
  lines.push(`## ${problems.length ? '✗' : '✓'} ${test}`)
  for (const p of problems) lines.push(`- ✗ ${p}`)
  for (const n of notes) lines.push(`- ${n}`)
  lines.push('')
}
lines.push(broken ? `**${broken} of ${tests.length} tests differ.**` : `**All ${tests.length} tests match.**`)
const text = lines.join('\n') + '\n'
console.log(text)
if (reportFile) fs.writeFileSync(reportFile, text)
process.exitCode = broken ? 1 : 0
