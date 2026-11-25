import { describe, it, expect } from 'vitest'
import type { Code } from '../../src/renderer/models/types'
import type { CodeHistory, HistoryEntry } from '../../src/renderer/labiia/code-history-model'
import { currentTree, historySteps, historyToMarkdown, originsTree, snapshotTree } from '../../src/renderer/labiia/code-history-report'

// The report is an audit trail: someone who did not take part in the
// analysis must see which codes it started and ended with, redo each
// decision in order, and see where each final code came from. It must read
// as plain text and converted, so it has no wide tables.

const code = (guid: string, name: string, children: Code[] = []): Code => ({ guid, name, isCodable: true, children }) as Code
let n = 0
const entry = (at: string, e: Partial<HistoryEntry>): HistoryEntry =>
  ({ id: String(++n), at: `2026-11-24T${at}.000Z`, user: 'Ana', origin: 'edit', action: 'created', ...e }) as HistoryEntry

const codes = [
  code('D', 'Democracia', [code('I', 'Igualdade', [code('R', 'Reconhecimento', [code('N', 'Internet')])])]),
  code('P', 'Péssima avaliação'),
  code('Z', 'Comentários do Zotero', [code('Z1', 'resumo'), code('Z2', 'interessante')]),
  code('V', 'Novo nome')
]
const history: CodeHistory = {
  version: 1,
  enabled: true,
  entries: [
    entry('20:00:00', { action: 'start', codes: [{ guid: 'D', name: 'Democracia', path: 'Democracia' }, { guid: 'I', name: 'Igualdade', path: 'Democracia › Igualdade' }, { guid: 'A', name: 'Avaliação ruim', path: 'Avaliação ruim' }] }),
    entry('20:01:00', { action: 'merged', origin: 'merge', codeGuid: 'A', codeName: 'Avaliação ruim', targetGuid: 'P', targetName: 'Péssima avaliação', passages: 4, justification: 'Mesmo julgamento' }),
    entry('20:02:00', { action: 'moved', codeGuid: 'R', codeName: 'Reconhecimento', before: '', after: 'Democracia › Igualdade', fromParentGuid: null, toParentGuid: 'I' }),
    entry('20:03:00', { action: 'moved', codeGuid: 'N', codeName: 'Internet', before: '', after: 'Democracia › Igualdade › Reconhecimento', fromParentGuid: null, toParentGuid: 'R' }),
    entry('20:04:00', { action: 'imported', origin: 'zotero', codeGuid: 'Z', codeName: 'Comentários do Zotero', path: 'Comentários do Zotero', parentGuid: null }),
    entry('20:04:01', { action: 'imported', origin: 'zotero', codeGuid: 'Z1', codeName: 'resumo', path: 'Comentários do Zotero › resumo', parentGuid: 'Z' }),
    entry('20:04:01', { action: 'imported', origin: 'zotero', codeGuid: 'Z2', codeName: 'interessante', path: 'Comentários do Zotero › interessante', parentGuid: 'Z' }),
    entry('20:05:00', { action: 'renamed', codeGuid: 'V', codeName: 'Novo nome', path: 'Novo nome', before: 'Velho', after: 'Novo nome' }),
    entry('20:05:10', { action: 'renamed', origin: 'undo', codeGuid: 'V', codeName: 'Velho', path: 'Velho', before: 'Novo nome', after: 'Velho' }),
    entry('20:05:20', { action: 'renamed', origin: 'redo', codeGuid: 'V', codeName: 'Novo nome', path: 'Novo nome', before: 'Velho', after: 'Novo nome' }),
    entry('20:06:00', { action: 'deleted', codeGuid: 'X', codeName: 'Descartado', path: 'Descartado', passages: 2, parentGuid: null })
  ]
}
const usage = new Map([['D', { count: 20 }], ['I', { count: 8 }], ['P', { count: 12 }], ['Z1', { count: 1 }]])

