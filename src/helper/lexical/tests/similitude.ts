/**
 * Similarity analysis (labiia_lex's "Similitude" in its default IRaMuTeQ
 * mode): the association matrix is built in the background thread, and
 * labiia_lex's R renderer (igraph + sna) computes the maximum tree, the
 * layout, the communities and draws the graph.
 */
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { runRScript } from '../r-runner'
import type { TestContext } from '../engine'
import type { LexicalFile, LexicalRunResult } from '../../../renderer/models/lexical-api'
import type { SimilitudeRun } from '../lexical-worker'

const LAYOUTS = new Set(['frutch', 'kawa', 'fr'])

export async function runSimilitude(ctx: TestContext): Promise<Omit<LexicalRunResult, 'ok' | 'corpus'>> {
  const p = ctx.params
  const coefficient = String(p.coefficient || 'cooccurrence')
  const res = await ctx.worker<SimilitudeRun>({
    type: 'similitude-matrix',
    key: ctx.key,
    resourcesDir: ctx.resourcesDir,
    options: { minFreq: Number(p.min_freq) || 3, maxTerms: Number(p.max_words) || 200, useLemmas: p.use_lemmas !== false, coefficient }
  })
  if (!res) return { error: 'no-vocabulary' }
  writeFileSync(join(ctx.runDir, 'matrix.csv'), res.matrixCsv, 'utf-8')
  writeFileSync(join(ctx.runDir, 'freq.csv'), res.freqCsv, 'utf-8')
  // The same parameters labiia_lex sends in its IRaMuTeQ mode (simitxt.cfg defaults).
  writeFileSync(join(ctx.runDir, 'params.json'), JSON.stringify({
    matrix_file: 'matrix.csv',
    freq_file: 'freq.csv',
    output_file: 'similitude.png',
    width: 1100,
    height: 1100,
    method: coefficient === 'cooccurrence' ? 'cooc' : coefficient,
    max_tree: p.arbremax !== false,
    layout_type: LAYOUTS.has(String(p.layout)) ? String(p.layout) : 'frutch',
    vcexmin: 1.0,
    vcexmax: 2.5,
    coeff_edge_min: 0.6,
    coeff_edge_max: 4.0,
    community_method: 'edge_betweenness',
    halo: p.show_halo === true,
    edge_curved: true,
    // Off, the words stay black (as IRaMuTeQ); the halos, when shown, are coloured either way.
    grayscale: p.detect_communities !== true,
    show_edge_labels: false,
    dpi: 96,
    alpha: 20,
    graph_word: '',
    community_sensitivity_file: 'community_sensitivity.json',
    layout_output_file: 'layout_raw.json'
  }), 'utf-8')

  ctx.progress({ stage: 'render' })
  const image = join(ctx.runDir, 'similitude.png')
  const run = await runRScript(ctx.r!, ctx.runId, {
    script: join(ctx.resourcesDir, 'R', 'similitude_render.R'),
    args: [join(ctx.runDir, 'params.json')],
    cwd: ctx.runDir,
    timeoutMs: 600_000,
    expectedOutputs: [image]
  })
  if (!run.ok) return { error: run.timedOut ? 'r-timeout' : run.cancelled ? 'cancelled' : 'r-failed', detail: (run.stderr || run.stdout).slice(-4000) }

  const files: LexicalFile[] = [
    { name: 'similitude.png', mime: 'image/png', role: 'image', data: readFileSync(image).toString('base64') },
    { name: 'similitude_vocabulary.csv', mime: 'text/csv', role: 'table', title: 'Vocabulary', data: Buffer.from(res.freqCsv.replace(/,/g, ';'), 'utf-8').toString('base64') },
    { name: 'similitude_association.csv', mime: 'text/csv', role: 'data', data: Buffer.from(res.matrixCsv, 'utf-8').toString('base64') }
  ]
  const layout = join(ctx.runDir, 'layout_raw.json')
  if (existsSync(layout)) files.push({ name: 'layout_raw.json', mime: 'application/json', role: 'data', data: readFileSync(layout).toString('base64') })
  return { files, summary: { terms: res.terms } }
}
