/** YAKE key expressions (labiia_lex's "Palavras-Chave (YAKE)"), drawn by the window. */
import type { TestContext } from '../engine'
import type { LexicalRunResult } from '../../../renderer/models/lexical-api'
import type { YakeRun } from '../lexical-worker'

const b64 = (text: string): string => Buffer.from(text, 'utf-8').toString('base64')

export async function runYake(ctx: TestContext): Promise<Omit<LexicalRunResult, 'ok' | 'corpus'>> {
  const p = ctx.params
  const res = await ctx.worker<YakeRun>({
    type: 'yake',
    key: ctx.key,
    resourcesDir: ctx.resourcesDir,
    options: {
      minTokens: Number(p.min_tokens) || 1,
      maxTokens: Number(p.max_tokens) || 3,
      minFreq: Number(p.min_freq) || 1,
      topN: Number(p.top_n) || 50,
      dedupThreshold: Number(p.dedup_threshold) || 0.9,
      windowSize: 1
    }
  })
  if (res.keyphrases.length === 0) return { error: 'no-keyphrases' }
  const rows = [['Phrase', 'RawYAKE', 'Relevance', 'Frequency', 'DocCount'], ...res.keyphrases.map((k) => [k.phrase, k.rawScore.toFixed(6), k.relevance.toFixed(3), String(k.frequency), String(k.docCount)])]
  return {
    files: [
      { name: 'yake_ranking.json', mime: 'application/json', role: 'figure', data: b64(JSON.stringify(res.figure)) },
      { name: 'yake_keyphrases.csv', mime: 'text/csv', role: 'table', title: 'Keyphrases', data: b64(rows.map((r) => r.join(';')).join('\n') + '\n') }
    ],
    summary: { keyphrases: res.keyphrases.length }
  }
}
