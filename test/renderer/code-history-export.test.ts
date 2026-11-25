import { describe, it, expect } from 'vitest'
import type { Code } from '../../src/renderer/models/types'
import type { CodeHistory } from '../../src/renderer/labiia/code-history-model'
import { historyToCsv, historyToMarkdown } from '../../src/renderer/labiia/code-history-export'

// The history leaves the program as a spreadsheet (one row per change) and
// as a report for a methods appendix; both must keep the researcher's words
// intact, whatever punctuation or accents they contain.

const history: CodeHistory = {
  version: 1,
  enabled: true,
  entries: [
    { id: '1', at: '2026-11-20T10:00:00.000Z', user: 'Ana', action: 'start', origin: 'edit', codes: [{ guid: 'A', name: 'Saúde', path: 'Saúde' }] },
    { id: '2', at: '2026-11-20T11:00:00.000Z', user: 'Ana', action: 'renamed', origin: 'edit', codeGuid: 'A', codeName: 'Saúde, "pública"', path: 'Saúde, "pública"', before: 'Saúde', after: 'Saúde, "pública"', justification: 'Linha 1\nlinha 2, com vírgula' },
    { id: '3', at: '2026-11-21T09:00:00.000Z', user: 'Bia', action: 'merged', origin: 'merge', codeGuid: 'B', codeName: '=Escola', path: '=Escola', targetGuid: 'A', targetName: 'Saúde, "pública"', after: 'Saúde, "pública"', passages: 4 }
  ]
}

const codes = [{ guid: 'A', name: 'Saúde, "pública"', isCodable: true, children: [] }] as unknown as Code[]

/** Splits CSV text into rows of cells, honouring quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [[]]
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { rows[rows.length - 1].push(cell); cell = '' }
    else if (ch === '\n') { rows[rows.length - 1].push(cell); cell = ''; rows.push([]) }
    else cell += ch
  }
  rows[rows.length - 1].push(cell)
  return rows
}

describe('exporting the history of the codes', () => {
  it('writes one spreadsheet row per entry, keeping commas, quotes, line breaks and accents', () => {
    const rows = parseCsv(historyToCsv(history))
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.length === rows[0].length)).toBe(true)
    expect(rows[2]).toContain('Saúde, "pública"')
    expect(rows[2]).toContain('Linha 1\nlinha 2, com vírgula')
  })

  it('keeps a code name that starts like a formula from running as one', () => {
    const rows = parseCsv(historyToCsv(history))
    expect(rows[3]).toContain("'=Escola")
    expect(rows[3]).not.toContain('=Escola')
  })

  it('writes a report with the period, a timeline by day and each current code', () => {
    const md = historyToMarkdown(history, 'Projeto Recife', codes)
    expect(md.split('\n')[0]).toContain('Projeto Recife')
    expect(md).toContain('### 2026-11-2')
    // Two days, so two day headings in the timeline.
    expect(md.match(/^### \d{4}-\d{2}-\d{2}$/gm)).toHaveLength(2)
    expect(md).toContain('Linha 1 / linha 2, com vírgula')
    // The current code lists its rename and the merge it received, in a table.
    const byCode = md.slice(md.indexOf('## Current codes and their history'), md.indexOf('## Codes that no longer exist'))
    expect(byCode).toContain('Saúde, "pública"')
    expect(byCode.match(/^\| \d{4}-/gm)).toHaveLength(2)
    // The merged code no longer exists and keeps its own section.
    expect(md.slice(md.indexOf('## Codes that no longer exist'))).toContain('Escola')
  })
})

describe('the report reads step by step', () => {
  it('keeps every table row with the same columns, whatever the text holds', () => {
    const tricky: CodeHistory = { version: 1, enabled: true, entries: [
      { id: 'a', at: '2026-11-20T10:00:00.000Z', user: 'Ana | Bia', action: 'renamed', origin: 'edit', codeGuid: 'A', codeName: 'x|y', path: 'x|y', before: 'a\nb', after: 'x|y', justification: 'um | dois\ntrês' }
    ] }
    const md = historyToMarkdown(tricky, 'P', [{ guid: 'A', name: 'x|y', isCodable: true, children: [] }] as unknown as Code[])
    const columns = (line: string) => line.replace(/\\\|/g, '').split('|').length
    for (const block of md.split('\n\n')) {
      const rows = block.split('\n').filter((l) => l.startsWith('|'))
      if (rows.length) expect(new Set(rows.map(columns)).size).toBe(1)
    }
  })

  it('has a summary, the codes at the start and a section for each current code', () => {
    const md = historyToMarkdown(history, 'P', codes)
    expect(md).toContain('## Summary')
    expect(md).toContain('## Codes when the record began')
    expect(md).toContain('## Current codes and their history')
  })
})
