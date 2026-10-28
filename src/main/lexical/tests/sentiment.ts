/** Sentiment by OpLexicon (labiia_lex's "Análise de Sentimentos"), drawn by the window. */
import type { TestContext } from '../engine'
import type { LexicalRunResult } from '../../../renderer/models/lexical-api'
import type { SentimentRun } from '../lexical-worker'

const b64 = (text: string): string => Buffer.from(text, 'utf-8').toString('base64')
const csv = (rows: (string | number)[][]): string => rows.map((r) => r.join(';')).join('\n') + '\n'

export async function runSentiment(ctx: TestContext): Promise<Omit<LexicalRunResult, 'ok' | 'corpus'>> {
  // OpLexicon is a Portuguese lexicon; labiia_lex applies it to any corpus, which would misread other languages.
  if (ctx.language !== 'pt') return { error: 'sentiment-pt-only' }
  const res = await ctx.worker<SentimentRun>({ type: 'sentiment', key: ctx.key, resourcesDir: ctx.resourcesDir, topWords: Number(ctx.params.top_words) || 25 })
  if (res.result.matched === 0) return { error: 'no-sentiment-words' }
  const total = res.result.matched
  const dist = [['sentimento', 'quantidade', 'porcentagem'], ...(['Positivo', 'Negativa', 'Neutro'] as const).map((p) => [p, res.result.counts[p], ((res.result.counts[p] / total) * 100).toFixed(4)])]
  return {
    files: [
      { name: 'sentiment_distribution.json', mime: 'application/json', role: 'figure', data: b64(JSON.stringify(res.figure)) },
      { name: 'sentiment_distribution.csv', mime: 'text/csv', role: 'table', title: 'Distribution', data: b64(csv(dist)) },
      { name: 'sentiment_words.csv', mime: 'text/csv', role: 'table', title: 'SentimentWords', data: b64(csv([['palavra', 'sentimento', 'frequencia'], ...res.result.words.map((w) => [w.word, w.polarity, w.frequency])])) }
    ],
    summary: { matched: total }
  }
}
