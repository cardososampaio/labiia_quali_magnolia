/** Keyword associations (labiia_lex's "Associações de palavras-chave"), drawn by the window. */
import type { TestContext } from '../engine'
import type { LexicalRunResult } from '../../../renderer/models/lexical-api'
import type { AssociationsRun } from '../lexical-worker'

const b64 = (text: string): string => Buffer.from(text, 'utf-8').toString('base64')
const csv = (rows: (string | number)[][]): string => rows.map((r) => r.join(';')).join('\n') + '\n'

export async function runKeywordAssociations(ctx: TestContext): Promise<Omit<LexicalRunResult, 'ok' | 'corpus'>> {
  const p = ctx.params
  const res = await ctx.worker<AssociationsRun>({
    type: 'keyword-associations',
    key: ctx.key,
    resourcesDir: ctx.resourcesDir,
    options: {
      focalTerms: String(p.focal_terms ?? ''),
      topN: Number(p.top_n) || 12,
      minJoint: Number(p.min_joint) || 3,
      minFreq: Number(p.min_freq) || 2,
      useLemmas: p.use_lemmas !== false
    }
  })
  if ('error' in res) return { error: res.error === 'too-small' ? 'too-small' : 'focal-not-found', detail: res.error === 'focal-not-found' ? res.requested.join(', ') : undefined }
  const assoc: (string | number)[][] = [['termo_focal', 'posicao', 'colocado', 'log_likelihood', 'segmentos_juntos', 'segmentos_foco', 'segmentos_colocado', 'pct_dos_segmentos_do_foco']]
  for (const [focal, items] of res.collocates) {
    items.forEach((c, i) => assoc.push([focal, i + 1, c.term, c.logLikelihood.toFixed(4), c.joint, c.focalSegments, c.termSegments, (100 * (c.focalSegments ? c.joint / c.focalSegments : 0)).toFixed(1)]))
  }
  return {
    files: [
      { name: 'keyword_associations_bars.json', mime: 'application/json', role: 'figure', data: b64(JSON.stringify(res.bars)) },
      { name: 'keyword_associations_network.json', mime: 'application/json', role: 'figure', data: b64(JSON.stringify(res.radial)) },
      { name: 'keyword_associations.csv', mime: 'text/csv', role: 'table', title: 'Associations', data: b64(csv(assoc)) },
      { name: 'keyword_association_examples.csv', mime: 'text/csv', role: 'table', title: 'Examples', data: b64(csv([['termo_focal', 'colocado', 'trecho'], ...res.examples])) }
    ],
    summary: { focalTerms: res.focalTerms.join(', '), missing: res.missing.join(', '), segments: res.segments }
  }
}
