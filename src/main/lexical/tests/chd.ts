/**
 * CHD, Reinert method (labiia_lex's "CHD completo"), classification stage:
 * the app builds the segment x active word table, IRaMuTeQ's own R scripts
 * divide it into classes and draw the dendrogram.
 */
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { runRScript } from '../r-runner'
import type { TestContext } from '../engine'
import type { LexicalFile, LexicalRunResult } from '../../../renderer/models/lexical-api'
import { CHD_MIN_FREQ, type ChdMatrixInfo } from '../analyses/chd'
import { chdDendrogram, CHD_CLASS_PALETTE } from '../plot/chd-dendrogram'
import { Lexicon } from '../corpus/lexicon'
import { adjustedRandIndex, robustnessSpecs, specLabel } from '../analyses/chd-robustness'

const b64 = (text: string): string => Buffer.from(text, 'utf-8').toString('base64')
const quote = (v: string): string => `"${v.replace(/"/g, '""')}"`

/** Last column of R's write.csv2 output: the class of each row (0 = unclassified). */
export function readClasses(n1Csv: string): number[] {
  return n1Csv.split(/\r?\n/).slice(1).filter((l) => l.trim()).map((l) => Number(l.split(';').pop()))
}

export interface ProfileRow {
  cls: number
  word: string
  inClass: number
  total: number
  percent: number
  chi2: number
  p: number
}

/** Reads IRaMuTeQ's Profiles.csv / Antiprofile.csv: one section per class, rows by chi2. */
export function readProfiles(csv: string): ProfileRow[] {
  const out: ProfileRow[] = []
  let cls = 0
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue
    const cells = splitCsv(line).map((c) => c.trim())
    if (cells[0] === '**' && cells[1] === 'classe') { cls = Number(cells[2]); continue }
    if (cells[0].startsWith('*')) continue
    const [inClass, total, percent, chi2, word, p] = cells
    if (!word || !cls) continue
    out.push({ cls, word, inClass: Number(inClass), total: Number(total), percent: Number(percent), chi2: Number(chi2), p: Number(p) })
  }
  return out
}

