import { describe, it, expect } from 'vitest'
import type { Code } from '../../src/renderer/models/types'
import { type CodeHistory, type HistoryEntry, entriesForCode } from '../../src/renderer/labiia/code-history-model'

// "History of this code" shows everything that touched a code: its own
// changes, the start of the record when it already existed, and changes it
// received (a code merged into it, a subcode created in it, moved into or
// out of it). Optionally, the changes of its subcodes too.

const code = (guid: string, name: string, children: Code[] = []): Code => ({ guid, name, isCodable: true, children }) as Code
const codes = [code('P', 'Democracia', [code('F', 'Igualdade', [code('N', 'Internet')])]), code('O', 'Outro')]
let n = 0
const entry = (e: Partial<HistoryEntry>): HistoryEntry => ({ id: String(++n), at: `2026-11-24T10:00:0${n % 10}.000Z`, user: 'Ana', origin: 'edit', action: 'renamed', ...e }) as HistoryEntry

const start = entry({ action: 'start', codes: [{ guid: 'P', name: 'Democracia', path: 'Democracia' }, { guid: 'O', name: 'Outro', path: 'Outro' }] })
const movedIn = entry({ action: 'moved', codeGuid: 'F', codeName: 'Igualdade', path: 'Democracia › Igualdade', before: '', after: 'Democracia', fromParentGuid: null, toParentGuid: 'P' })
const mergedIn = entry({ action: 'merged', origin: 'merge', codeGuid: 'G', codeName: 'Velho', path: 'Velho', targetGuid: 'P', targetName: 'Democracia', passages: 4 })
const createdIn = entry({ action: 'created', codeGuid: 'N', codeName: 'Internet', path: 'Democracia › Igualdade › Internet', parentGuid: 'F' })
const other = entry({ action: 'renamed', codeGuid: 'O', codeName: 'Outro', path: 'Outro', before: 'X', after: 'Outro' })
const history: CodeHistory = { version: 1, enabled: true, entries: [start, movedIn, mergedIn, createdIn, other] }
const ids = (list: HistoryEntry[]) => list.map((e) => e.id)

describe('the history of one code', () => {
  it('shows the start of the record when the code already existed', () => {
    expect(ids(entriesForCode(history, 'O', codes))).toEqual([start.id, other.id])
  })

  it('shows what it received: a subcode moved into it and a code merged into it', () => {
    expect(ids(entriesForCode(history, 'P', codes))).toEqual([start.id, movedIn.id, mergedIn.id])
  })

  it('shows its own move and the subcode created in it, but not its subcodes elsewhere', () => {
    expect(ids(entriesForCode(history, 'F', codes))).toEqual([movedIn.id, createdIn.id])
  })

  it('adds the changes of its subcodes when asked', () => {
    expect(ids(entriesForCode(history, 'P', codes, { includeSubcodes: true }))).toEqual([start.id, movedIn.id, mergedIn.id, createdIn.id])
  })

  it('finds older entries without parent guids by the code path', () => {
    const oldMove = entry({ action: 'moved', codeGuid: 'F', codeName: 'Igualdade', path: 'Democracia › Igualdade', before: '', after: 'Democracia' })
    const oldCreate = entry({ action: 'created', codeGuid: 'N', codeName: 'Internet', path: 'Democracia › Igualdade › Internet' })
    const old: CodeHistory = { version: 1, enabled: true, entries: [oldMove, oldCreate] }
    expect(ids(entriesForCode(old, 'P', codes))).toEqual([oldMove.id])
    expect(ids(entriesForCode(old, 'F', codes))).toEqual([oldMove.id, oldCreate.id])
    // A code elsewhere does not pick them up.
    expect(entriesForCode(old, 'O', codes)).toEqual([])
  })

  it('follows a code through a rename: entries under its old name still count', () => {
    const oldCreate = entry({ action: 'created', codeGuid: 'N', codeName: 'Internet', path: 'Democracia › Antigo › Internet' })
    const rename = entry({ action: 'renamed', codeGuid: 'F', codeName: 'Igualdade', path: 'Democracia › Igualdade', before: 'Antigo', after: 'Igualdade' })
    const h: CodeHistory = { version: 1, enabled: true, entries: [oldCreate, rename] }
    expect(ids(entriesForCode(h, 'F', codes))).toEqual([oldCreate.id, rename.id])
  })
})
