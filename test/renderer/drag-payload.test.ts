import { describe, it, expect } from 'vitest'
import { payloadsFor, entityPayloadsEach } from '../../src/renderer/utils/drag-payload'

// Items picked in the Select Items dialog must reach a drop zone in the
// same shape a drag from the Code Browser / Document Browser produces, or
// the zone ignores them.
describe('payloadsFor', () => {
  it('packs several codes into one drop, like a multi-select drag', () => {
    const [drop] = payloadsFor({ code: [{ guid: 'A', name: 'Um', color: '#f00' }, { guid: 'B', name: 'Dois' }] })
    expect(JSON.parse(drop['application/x-magnolia-code'])).toEqual({ guid: 'A', name: 'Um', color: '#f00' })
    expect(JSON.parse(drop['application/x-magnolia-codes']).map((c: { guid: string }) => c.guid)).toEqual(['A', 'B'])
    expect(JSON.parse(drop['application/json']).kind).toBe('multi')
  })

  it('sends a single code as a plain entity, not a multi wrapper', () => {
    const [drop] = payloadsFor({ code: [{ guid: 'A', name: 'Um' }] })
    expect(JSON.parse(drop['application/json'])).toMatchObject({ kind: 'code', entityGuid: 'A', label: 'Um' })
  })

  it('sends one drop per folder and per category, as they are dragged one by one', () => {
    const drops = payloadsFor({
      folder: [{ guid: 'F1', name: 'Entrevistas' }, { guid: 'F2', name: 'Grupos' }],
      category: [{ guid: 'C1', name: 'Região', tagGuids: ['T1', 'T2'] }]
    })
    expect(drops).toHaveLength(3)
    expect(drops[0]['application/x-magnolia-folder']).toBe('F1')
    expect(JSON.parse(drops[2]['application/x-magnolia-tag'])).toEqual(['T1', 'T2'])
  })

  it('writes documents and tags as guid lists', () => {
    const drops = payloadsFor({ document: [{ guid: 'D1', name: 'a.txt' }], tag: [{ guid: 'T1', label: 'Norte' }] })
    expect(JSON.parse(drops[0]['application/x-magnolia-docs'])).toEqual(['D1'])
    expect(JSON.parse(drops[1]['application/x-magnolia-tag'])).toEqual(['T1'])
  })

  it('splits everything into single entities for canvases', () => {
    const drops = entityPayloadsEach({ code: [{ guid: 'A', name: 'Um' }, { guid: 'B', name: 'Dois' }], memo: [{ guid: 'M', title: 'Nota', content: '' }] })
    expect(drops.map((d) => JSON.parse(d['application/json']).kind)).toEqual(['code', 'code', 'memo'])
  })
})