/** Reads chistable.csv (R write.csv2: comma decimals): word -> chi2 per class. */
export function readChiTable(csv: string): Map<string, number[]> {
  const m = new Map<string, number[]>()
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue
    const cells = splitCsv(line)
    m.set(cells[0], cells.slice(1).map((v) => Number(v.replace(',', '.'))))
  }
  return m
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
  const rowsMode = mode === '2' ? ('texts' as const) : mode === '0' ? ('double' as const) : ('segments' as const)
  const sizes12 = { tailleuc1: Math.max(4, Number(p.tailleuc1) || 12), tailleuc2: Math.max(4, Number(p.tailleuc2) || 14) }
  const nClasses = Math.max(2, Math.min(20, Math.round(Number(p.n_classes) || 5)))
  // Phase 1 explores more classes than asked (IRaMuTeQ's 10); the terminal classes come from pruning.
  const baseFreq = Math.max(CHD_MIN_FREQ, Number(p.min_freq) || 3)
  const classify = async (dir: string, classesAsked: number, minFreq: number) => {
    const info = await ctx.worker<ChdMatrixInfo | null>({
      type: 'chd-matrix',
      key: ctx.key,
      resourcesDir: ctx.resourcesDir,
      dir,
      options: { minFreq, maxActives: Number(p.max_actives) || 20000, useLemmas: p.use_lemmas !== false, rows: rowsMode, ...sizes12 }
    })
    if (!info || info.rows < 3) return { error: 'chd-too-small' as const }
    const run = await runRScript(ctx.r!, ctx.runId, {
      script: join(ctx.resourcesDir, 'R', 'chd.R'),
      args: [dir, join(ctx.resourcesDir, 'R', 'iramuteq'), String(Math.max(10, 2 * classesAsked) - 1), String(Math.max(0, Math.round(Number(p.min_uce) || 0))), '1400', '1000', mode === '0' ? '0' : '1'],
      cwd: dir,
      timeoutMs: 900_000,
      expectedOutputs: [join(dir, 'n1.csv'), join(dir, 'dendrogramme.png')]
    })
    if (!run.ok) return { error: run.timedOut ? 'r-timeout' as const : run.cancelled ? 'cancelled' as const : 'r-failed' as const, detail: (run.stderr || run.stdout).slice(-4000) }
    return { info, classes: readClasses(readFileSync(join(dir, 'n1.csv'), 'utf-8')) }
  }

  ctx.progress({ stage: 'render' })
  const out = (name: string): string => join(ctx.runDir, name)
  const main = await classify(ctx.runDir, nClasses, baseFreq)
  if ('error' in main) return main
  const { info, classes } = main
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

  // Profiles stage: the app counts words per class, IRaMuTeQ's R computes chi2 and the AFC.
  const options = {
    minFreq: Number(p.min_freq) || 3,
    maxActives: Number(p.max_actives) || 20000,
    useLemmas: p.use_lemmas !== false,
    rows: rowsMode,
    ...sizes12
  }
  await ctx.worker({ type: 'chd-profile-tables', key: ctx.key, resourcesDir: ctx.resourcesDir, dir: ctx.runDir, options, classes })
  const prof = await runRScript(ctx.r!, ctx.runId, {
    script: join(ctx.resourcesDir, 'R', 'chd_profiles.R'),
    args: [ctx.runDir, join(ctx.resourcesDir, 'R', 'iramuteq'), String(nClass), '0.9'],
    cwd: ctx.runDir,
    timeoutMs: 900_000,
    expectedOutputs: [out('Profiles.csv'), out('chistable.csv')]
  })
  if (!prof.ok) return { error: prof.timedOut ? 'r-timeout' : prof.cancelled ? 'cancelled' : 'r-failed', detail: (prof.stderr || prof.stdout).slice(-4000) }

  const activeWords = new Set(readFileSync(out('Contout.csv'), 'utf-8').split(/\r?\n/).filter(Boolean).map((l) => l.split(';')[0]))
  const supWords = new Set(readFileSync(out('ContSupOut.csv'), 'utf-8').split(/\r?\n/).filter(Boolean).map((l) => l.split(';')[0]))
  const kind = (w: string): string => (activeWords.has(w) ? 'active' : supWords.has(w) ? 'supplementary' : 'variable')
  const profiles = readProfiles(readFileSync(out('Profiles.csv'), 'utf-8'))
  const antiprofiles = existsSync(out('Antiprofile.csv')) ? readProfiles(readFileSync(out('Antiprofile.csv'), 'utf-8')) : []
  const profileCsv = (list: ProfileRow[]): string => 'class;word;type;segments_in_class;segments_total;percent;chi2;p\n' +
    list.map((r) => `${r.cls};${quote(r.word)};${kind(r.word)};${r.inClass};${r.total};${r.percent};${r.chi2};${r.p}`).join('\n') + '\n'

  // Dendrogram words: the class's active words by chi2, without stopword-like words (labiia_lex's visual filter).
  const lex = new Lexicon(ctx.language, ctx.resourcesDir)
  const wordsOf = (cls: number): string[] => profiles
    .filter((r) => r.cls === cls && r.chi2 > 0 && activeWords.has(r.word) && !lex.isStopwordLike(r.word))
    .map((r) => r.word)
  const names = String(p.lab ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const dendro = chdDendrogram(readFileSync(out('tree.nwk'), 'utf-8'), sizes, wordsOf, 18, {
    // As labiia_lex: the names apply only when there is one per class.
    names: names.length === nClass ? names : undefined,
    bw: p.bw === true
  })

  // Robustness: the same classification with other settings, compared by the adjusted Rand index.
  const robustnessFiles: LexicalFile[] = []
  if (p.robustness_check === true) {
    const specs = robustnessSpecs(nClasses, baseFreq)
    const runs: { label: string; classes: number[] | null; error?: string }[] = [{ label: specLabel(specs[0]), classes }]
    for (const spec of specs.slice(1)) {
      if (ctx.isCancelled()) return { error: 'cancelled' }
      const dir = join(ctx.runDir, `robustez_k${spec.classes}_mf${spec.minFreq}`)
      mkdirSync(dir, { recursive: true })
      const r = await classify(dir, spec.classes, spec.minFreq)
      runs.push('error' in r ? { label: specLabel(spec), classes: null, error: r.error } : { label: specLabel(spec), classes: r.classes })
    }
    const rowsOut = runs.map((r, i) => {
      if (!r.classes) return [r.label, '', '', '', r.error ?? '']
      const got = Math.max(0, ...r.classes)
      const pct = (100 * r.classes.filter((c) => c > 0).length) / Math.max(1, r.classes.length)
      const ari = i === 0 ? 1 : adjustedRandIndex(classes, r.classes)
      return [r.label, String(got), pct.toFixed(1), ari.toFixed(3), '']
    })
    robustnessFiles.push({
      name: 'chd_robustness.csv', mime: 'text/csv', role: 'table', title: 'ChdRobustness',
      data: b64('setting;classes_obtained;percent_classified;ari_vs_main;error\n' + rowsOut.map((r) => r.map(quote).join(';')).join('\n') + '\n')
    })
    const ok = runs.filter((r) => r.classes)
    const matrix = 'setting;' + ok.map((r) => quote(r.label)).join(';') + '\n' +
      ok.map((a) => [quote(a.label), ...ok.map((b) => adjustedRandIndex(a.classes!, b.classes!).toFixed(4))].join(';')).join('\n') + '\n'
    robustnessFiles.push({ name: 'chd_robustness_ari.csv', mime: 'text/csv', role: 'data', data: b64(matrix) })
  }

  // Typical segments: the sum of the positive chi2 of the class's words the segment contains (by lemma).
  const chi = readChiTable(readFileSync(out('chistable.csv'), 'utf-8'))
  const rowTerms = readFileSync(out('rowterms.csv'), 'utf-8').split(/\r?\n/).filter(Boolean).map((l) => {
    const i = l.indexOf(';')
    return l.slice(i + 1).split(' ').filter(Boolean)
  })
  const texts = rows.map((l) => splitCsv(l))
  const typical: string[] = []
  for (let cls = 1; cls <= nClass; cls++) {
    const scored: { row: number; score: number }[] = []
    classes.forEach((c, r) => {
      if (c !== cls) return
      let score = 0
      for (const t of rowTerms[r] ?? []) { const v = chi.get(t)?.[cls - 1] ?? 0; if (v > 0) score += v }
      if (score > 0) scored.push({ row: r, score })
    })
    scored.sort((a, b) => b.score - a.score || a.row - b.row)
    for (const s of scored.slice(0, 10)) typical.push(`${cls};${s.score.toFixed(3)};${quote(texts[s.row]?.[1] ?? '')};${quote(texts[s.row]?.[2] ?? '')}`)
  }
  const typicalCsv = 'class;score;document;text\n' + typical.join('\n') + '\n'

  // Coloured corpus: every classified segment in its class colour.
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const colored = '<!doctype html><meta charset="utf-8"><title>Corpus colorido</title><body style="font-family:sans-serif;max-width:900px;margin:24px auto;line-height:1.5">' +
    texts.map((t, r) => {
      const c = classes[r] ?? 0
      const color = c > 0 ? CHD_CLASS_PALETTE[(c - 1) % CHD_CLASS_PALETTE.length] : '#888888'
      return `<p style="color:${color}"><b>${c > 0 ? `classe ${c}` : 'sem classe'}</b> · ${esc(t[1] ?? '')}<br>${esc(t[2] ?? '')}</p>`
    }).join('') + '</body>'

  const raw = (name: string): string => readFileSync(out(name)).toString('base64')
  const afcImages: LexicalFile[] = ['AFC2DL.png', 'AFC2DSL.png', 'AFC2DEL.png', 'AFC2DCL.png']
    .filter((f) => existsSync(out(f)))
    .map((f) => ({ name: f, mime: 'image/png', role: 'image' as const, data: raw(f) }))
  const files: LexicalFile[] = [
    { name: 'chd_dendrogram.json', mime: 'application/json', role: 'figure', data: b64(JSON.stringify(dendro)) },
    { name: 'dendrogramme.png', mime: 'image/png', role: 'image', data: raw('dendrogramme.png') },
    ...afcImages,
    { name: 'chd_classes.csv', mime: 'text/csv', role: 'table', title: 'ChdClasses', data: b64(classesCsv) },
    { name: 'chd_profiles.csv', mime: 'text/csv', role: 'table', title: 'ChdProfiles', data: b64(profileCsv(profiles)) },
    { name: 'chd_antiprofiles.csv', mime: 'text/csv', role: 'table', title: 'ChdAntiprofiles', data: b64(profileCsv(antiprofiles)) },
    // Variables (documents, tags, folders) over-represented in each class.
    ...(profiles.some((r) => kind(r.word) === 'variable')
      ? [{ name: 'chd_variables.csv', mime: 'text/csv', role: 'table' as const, title: 'ChdVariables', data: b64(profileCsv(profiles.filter((r) => kind(r.word) === 'variable'))) }]
      : []),
    { name: 'chd_typical_segments.csv', mime: 'text/csv', role: 'table', title: 'ChdTypical', data: b64(typicalCsv) },
    ...robustnessFiles,
    { name: 'colored_corpus.html', mime: 'text/html', role: 'data', data: b64(colored) },
    { name: 'chistable.csv', mime: 'text/csv', role: 'data', data: raw('chistable.csv') },
    ...['afc_facteur.csv', 'afc_row.csv', 'afc_col.csv', 'Contout.csv', 'ContSupOut.csv', 'ContEtOut.csv']
      .filter((f) => existsSync(out(f)))
      .map((f) => ({ name: f, mime: 'text/csv', role: 'data' as const, data: raw(f) })),
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
