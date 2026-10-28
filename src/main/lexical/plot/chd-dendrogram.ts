/**
 * Data of labiia_lex's readable CHD dendrogram (render_chd_dendrogram): the
 * tree on top, then for each class its name, its share of the classified
 * segments and its most specific words.
 *
 * Correction to labiia_lex: the tree is the one the CHD actually built
 * (tree.nwk written by R). labiia_lex drew a tree rebuilt by Ward clustering
 * of the class profiles, which can join classes the CHD separated early.
 */
import type { ChdDendrogramFigure } from '../../../renderer/models/lexical-figures'

/** labiia_lex's class colours (chart_theme.CHD_CLASS_PALETTE): class k always gets colour k. */
export const CHD_CLASS_PALETTE = ['#C0405C', '#45245E', '#966A00', '#0F5E3A', '#0E74B8', '#8A4F2A', '#00707A', '#5B6B00', '#6A3FA0', '#3E5A9C']

type Node = number | Node[]

/** Parses a Newick tree whose leaves are class numbers ("((1,2),3);"). */
export function parseNewick(text: string): Node | null {
  const s = text.trim().replace(/;$/, '')
  let i = 0
  const node = (): Node => {
    if (s[i] === '(') {
      i++
      const kids: Node[] = [node()]
      while (s[i] === ',') { i++; kids.push(node()) }
      i++ // ')'
      while (i < s.length && s[i] !== ',' && s[i] !== ')') i++ // internal labels or lengths
      return kids
    }
    let t = ''
    while (i < s.length && s[i] !== ',' && s[i] !== ')') t += s[i++]
    return Number(t.split(':')[0])
  }
  try { return s ? node() : null } catch { return null }
}

const leaves = (n: Node): number[] => (Array.isArray(n) ? n.flatMap(leaves) : [n])
const depth = (n: Node): number => (Array.isArray(n) ? 1 + Math.max(...n.map(depth)) : 0)

export function chdDendrogram(
  newick: string,
  sizes: number[],
  wordsOf: (cls: number) => string[],
  maxTerms = 18
): ChdDendrogramFigure {
  const n = sizes.length
  const ids = Array.from({ length: n }, (_v, k) => k + 1).filter((k) => sizes[k - 1] > 0)
  let tree = parseNewick(newick)
  const fromTree = tree ? leaves(tree).filter((k) => ids.includes(k)) : []
  if (!tree || fromTree.length < 2) tree = ids.slice()
  const order = [...fromTree, ...ids.filter((k) => !fromTree.includes(k))]
  const x = new Map(order.map((k, i) => [k, i + 1]))
  const total = ids.reduce((s, k) => s + sizes[k - 1], 0) || 1
  const lines: [number, number, number, number][] = []
  const baseY = 0.68
  const step = 0.22 / Math.max(1, depth(tree))
  const draw = (nd: Node): [number, number] => {
    if (!Array.isArray(nd)) return [x.get(nd) ?? 0, baseY]
    const pts = nd.map(draw).filter(([px]) => px > 0)
    if (!pts.length) return [0, baseY]
    const y = Math.max(...pts.map(([, py]) => py)) + step
    const xs = pts.map(([px]) => px)
    lines.push([Math.min(...xs), y, Math.max(...xs), y])
    for (const [px, py] of pts) lines.push([px, py, px, y])
    return [xs.reduce((a, b) => a + b, 0) / xs.length, y]
  }
  draw(tree)
  const limit = Math.max(1, Math.min(18, maxTerms))
  return {
    kind: 'chd-dendrogram',
    title: 'Classificação Hierárquica Descendente (CHD)',
    figW: Math.max(11, 2.25 * order.length),
    figH: Math.max(8.8, 7.2 + Math.min(2.4, limit * 0.05)),
    dpi: 160,
    classes: order.map((k) => ({
      id: k,
      x: x.get(k)!,
      color: CHD_CLASS_PALETTE[(k - 1) % CHD_CLASS_PALETTE.length],
      percent: (100 * sizes[k - 1]) / total,
      words: wordsOf(k).slice(0, limit)
    })),
    lines,
    rectW: Math.min(0.92, Math.max(0.68, 4.2 / Math.max(order.length, 1)))
  }
}
