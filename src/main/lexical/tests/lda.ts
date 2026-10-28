/**
 * LDA topics (labiia_lex's "LDA"): the document x term table goes to R's
 * topicmodels through labiia_lex's own script; the window draws the topic
 * distribution, top terms, document-topic heatmap and intertopic map.
 */
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { runRScript } from '../r-runner'
import type { TestContext } from '../engine'
import type { LexicalFile, LexicalRunResult } from '../../../renderer/models/lexical-api'
import type { LdaInput } from '../analyses/lda'
import { readLdaOutputs } from '../analyses/lda'
import { ldaDistribution, ldaTopTerms } from '../plot/lda-figures'

const b64 = (text: string): string => Buffer.from(text, 'utf-8').toString('base64')

export async function runLda(ctx: TestContext): Promise<Omit<LexicalRunResult, 'ok' | 'corpus'>> {
  const p = ctx.params
  const input = await ctx.worker<LdaInput | null>({
    type: 'lda-input',
    key: ctx.key,
    resourcesDir: ctx.resourcesDir,
    options: { minFreq: Number(p.min_freq) || 2, maxFeatures: Number(p.max_features) || 2000, useLemmas: p.use_lemmas !== false }
  })
  if (!input) return { error: 'lda-too-small' }
  const k = Math.max(1, Math.round(Number(p.k) || 6))
  const method = String(p.method) === 'Gibbs' ? 'GIBBS' : 'VEM'
  const out = (name: string): string => join(ctx.runDir, name)
  writeFileSync(out('lda_dtm_input.csv'), input.csv, 'utf-8')
  writeFileSync(out('lda_topicmodels_args.json'), JSON.stringify({
    input_dtm_csv: out('lda_dtm_input.csv'),
    output_topics_csv: out('lda_topics.csv'),
    output_doc_topic_csv: out('lda_doc_topic.csv'),
    output_terms_beta_csv: out('lda_terms_beta.csv'),
    output_documents_gamma_csv: out('lda_documents_gamma.csv'),
    output_summary_json: out('lda_summary.json'),
    output_tuning_csv: out('lda_tuning.csv'),
    k_requested: k,
    k_effective: k,
    seed: Math.round(Number(p.seed) || 42),
    method,
    gibbs_burnin: Number(p.gibbs_burnin) || 1000,
    // labiia_lex passes the iterations field as Gibbs iterations (VEM ignores it).
    gibbs_iter: method === 'GIBBS' ? Number(p.gibbs_iter) || 1000 : Number(p.n_iter) || 500,
    gibbs_thin: Number(p.gibbs_thin) || 100,
    n_top_terms: 15,
    enable_tuning: p.enable_k_tuning === true,
    k_min: Number(p.k_min) || 2,
    k_max: Number(p.k_max) || 12
  }), 'utf-8')

  ctx.progress({ stage: 'render' })
  const run = await runRScript(ctx.r!, ctx.runId, {
    script: join(ctx.resourcesDir, 'R', 'lda_topicmodels.R'),
    args: [out('lda_topicmodels_args.json')],
    cwd: ctx.runDir,
    timeoutMs: 900_000,
    expectedOutputs: ['lda_topics.csv', 'lda_doc_topic.csv', 'lda_terms_beta.csv', 'lda_documents_gamma.csv'].map(out)
  })
  if (!run.ok) return { error: run.timedOut ? 'r-timeout' : run.cancelled ? 'cancelled' : 'r-failed', detail: (run.stderr || run.stdout).slice(-4000) }

  const topicsCsv = readFileSync(out('lda_topics.csv'), 'utf-8')
  const docTopicCsv = readFileSync(out('lda_doc_topic.csv'), 'utf-8')
  const model = readLdaOutputs(topicsCsv, docTopicCsv)
  const files: LexicalFile[] = [
    { name: 'lda_distribution.json', mime: 'application/json', role: 'figure', data: b64(JSON.stringify(ldaDistribution(model))) },
    { name: 'lda_top_terms.json', mime: 'application/json', role: 'figure', data: b64(JSON.stringify(ldaTopTerms(model))) },
    { name: 'lda_doc_topic.csv', mime: 'text/csv', role: 'table', title: 'DocTopic', data: b64(docTopicCsv) },
    { name: 'lda_topics.csv', mime: 'text/csv', role: 'data', data: b64(topicsCsv) }
  ]
  for (const name of ['lda_terms_beta.csv', 'lda_documents_gamma.csv', 'lda_tuning.csv', 'lda_summary.json']) {
    if (existsSync(out(name))) files.push({ name, mime: name.endsWith('.json') ? 'application/json' : 'text/csv', role: 'data', data: readFileSync(out(name)).toString('base64') })
  }
  return { files, summary: { topics: model.k, terms: input.vocabulary.length } }
}
