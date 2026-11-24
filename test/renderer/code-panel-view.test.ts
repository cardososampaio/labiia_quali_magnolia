import { describe, it, expect } from 'vitest'
import { computeCodeUsage, sortCodeTree, parseSavedView, clampFontScale, CODE_FONT_SCALE_DEFAULT } from '../../src/renderer/labiia/code-panel-view'
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
    expect(parseSavedView(null)).toEqual({ sort: 'manual', aggregateSubcodes: false, fontScale: 1.3 })
    expect(parseSavedView('not json').fontScale).toBe(CODE_FONT_SCALE_DEFAULT)
  })

  it('keeps the text size within limits', () => {
    expect(clampFontScale(9)).toBe(2.5)
    expect(clampFontScale(0.1)).toBe(0.8)
    expect(clampFontScale(1.2000000001)).toBe(1.2)
  })
})
