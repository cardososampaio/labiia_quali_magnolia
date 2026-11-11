/**
 * Bigram and trigram networks (labiia_lex's "Rede de Coocorrência por
 * Bigramas/Trigramas"): counted and laid out in the background thread, drawn
 * by the window as the same matplotlib-style figure.
 */
import type { TestContext } from '../engine'
import type { LexicalFile, LexicalRunResult } from '../../../renderer/models/lexical-api'
import type { NgramNetworkResult, NgramRow } from '../analyses/ngrams'

const b64 = (text: string): string => Buffer.from(text, 'utf-8').toString('base64')
const csv = (header: string[], rows: string[][]): string => [header, ...rows].map((r) => r.join(';')).join('\n') + '\n'

async function runNgrams(ctx: TestContext, n: 2 | 3, title: string): Promise<Omit<LexicalRunResult, 'ok' | 'corpus'>> {
  const res = await ctx.worker<NgramNetworkResult | null>({
    type: 'ngram-network',
    key: ctx.key,
    resourcesDir: ctx.resourcesDir,
    n,
    minFreq: Number(ctx.params.min_freq) || 2,
    topEdges: Number(ctx.params.top_edges) || 120,
    title
  })
  if (!res) return { error: 'no-ngrams' }
  const rows = (list: NgramRow[]): string[][] => list.map((r) => [...r.words, String(r.frequency)])
  const name = n === 2 ? 'bigram' : 'trigram'
  const header = n === 2 ? ['word_1', 'word_2', 'frequency'] : ['word_1', 'word_2', 'word_3', 'frequency']
  const files: LexicalFile[] = [
    { name: `${name}_network.json`, mime: 'application/json', role: 'figure', data: b64(JSON.stringify(res.figure)) },
    { name: `${name}_network_edges.csv`, mime: 'text/csv', role: 'table', title: n === 2 ? 'Bigrams' : 'Trigrams', data: b64(csv(header, rows(res.kept))) }
  ]
  if (n === 3) {
    // labiia_lex's combined export: every bigram, then the trigrams kept.
    const combined = [
      ...res.allBigrams.map((r) => ['bigram', r.words[0], r.words[1], '', String(r.frequency)]),
      ...res.kept.map((r) => ['trigram', ...r.words, String(r.frequency)])
    ]
    files.push({ name: 'ngram_combined_edges.csv', mime: 'text/csv', role: 'data', data: b64(csv(['ngram_type', 'word_1', 'word_2', 'word_3', 'frequency'], combined)) })
  }
  return { files, summary: { nodes: res.figure.nodes.length, edges: res.figure.edges.length } }
}

export const runBigrams = (ctx: TestContext) => runNgrams(ctx, 2, 'Rede de Coocorrência por Bigramas')
export const runTrigrams = (ctx: TestContext) => runNgrams(ctx, 3, 'Rede de Coocorrência por Trigramas')
