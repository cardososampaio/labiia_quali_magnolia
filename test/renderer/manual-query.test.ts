import { describe, it, expect } from 'vitest'
import { manualCondition, combineConditions } from '../../src/renderer/labiia/manual-query'

// Choosing codes from a list in the Query Builder draws the same query the
// person would have drawn: any (OR) or all (AND) of the codes, plus text.
const pick = (...guids: string[]) => ({ code: guids.map((guid) => ({ guid, name: guid })) }) as never
const codes = [{ guid: 'A' }, { guid: 'A1', parentGuid: 'A' }, { guid: 'B' }]

describe('manual query', () => {
  it('joins the chosen codes with OR or AND', () => {
    expect(manualCondition(pick('A', 'B'), 'or', '', false, codes)).toEqual({
      type: 'or', conditions: [{ type: 'code', codeGuid: 'A' }, { type: 'code', codeGuid: 'B' }]
    })
    expect(manualCondition(pick('A', 'B'), 'and', '', false, codes)?.type).toBe('and')
  })
  it('narrows to passages with the text when one is given', () => {
    const c = manualCondition(pick('A'), 'or', '  democracia ', false, codes)
    expect(c).toEqual({ type: 'and', conditions: [{ type: 'code', codeGuid: 'A' }, { type: 'text', searchText: 'democracia' }] })
    expect(manualCondition(pick(), 'or', 'x', false, codes)).toEqual({ type: 'text', searchText: 'x' })
  })
  it('lets a ticked parent with its subcodes stand for its ticked children', () => {
    const c = manualCondition(pick('A', 'A1'), 'or', '', true, codes)
    expect(c).toEqual({ type: 'code', codeGuid: 'A', includeSubcodes: true })
  })
  it('nests long selections in groups of ten', () => {
    const items = Array.from({ length: 23 }, (_, i) => ({ type: 'code', codeGuid: `c${i}` }) as never)
    const c = combineConditions('or', items) as { conditions: { conditions: unknown[] }[] }
    expect(c.conditions).toHaveLength(3)
    expect(c.conditions[0].conditions).toHaveLength(10)
  })
})
