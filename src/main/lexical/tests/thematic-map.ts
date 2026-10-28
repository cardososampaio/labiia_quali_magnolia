/**
 * Thematic map (labiia_lex's "Mapa temático"): the network, the themes and
 * the strategic diagram are computed in the background thread; the window
 * draws the two figures.
 */
import type { TestContext } from '../engine'
import type { LexicalFile, LexicalRunResult } from '../../../renderer/models/lexical-api'
import type { ThematicOutcome } from '../analyses/thematic-map'

const b64 = (text: string): string => Buffer.from(text, 'utf-8').toString('base64')

export async function runThematicMap(ctx: TestContext): Promise<Omit<LexicalRunResult, 'ok' | 'corpus'>> {
  const p = ctx.params
  const num = (v: unknown, d: number): number => (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Number(v) : d)
  const res = await ctx.worker<ThematicOutcome>({
    type: 'thematic-map',
    key: ctx.key,
    resourcesDir: ctx.resourcesDir,
    options: {
      minFreq: num(p.min_freq, 2),
      maxFeatures: num(p.max_features, 300),
      topEdges: Math.max(10, num(p.top_edges, 160)),
      maxNodes: Math.max(10, num(p.max_nodes, 120)),
      minCooc: Math.max(1, num(p.min_cooc, 2)),
      useLemmas: p.use_lemmas !== false,
      resolution: Math.max(0.1, Math.min(3, num(p.resolution, 0.5))),
      labelWords: num(p.label_words, 2),
      labelAlpha: 0.5,
      minThemeFreq: Math.max(0, num(p.min_theme_freq, 5))
    }
  })
  if ('error' in res) return { error: res.error, detail: res.minTermFrequency !== undefined ? String(res.minTermFrequency) : undefined }
  const cols = Object.keys(res.themes[0]) as (keyof (typeof res.themes)[0])[]
  const cell = (v: unknown): string => { const s = String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const themesCsv = [cols.join(';'), ...res.themes.map((r) => cols.map((c) => cell(r[c])).join(';'))].join('\n') + '\n'
  const files: LexicalFile[] = [
    { name: 'strategic_map.json', mime: 'application/json', role: 'figure', data: b64(JSON.stringify(res.strategic)) },
    { name: 'expression_network.json', mime: 'application/json', role: 'figure', data: b64(JSON.stringify(res.network)) },
    { name: 'thematic_communities.csv', mime: 'text/csv', role: 'table', title: 'Themes', data: b64(themesCsv) },
    { name: 'thematic_documents.csv', mime: 'text/csv', role: 'table', title: 'ThemeDocuments', data: b64(res.documentsCsv) },
    { name: 'thematic_representative_sentences.csv', mime: 'text/csv', role: 'table', title: 'ThemeSegments', data: b64(res.sentencesCsv) },
    { name: 'expression_nodes.csv', mime: 'text/csv', role: 'data', data: b64(res.nodesCsv) },
    { name: 'expression_edges.csv', mime: 'text/csv', role: 'data', data: b64(res.edgesCsv) },
    { name: 'strategic_map.csv', mime: 'text/csv', role: 'data', data: b64(themesCsv) },
    { name: 'thematic_map_summary.json', mime: 'application/json', role: 'data', data: b64(JSON.stringify({ ...res.summary, communities: res.themes }, null, 2)) }
  ]
  return { files, summary: { themes: res.themes.length, nodes: Number(res.summary.n_nodes), links: Number(res.summary.n_edges) } }
}