describe('steps of the coding', () => {
  const steps = historySteps(history)

  it('numbers the steps without gaps, an import of several codes being one step', () => {
    expect(steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(steps[4].entries.map((e) => e.codeName)).toEqual(['Comentários do Zotero', 'resumo', 'interessante'])
  })

  it('ties an undo and a redo to the decision they reverse', () => {
    const rename = steps[5]
    expect(rename.undoneBy).toEqual([7])
    expect(rename.redoneBy).toEqual([8])
    expect(steps[6].reverses).toBe(6)
    expect(steps[7].reverses).toBe(6)
  })

  it('does not join two changes of the same kind made apart in time', () => {
    expect(steps[2].entries).toHaveLength(1)
    expect(steps[3].entries).toHaveLength(1)
  })
})

describe('where each final code came from', () => {
  const lines = originsTree(history, codes, historySteps(history), usage)
  const text = lines.join('\n')

  it('shows the code merged into a final code, with its step', () => {
    const at = lines.indexOf('Péssima avaliação   (12 coded passages)')
    expect(at).toBeGreaterThanOrEqual(0)
    expect(lines[at + 1]).toContain('Avaliação ruim')
    expect(lines[at + 1]).toContain('step 2')
  })

  it('nests a move inside another move, and does not repeat the nested code as a root', () => {
    const at = lines.findIndex((l) => l.startsWith('Igualdade'))
    expect(lines[at + 1]).toMatch(/^└─◄ Reconhecimento/)
    expect(lines[at + 2]).toMatch(/^ {4}└─◄ Internet/)
    expect(lines.filter((l) => l.startsWith('Reconhecimento'))).toHaveLength(0)
  })

  it('leaves out codes nothing happened to', () => {
    expect(lines.some((l) => l.startsWith('Democracia'))).toBe(false)
  })

  it('says that codes came from Zotero and keeps a rename', () => {
    expect(text).toContain('imported from Zotero')
    expect(text).toContain('former name: “Velho”')
  })
})

describe('the trees', () => {
  it('draws the current codes with their coded passages', () => {
    expect(currentTree(codes.slice(0, 1), usage)).toEqual([
      'Democracia (20)',
      '└── Igualdade (8)',
      '    └── Reconhecimento (0)',
      '        └── Internet (0)'
    ])
  })

  it('rebuilds the tree of the start from the recorded paths', () => {
    expect(snapshotTree(history.entries[0].codes!)).toEqual(['Democracia', '└── Igualdade', 'Avaliação ruim'])
  })
})

describe('the whole report', () => {
  const md = historyToMarkdown(history, 'Projeto', codes, usage, new Date('2026-11-25T00:00:00Z'), '0.3.0')

  it('has the sections in order, from the general to the detail', () => {
    const order = ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.', '## 6.', '## Appendix A', '## Appendix B'].map((h) => md.indexOf(h))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('has no table, so it reads as plain text', () => {
    expect(md.split('\n').filter((l) => l.startsWith('|'))).toEqual([])
  })

  it('keeps drawings within 120 columns', () => {
    let inBlock = false
    for (const line of md.split('\n')) {
      if (line.startsWith('```')) { inBlock = !inBlock; continue }
      if (inBlock) expect(Array.from(line).length).toBeLessThanOrEqual(120)
    }
  })

  it('shows each justification, says when one is missing, and counts the missing ones', () => {
    expect(md).toContain('Justification: Mesmo julgamento')
    expect(md).toContain('Justification: (not recorded)')
    expect(md).toContain('Without justification: 5 of 6 decisions')
  })

  it('lists the codes that left, with their step', () => {
    const gone = md.slice(md.indexOf('## 6.'), md.indexOf('## Appendix A'))
    expect(gone).toContain('Avaliação ruim: merged into “Péssima avaliação” (step 2)')
    expect(gone).toContain('Descartado: deleted (step 9)')
  })

  it('names the source of imported codes', () => {
    expect(md).toContain('Imported from Zotero (3 codes)')
  })
})

describe('a project file that lists a code twice', () => {
  it('keeps the code under its parent in the tree of the start', async () => {
    const { snapshotCodes } = await import('../../src/renderer/labiia/code-history-model')
    const twice = [code('S', 'Sistema', [code('A', 'Alegação')]), code('A', 'Alegação')]
    expect(snapshotTree(snapshotCodes(twice))).toEqual(['Sistema', '└── Alegação'])
  })
})
