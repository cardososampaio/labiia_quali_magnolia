/** Word tree (labiia_lex's "Árvore de Palavras"), drawn by the window. */
import type { TestContext } from '../engine'
import type { LexicalRunResult } from '../../../renderer/models/lexical-api'
import type { WordTreeResult } from '../analyses/word-tree'

const b64 = (text: string): string => Buffer.from(text, 'utf-8').toString('base64')

export async function runWordTree(ctx: TestContext): Promise<Omit<LexicalRunResult, 'ok' | 'corpus'>> {
  const p = ctx.params
  const res = await ctx.worker<WordTreeResult>({
    type: 'word-tree',
    key: ctx.key,
    resourcesDir: ctx.resourcesDir,
    options: {
      keyword: String(p.keyword ?? ''),
      minFreq: Number(p.min_freq) || 3,
      maxDepth: Number(p.max_depth) || 4,
      minBranchFreq: Number(p.min_branch_freq) || 2,
      topBranches: Number(p.top_branches) || 120,
      useLemmas: p.use_lemmas !== false,
      activeOnly: p.active_only !== false
    }
  })
  if (!res.ok) return { error: res.error, detail: res.keyword }
  return {
    files: [
      { name: 'word_tree_extra.json', mime: 'application/json', role: 'figure', data: b64(JSON.stringify(res.figure)) },
      { name: 'word_tree_branches.csv', mime: 'text/csv', role: 'table', title: 'Branches', data: b64(res.rows.map((r) => r.join(';')).join('\n') + '\n') }
    ],
    summary: { root: res.root, rootFrequency: res.rootFrequency }
  }
}
