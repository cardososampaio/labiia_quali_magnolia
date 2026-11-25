import { describe, it, expect } from 'vitest'
import { computeCodeUsage, sortCodeTree, parseSavedView, clampFontScale, countedCodeGuids, subcodeSumOf, CODE_FONT_SCALE_DEFAULT, type SubcodeSum } from '../../src/renderer/labiia/code-panel-view'
import type { Code } from '../../src/renderer/models/types'

// The Codes panel shows, for each code, how many passages it marks and in
// how many documents; it can add subcodes to their parent and order the list.
const code = (guid: string, name: string, children: Code[] = []) => ({ guid, name, children }) as unknown as Code
const tree = [
  code('P', 'Política', [code('C1', 'corrupção'), code('C2', 'Bolsonarismo')]),
  code('A', 'Ásia'),
  code('Z', 'zebra')
]
const sel = (...codeGuids: string[]) => ({ codings: codeGuids.map((codeGuid) => ({ codeGuid })) })
const sources = [
  { guid: 'd1', selections: [sel('C1'), sel('C1', 'P'), sel('A')] },
  { guid: 'd2', selections: [sel('C2'), sel('Z'), sel('Z')] },
  { guid: 'd3', selections: [sel('Z')] }
]

describe('code usage', () => {
  it('counts applications and documents of each code on its own', () => {
    const u = computeCodeUsage(tree, sources, false)
    expect(u.get('C1')).toEqual({ count: 2, documents: 1 })
    expect(u.get('P')).toEqual({ count: 1, documents: 1 })
    expect(u.get('Z')).toEqual({ count: 3, documents: 2 })
  })

  it('adds subcodes to the parent, counting a passage once', () => {
    const u = computeCodeUsage(tree, sources, true)
    // C1, C1+P (once), C2 → three passages in two documents.
    expect(u.get('P')).toEqual({ count: 3, documents: 2 })
    expect(u.get('C1')).toEqual({ count: 2, documents: 1 })
  })
})

describe('code order', () => {
  const usage = computeCodeUsage(tree, sources, false)
  const names = (list: Code[]) => list.map((c) => c.name)

  it('keeps the arranged order by default', () => {
    expect(sortCodeTree(tree, 'manual', usage)).toBe(tree)
  })

  it('orders by name ignoring case and accents, at every level', () => {
    const sorted = sortCodeTree(tree, 'nameAsc', usage)
    expect(names(sorted)).toEqual(['Ásia', 'Política', 'zebra'])
    expect(names(sorted[1].children)).toEqual(['Bolsonarismo', 'corrupção'])
    expect(names(sortCodeTree(tree, 'nameDesc', usage))).toEqual(['zebra', 'Política', 'Ásia'])
  })

  it('orders by applications, ties by name', () => {
    expect(names(sortCodeTree(tree, 'countDesc', usage))).toEqual(['zebra', 'Ásia', 'Política'])
    expect(names(sortCodeTree(tree, 'countAsc', usage))).toEqual(['Ásia', 'Política', 'zebra'])
  })
})

describe('saved view', () => {
  it('starts 30% larger, keeps the arranged order and subcodes apart', () => {
    expect(parseSavedView(null)).toEqual({ sort: 'manual', aggregateSubcodes: false, fontScale: 1.3, subcodeSums: {} })
    // A code's own choice is kept only when it is one of the three ways.
    expect(parseSavedView(JSON.stringify({ subcodeSums: { A: 'children', B: 'bogus' } })).subcodeSums).toEqual({ A: 'children' })
    expect(parseSavedView('not json').fontScale).toBe(CODE_FONT_SCALE_DEFAULT)
  })

  it('keeps the text size within limits', () => {
    expect(clampFontScale(9)).toBe(2.5)
    expect(clampFontScale(0.1)).toBe(0.8)
    expect(clampFontScale(1.2000000001)).toBe(1.2)
  })
})

// Each code chooses how its number adds up its subcodes, in a tree of
// Pai › Filho › Neto › Bisneto. Only the count changes.
describe('adding up subcodes, code by code', () => {
  const family = [code('P', 'Pai', [code('F', 'Filho', [code('N', 'Neto', [code('B', 'Bisneto')])])]), code('X', 'Outro')]
  const passages = [{ guid: 'd1', selections: [sel('P'), sel('F'), sel('N'), sel('B')] }, { guid: 'd2', selections: [sel('N'), sel('P', 'N')] }]
  const usage = (modes: Record<string, SubcodeSum>) => computeCodeUsage(family, passages, (g) => modes[g] ?? 'none')

  it('counts only its own passages when it does not add subcodes', () => {
    const u = usage({})
    expect([u.get('P')?.count, u.get('F')?.count, u.get('N')?.count]).toEqual([2, 1, 3])
  })

  it('adds only the level right below: the Neto counts in the Filho, not in the Pai', () => {
    const u = usage({ P: 'children', F: 'children' })
    // Pai: its two passages (one in each document) and the Filho's one.
    expect(u.get('P')).toEqual({ count: 3, documents: 2 })
    // Filho: its own and the Neto's three; the Bisneto stays out.
    expect(u.get('F')).toEqual({ count: 4, documents: 2 })
  })

  it('adds every level when chosen, counting a passage with Pai and Neto once', () => {
    const u = usage({ P: 'all' })
    // P, F, N, B in d1; N and P+N (once) in d2.
    expect(u.get('P')).toEqual({ count: 6, documents: 2 })
    // The Filho kept its own choice: not adding.
    expect(u.get('F')?.count).toBe(1)
  })

  it('leaves a passage of the Neto out of the Pai that adds only the level below', () => {
    const only = [{ guid: 'd', selections: [sel('N')] }]
    const u = computeCodeUsage(family, only, (g) => (g === 'P' ? 'children' : 'none'))
    expect(u.get('P')).toBeUndefined()
    expect(u.get('N')?.count).toBe(1)
  })

  it("follows the panel's choice for codes without their own", () => {
    expect(subcodeSumOf({ aggregateSubcodes: true, subcodeSums: {} }, 'P')).toBe('all')
    expect(subcodeSumOf({ aggregateSubcodes: true, subcodeSums: { P: 'children' } }, 'P')).toBe('children')
    expect(subcodeSumOf({ aggregateSubcodes: false, subcodeSums: {} }, 'P')).toBe('none')
  })

  it('counts a code listed twice in the tree under the parent it appears under', () => {
    // Some older project files list a subcode again at the top level, with the same guid.
    const twice = [code('S', 'Sistema', [code('A', 'Alegação')]), code('A', 'Alegação')]
    const u = computeCodeUsage(twice, [{ guid: 'd', selections: [sel('A'), sel('A')] }], true)
    expect(u.get('S')?.count).toBe(2)
    expect(u.get('A')?.count).toBe(2)
  })

  it('opens a code with the codes its number counts', () => {
    expect(countedCodeGuids(family[0], 'none')).toEqual(['P'])
    expect(countedCodeGuids(family[0], 'children')).toEqual(['P', 'F'])
    expect(countedCodeGuids(family[0], 'all')).toEqual(['P', 'F', 'N', 'B'])
  })
})
