/**
 * Word tree (labiia_lex's "Árvore de Palavras"): the words that come before
 * and after a central word in the text segments, up to a depth, as branches
 * in columns to the left and right. Counting, trimming and layout follow
 * labiia_lex's word_tree_extra.
 */
import type { PreparedCorpus } from '../corpus/prepare'
import type { Lexicon } from '../corpus/lexicon'
import type { TreeFigure } from '../../../renderer/models/lexical-figures'

const TOKEN = /^[a-zA-ZÀ-ÿ]+(?:_[a-zA-ZÀ-ÿ]+)*$/

export interface WordTreeOptions {
  keyword: string
  minFreq: number
  maxDepth: number
  minBranchFreq: number
  topBranches: number
  useLemmas: boolean
  activeOnly: boolean
}

export type WordTreeResult =
  | { ok: true; figure: TreeFigure; root: string; rootFrequency: number; rows: string[][] }
  | { ok: false; error: 'no-vocabulary' | 'keyword-not-found' | 'no-branches'; keyword?: string }

/** A node is a side (L, R or ROOT) and the path of words from the root. */
type NodeKey = string
const key = (side: string, path: string[]): NodeKey => `${side}\u0001${path.join('\u0000')}`
const parse = (k: NodeKey): { side: string; path: string[] } => {
  const [side, rest] = k.split('\u0001')
  return { side, path: rest ? rest.split('\u0000') : [] }
}

/** Segment tokens restricted to the analysis vocabulary (labiia_lex builds it with TextProcessor.build_dtm). */
function tokenizedSegments(c: PreparedCorpus, lex: Lexicon, o: WordTreeOptions): string[][] {
  // Vocabulary: active terms with at least minFreq occurrences that are not stopword-like.
  const vocab = new Set<string>()
  if (o.useLemmas) {
    for (let i = 0; i < c.lemmas.length; i++) {
      if (c.lemmaAct[i] === 1 && c.lemmaFreq[i] >= o.minFreq && !lex.isStopwordLike(c.lemmas[i])) vocab.add(c.lemmas[i])
    }
  } else {
    for (let i = 0; i < c.forms.length; i++) {
      if (c.formAct[i] === 1 && c.formFreq[i] >= o.minFreq && !lex.isStopwordLike(c.forms[i])) vocab.add(c.forms[i])
    }
  }
  if (vocab.size === 0) return []
  const out: string[][] = []
  for (let s = 0; s < c.uceText.length; s++) {
    const tokens: string[] = []
    for (let t = c.uceStart[s]; t < c.uceStart[s + 1]; t++) {
      const f = c.tokens[t]
      const form = c.forms[f]
      if (!TOKEN.test(form)) continue
      if (o.activeOnly && c.formAct[f] !== 1) continue
      const term = o.useLemmas ? c.lemmas[c.formLemma[f]] : form
      if (vocab.has(term)) tokens.push(term)
    }
    if (tokens.length) out.push(tokens)
  }
  return out
}

function mergePhrase(tokens: string[], phrase: string[]): string[] {
  const merged: string[] = []
  for (let i = 0; i < tokens.length;) {
    if (phrase.every((p, j) => tokens[i + j] === p)) {
      merged.push(phrase.join(' '))
      i += phrase.length
    } else merged.push(tokens[i++])
  }
  return merged
}

/** How a typed word is read: lower case, and its lemma when lemmas are used. */
function normalizeTerm(c: PreparedCorpus, word: string, useLemmas: boolean): string {
  const w = word.toLowerCase()
  if (!useLemmas) return w
  const f = c.forms.indexOf(w)
  return f >= 0 ? c.lemmas[c.formLemma[f]] : w
}

