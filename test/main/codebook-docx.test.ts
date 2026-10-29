import { describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import { readCodebookDocument } from '../../src/main/qdpx/codebook-document'
import { buildOutline, detectOutline, outlineToTree, splitNumber, type Outline } from '../../src/renderer/utils/codebook-outline'

// A codebook written in a document becomes categories (parent codes) and codes
// (children). One reading rule per document, picked from how it is written,
// and the same codebook gives the same tree in every supported format.
const dir = join(__dirname, '../fixtures/codebooks')
const shape = (rows: { level: number; name: string }[]): string[] => rows.map((r) => `${r.level} ${r.name}`)

interface Expected { rule: Outline['rule']; rows: string[]; bookTitle?: string; descriptions?: Record<number, string>; introduction?: string[] }

const EXPECTED: Record<string, Expected> = {
  'negrito-numero': {
    rule: 'bold-number',
    rows: ['1 Nível de reflexão', '2 nenhuma', '2 opinião', '2 reflexão baixa', '2 reflexão alta', '1 Tema', '2 avaliação', '2 currículo'],
    descriptions: { 0: 'Quanto o participante reflete sobre a própria prática.', 6: 'Quando fala de provas e notas.' },
    introduction: ['Livro de códigos usado na pesquisa sobre reflexão docente.']
  },
  titulos: {
    rule: 'headings',
    bookTitle: 'Livro de códigos – Projeto X',
    rows: ['1 Nível de reflexão', '2 nenhuma', '2 opinião', '1 Tema', '2 avaliação', '3 Subtema da avaliação'],
    descriptions: { 2: 'Expressa só opinião, sem justificar.' }
  },
  numeracao: { rule: 'numbering', rows: ['1 Nível de reflexão', '2 nenhuma', '2 opinião', '3 opinião política', '1 Tema', '2 avaliação'] },
  // Headings mark document sections here; the categories are bold + number.
  conflito: { rule: 'bold-number', rows: ['1 Nível de reflexão', '2 nenhuma', '2 opinião', '1 Tema', '2 avaliação', '2 currículo'] },
  // Automatic list numbering: the number is not in the text.
  'lista-automatica': { rule: 'bold-number', rows: ['1 Nível de reflexão', '2 nenhuma', '2 opinião', '1 Tema', '2 avaliação'] }
}

const FORMATS: { label: string; path: (name: string) => string }[] = [
  { label: 'Word .docx', path: (n) => join(dir, `${n}.docx`) },
  { label: 'OpenDocument .odt (LibreOffice)', path: (n) => join(dir, 'libreoffice', `${n}.odt`) },
  { label: 'RTF saved by LibreOffice', path: (n) => join(dir, 'libreoffice', `${n}.rtf`) },
  { label: 'RTF saved by Word', path: (n) => join(dir, 'word', `${n}.rtf`) },
  { label: 'Markdown .md', path: (n) => join(dir, 'markdown', `${n}.md`) }
]

describe('splitNumber', () => {
  it('reads item numbers and leaves years in sentences alone', () => {
    expect(splitNumber('*1. Nível de reflexão')).toMatchObject({ name: 'Nível de reflexão', depth: 1 })
    expect(splitNumber('0. nenhuma')).toMatchObject({ name: 'nenhuma', depth: 1 })
    expect(splitNumber('1.2.1 opinião política')).toMatchObject({ name: 'opinião política', depth: 3 })
    expect(splitNumber('2) currículo')).toMatchObject({ name: 'currículo', depth: 1 })
    expect(splitNumber('2024 foi um ano difícil').number).toBeNull()
  })
})

for (const format of FORMATS) {
  describe(`reading a codebook from ${format.label}`, () => {
    for (const [name, want] of Object.entries(EXPECTED)) {
      it(name, async () => {
        const o = detectOutline(await readCodebookDocument(format.path(name)))!
        expect(o.rule).toBe(want.rule)
        expect(shape(o.rows)).toEqual(want.rows)
        if (want.bookTitle) expect(o.bookTitle).toBe(want.bookTitle)
        for (const [i, d] of Object.entries(want.descriptions ?? {})) expect(o.rows[Number(i)].description).toBe(d)
        if (want.introduction) expect(o.introduction).toEqual(want.introduction)
      })
    }
  })
}

// The old .doc format is converted with Word (or LibreOffice) first.
const canConvertDoc = process.platform === 'win32' || existsSync('/usr/bin/soffice')
describe.skipIf(!canConvertDoc)('reading a codebook from the old Word .doc format', () => {
  for (const origin of ['word', 'libreoffice']) {
    it(`negrito-numero.doc saved by ${origin}`, async () => {
      const o = detectOutline(await readCodebookDocument(join(dir, origin, 'negrito-numero.doc')))!
      expect(o.rule).toBe('bold-number')
      expect(shape(o.rows)).toEqual(EXPECTED['negrito-numero'].rows)
    }, 90_000)
  }
})

describe('choosing and editing the outline', () => {
  it('keeps the other rules available, as the preview offers them', async () => {
    const paragraphs = await readCodebookDocument(join(dir, 'conflito.docx'))
    expect(shape(buildOutline(paragraphs, 'headings').rows)).toEqual(['1 Introdução', '1 Códigos'])
  })

  it('builds the tree, dropping excluded rows and keeping numbers on request', async () => {
    const o = detectOutline(await readCodebookDocument(join(dir, 'negrito-numero.docx')))!
    const rows = o.rows.map((r) => (r.name === 'Tema' ? { ...r, include: false } : r))
    const tree = outlineToTree(rows, false)
    expect(tree.map((c) => c.name)).toEqual(['Nível de reflexão'])
    // Codes of an excluded category join the category before it.
    expect(tree[0].children.map((c) => c.name)).toEqual(['nenhuma', 'opinião', 'reflexão baixa', 'reflexão alta', 'avaliação', 'currículo'])
    expect(outlineToTree(o.rows, true)[0].name).toBe('*1. Nível de reflexão')
  })
})
