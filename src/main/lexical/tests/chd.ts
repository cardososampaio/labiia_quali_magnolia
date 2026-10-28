/**
 * CHD, Reinert method (labiia_lex's "CHD completo"), classification stage:
 * the app builds the segment x active word table, IRaMuTeQ's own R scripts
 * divide it into classes and draw the dendrogram.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { runRScript } from '../r-runner'
import type { TestContext } from '../engine'
import type { LexicalFile, LexicalRunResult } from '../../../renderer/models/lexical-api'
import type { ChdMatrixInfo } from '../analyses/chd'

const b64 = (text: string): string => Buffer.from(text, 'utf-8').toString('base64')
const quote = (v: string): string => `"${v.replace(/"/g, '""')}"`

/** Last column of R's write.csv2 output: the class of each row (0 = unclassified). */
export function readClasses(n1Csv: string): number[] {
  return n1Csv.split(/\r?\n/).slice(1).filter((l) => l.trim()).map((l) => Number(l.split(';').pop()))
}

/** Splits one line of a ;-separated file with "quoted" cells. */
function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ';') { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out
}

export async function runChd(ctx: TestContext): Promise<Omit<LexicalRunResult, 'ok' | 'corpus'>> {
  const p = ctx.params
  const mode = String(p.classif_mode ?? '1')
  if (mode === '0') return { error: 'chd-double-soon' }
  const nClasses = Math.max(2, Math.min(20, Math.round(Number(p.n_classes) || 5)))
  // Phase 1 explores more classes than asked (IRaMuTeQ's 10); the terminal classes come from pruning.
  const nbt = Math.max(10, 2 * nClasses) - 1
  const info = await ctx.worker<ChdMatrixInfo | null>({
    type: 'chd-matrix',
    key: ctx.key,
    resourcesDir: ctx.resourcesDir,
    dir: ctx.runDir,
    options: {
      minFreq: Number(p.min_freq) || 3,
      maxActives: Number(p.max_actives) || 20000,
      useLemmas: p.use_lemmas !== false,
      rows: mode === '2' ? 'texts' : 'segments'
    }
  })
  if (!info || info.rows < 3) return { error: 'chd-too-small' }

  ctx.progress({ stage: 'render' })
  const out = (name: string): string => join(ctx.runDir, name)
  const run = await runRScript(ctx.r!, ctx.runId, {
    script: join(ctx.resourcesDir, 'R', 'chd.R'),
    args: [ctx.runDir, join(ctx.resourcesDir, 'R', 'iramuteq'), String(nbt), String(Math.max(0, Math.round(Number(p.min_uce) || 0))), '1400', '1000'],
    cwd: ctx.runDir,
    timeoutMs: 900_000,
    expectedOutputs: [out('n1.csv'), out('dendrogramme.png')]
  })
  if (!run.ok) return { error: run.timedOut ? 'r-timeout' : run.cancelled ? 'cancelled' : 'r-failed', detail: (run.stderr || run.stdout).slice(-4000) }

  const classes = readClasses(readFileSync(out('n1.csv'), 'utf-8'))
  const nClass = Math.max(0, ...classes)
  if (nClass < 2) return { error: 'chd-no-classes' }
  const sizes = Array.from({ length: nClass }, (_v, k) => classes.filter((c) => c === k + 1).length)
  const classified = sizes.reduce((a, b) => a + b, 0)
  const classesCsv = 'class;segments;percent\n' +
    sizes.map((n, k) => `${k + 1};${n};${((100 * n) / Math.max(1, classified)).toFixed(1)}`).join('\n') + '\n'

  const rows = readFileSync(out('rows.csv'), 'utf-8').split(/\r?\n/).slice(1).filter((l) => l)
  const segmentsCsv = 'row;document;class;text\n' + rows.map((l) => {
    const [row, doc, text] = splitCsv(l)
    return `${row};${quote(doc)};${classes[Number(row)] ?? 0};${quote(text)}`
  }).join('\n') + '\n'

  const raw = (name: string): string => readFileSync(out(name)).toString('base64')
  const files: LexicalFile[] = [
    { name: 'dendrogramme.png', mime: 'image/png', role: 'image', data: raw('dendrogramme.png') },
    { name: 'chd_classes.csv', mime: 'text/csv', role: 'table', title: 'ChdClasses', data: b64(classesCsv) },
    { name: 'chd_segments.csv', mime: 'text/csv', role: 'data', data: b64(segmentsCsv) },
    { name: 'n1.csv', mime: 'text/csv', role: 'data', data: raw('n1.csv') },
    { name: 'tree.nwk', mime: 'text/plain', role: 'data', data: raw('tree.nwk') },
    { name: 'formes.csv', mime: 'text/csv', role: 'data', data: raw('formes.csv') }
  ]
  return {
    files,
    summary: {
      classes: nClass,
      segments: info.rows,
      classified,
      classifiedPercent: Number(((100 * classified) / Math.max(1, info.rows)).toFixed(1)),
      activeWords: info.terms
    }
  }
}