export function wordTree(c: PreparedCorpus, lex: Lexicon, o: WordTreeOptions): WordTreeResult {
  let segments = tokenizedSegments(c, lex, o)
  if (segments.length === 0) return { ok: false, error: 'no-vocabulary' }

  // A central term of several words is joined into one token before counting.
  const phrase = (o.keyword.toLowerCase().match(/[a-zA-ZÀ-ÿ]+(?:_[a-zA-ZÀ-ÿ]+)*/g) ?? []).map((w) => normalizeTerm(c, w, o.useLemmas)).filter(Boolean)
  let keyword = ''
  if (phrase.length > 1) {
    keyword = phrase.join(' ')
    segments = segments.map((t) => mergePhrase(t, phrase))
  } else if (phrase.length === 1) keyword = phrase[0]

  const tokenCount = new Map<string, number>()
  for (const t of segments) for (const w of t) tokenCount.set(w, (tokenCount.get(w) ?? 0) + 1)
  if (keyword && !tokenCount.has(keyword)) return { ok: false, error: 'keyword-not-found', keyword }
  if (!keyword) {
    // Counter.most_common(1): the highest count, the first seen among ties.
    let best = -1
    for (const [w, n] of tokenCount) if (n > best) { best = n; keyword = w }
  }

  const rootKey = key('ROOT', [keyword])
  const edges = new Map<string, { parent: NodeKey; child: NodeKey; weight: number }>()
  const bump = (parent: NodeKey, child: NodeKey): void => {
    const k = `${parent}\u0002${child}`
    const e = edges.get(k)
    if (e) e.weight++
    else edges.set(k, { parent, child, weight: 1 })
  }
  const maxDepth = Math.max(1, Math.min(8, Math.round(o.maxDepth)))
  for (const tokens of segments) {
    for (let idx = 0; idx < tokens.length; idx++) {
      if (tokens[idx] !== keyword) continue
      let parent = rootKey
      const right: string[] = []
      for (let d = 1; d <= maxDepth && idx + d < tokens.length; d++) {
        right.push(tokens[idx + d])
        const child = key('R', right)
        bump(parent, child)
        parent = child
      }
      parent = rootKey
      const left: string[] = []
      for (let d = 1; d <= maxDepth && idx - d >= 0; d++) {
        left.push(tokens[idx - d])
        const child = key('L', left)
        bump(parent, child)
        parent = child
      }
    }
  }
  const minBranch = Math.max(1, Math.round(o.minBranchFreq))
  let kept = [...edges.values()].filter((e) => e.weight >= minBranch)
  if (kept.length === 0) return { ok: false, error: 'no-branches', keyword }

  // Keep the strongest branches and their ancestors.
  const strength = new Map<NodeKey, number>()
  const parentOf = new Map<NodeKey, NodeKey>()
  for (const e of kept) {
    strength.set(e.child, (strength.get(e.child) ?? 0) + e.weight)
    parentOf.set(e.child, e.parent)
  }
  const top = Math.max(20, Math.min(500, Math.round(o.topBranches)))
  const strongest = [...strength].sort((a, b) => b[1] - a[1]).slice(0, top).map(([n]) => n)
  const keep = new Set<NodeKey>([rootKey])
  for (let node of strongest) {
    keep.add(node)
    while (parentOf.has(node) && !keep.has(parentOf.get(node)!)) {
      node = parentOf.get(node)!
      keep.add(node)
    }
  }
  kept = kept.filter((e) => keep.has(e.parent) && keep.has(e.child))

  const nodeFreq = new Map<NodeKey, number>()
  for (const e of kept) {
    nodeFreq.set(e.parent, (nodeFreq.get(e.parent) ?? 0) + e.weight)
    nodeFreq.set(e.child, (nodeFreq.get(e.child) ?? 0) + e.weight)
  }
  const rootFrequency = tokenCount.get(keyword) ?? 0
  nodeFreq.set(rootKey, Math.max(rootFrequency, nodeFreq.get(rootKey) ?? 0))

  // Columns by side and depth, most frequent at the top; ties by last word,
  // then by the whole path so the order never depends on chance.
  const nodes = new Set<NodeKey>([rootKey])
  for (const e of kept) { nodes.add(e.parent); nodes.add(e.child) }
  const columns = new Map<string, NodeKey[]>()
  for (const n of nodes) {
    const { side, path } = parse(n)
    if (side === 'ROOT') continue
    const col = `${side}${path.length}`
    if (!columns.has(col)) columns.set(col, [])
    columns.get(col)!.push(n)
  }
  const positions = new Map<NodeKey, [number, number]>([[rootKey, [0, 0]]])
  for (const list of columns.values()) {
    list.sort((a, b) => {
      const fa = nodeFreq.get(a) ?? 0, fb = nodeFreq.get(b) ?? 0
      if (fa !== fb) return fb - fa
      const la = parse(a).path.at(-1) ?? '', lb = parse(b).path.at(-1) ?? ''
      return la < lb ? -1 : la > lb ? 1 : a < b ? -1 : a > b ? 1 : 0
    })
    const { side, path } = parse(list[0])
    const depth = path.length
    const spacing = 1 + Math.min(2, depth * 0.08)
    const startY = (list.length - 1) / 2
    const x = side === 'R' ? depth : -depth
    list.forEach((n, i) => positions.set(n, [x, (startY - i) * spacing]))
  }

  const maxW = Math.max(1, ...kept.map((e) => e.weight))
  const maxScore = Math.max(1, ...nodeFreq.values())
  const figure: TreeFigure = {
    kind: 'tree',
    title: 'Árvore de Palavras',
    figW: 14,
    figH: 10,
    dpi: 220,
    background: '#f5f5f5',
    lines: kept.map((e) => {
      const [x1, y1] = positions.get(e.parent)!
      const [x2, y2] = positions.get(e.child)!
      return { x1, y1, x2, y2, width: 0.6 + (3 * e.weight) / maxW, alpha: Math.min(0.9, 0.22 + (0.58 * e.weight) / maxW) }
    }),
    labels: [...positions].filter(([n]) => n !== rootKey).map(([n, [x, y]]) => {
      const size = 8.5 + (7.5 * (nodeFreq.get(n) ?? 1)) / maxScore
      return { text: parse(n).path.at(-1) ?? '', x, y, size: Math.max(8, Math.min(18, size)), bold: false, color: '#1f2937' }
    }).concat([{ text: keyword, x: 0, y: 0, size: 26, bold: true, color: '#111827' }])
  }

  const rows = kept.map((e) => {
    const p = parse(e.parent), ch = parse(e.child)
    return {
      side: ch.side === 'ROOT' ? 'root' : ch.side === 'R' ? 'right' : 'left',
      depth: ch.side === 'ROOT' ? 0 : ch.path.length,
      parent: e.parent === rootKey ? keyword : p.path.join(' '),
      child: e.child === rootKey ? keyword : ch.path.join(' '),
      parentTerm: p.path.at(-1) ?? keyword,
      childTerm: ch.path.at(-1) ?? keyword,
      weight: e.weight
    }
  }).sort((a, b) => b.weight - a.weight || a.depth - b.depth || (a.child < b.child ? -1 : a.child > b.child ? 1 : 0))

  return {
    ok: true,
    figure,
    root: keyword,
    rootFrequency,
    rows: [['side', 'depth', 'parent', 'child', 'parent_term', 'child_term', 'weight'],
      ...rows.map((r) => [r.side, String(r.depth), r.parent, r.child, r.parentTerm, r.childTerm, String(r.weight)])]
  }
}
