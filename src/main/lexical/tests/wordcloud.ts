/**
 * Word cloud: word frequencies from the prepared corpus, drawn in R with
 * ggwordcloud exactly as labiia_lex draws its "Nuvem de palavras" (same
 * script, sizes, colours, rotation and seed), so the same corpus gives the
 * same picture.
 */
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { runRScript } from '../r-runner'
import type { TestContext } from '../engine'
import type { LexicalFile, LexicalRunResult } from '../../../renderer/models/lexical-api'

const SHAPES = new Set(['cardioid', 'diamond', 'square', 'triangle-forward', 'triangle-upright', 'pentagon', 'star'])
const PALETTES = new Set(['Dark2', 'Set1', 'Set2', 'Paired', 'Pastel1'])
const ECCENTRICITIES = [0.35, 0.65, 1.0]

/** labiia_lex's adaptive canvas: grows with the number of words, from 980 to 1900 px. */
export function cloudEdge(maxWords: number, shape: string, eccentricity: number): number {
  const words = Math.max(20, Math.min(2000, Math.round(maxWords)))
  const base = Math.min(words, 600)
  let edge = 980 + Math.trunc((base - 20) * 1.1)
  if (words > 600) edge += Math.trunc((words - 600) * 0.25)
  if (shape.startsWith('triangle')) edge += 70
  else if (shape === 'star' || shape === 'diamond' || shape === 'pentagon') edge += 50
  if (eccentricity <= 0.5) edge += 30
  return Math.max(980, Math.min(1900, edge))
}

export async function runWordcloud(ctx: TestContext): Promise<Omit<LexicalRunResult, 'ok' | 'corpus'>> {
  const p = ctx.params
  const maxWords = Math.max(10, Math.min(2000, Math.round(Number(p.max_words) || 100)))
  const minFreq = Math.max(1, Math.round(Number(p.min_freq) || 3))
  const shape = SHAPES.has(String(p.shape)) ? String(p.shape) : 'square'
  const colors = PALETTES.has(String(p.colors)) ? String(p.colors) : 'Dark2'
  const ecc = Number(p.eccentricity)
  const eccentricity = ECCENTRICITIES.reduce((best, c) => (Math.abs(c - ecc) < Math.abs(best - ecc) ? c : best), 0.65)

  const freqs = await ctx.worker<[string, number][]>({
    type: 'word-frequencies',
    key: ctx.key,
    resourcesDir: ctx.resourcesDir,
    useLemmas: p.use_lemmas !== false,
    activeOnly: p.active_only !== false
  })
  const shown = freqs.filter(([, f]) => f >= minFreq).slice(0, maxWords)
  if (shown.length === 0) return { error: 'no-words' }

  const csv = 'word;freq\n' + shown.map(([w, f]) => `${w};${f}`).join('\n') + '\n'
  writeFileSync(join(ctx.runDir, 'words.csv'), csv, 'utf-8')
  const edge = cloudEdge(maxWords, shape, eccentricity)
  writeFileSync(join(ctx.runDir, 'params.json'), JSON.stringify({
    max_words: maxWords, min_freq: minFreq, scale_max: 30, rotation_percentage: 0.1, shape, eccentricity,
    colors, width: edge, height: edge, grid_size: 4, max_steps: 100
  }), 'utf-8')

  ctx.progress({ stage: 'render' })
  const image = join(ctx.runDir, 'wordcloud.png')
  const run = await runRScript(ctx.r!, ctx.runId, {
    script: join(ctx.resourcesDir, 'R', 'wordcloud.R'),
    args: [join(ctx.runDir, 'params.json')],
    cwd: ctx.runDir,
    timeoutMs: 600_000,
    expectedOutputs: [image]
  })
  if (!run.ok) {
    return { error: run.timedOut ? 'r-timeout' : run.cancelled ? 'cancelled' : 'r-failed', detail: (run.stderr || run.stdout).slice(-4000) }
  }

  let meta: Record<string, unknown> = {}
  const metaFile = join(ctx.runDir, 'wordcloud_render_meta.json')
  if (existsSync(metaFile)) {
    try { meta = JSON.parse(readFileSync(metaFile, 'utf-8')) } catch { /* optional */ }
  }
  const files: LexicalFile[] = [
    { name: 'wordcloud.png', mime: 'image/png', role: 'image', data: readFileSync(image).toString('base64') },
    { name: 'words.csv', mime: 'text/csv', role: 'table', data: Buffer.from(csv, 'utf-8').toString('base64') }
  ]
  return {
    files,
    summary: {
      words: Number(meta.words_drawn ?? shown.length),
      maxFrequency: shown[0][1],
      minFrequency: shown[shown.length - 1][1]
    }
  }
}
