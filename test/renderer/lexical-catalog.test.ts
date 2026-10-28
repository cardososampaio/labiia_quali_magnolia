import { describe, it, expect } from 'vitest'
import { LEXICAL_TESTS, defaultParams, clampParam, isLexicalToolType, lexicalTestFor, lexicalToolType } from '../../src/renderer/components/Lexical/lexical-catalog'
import { documentUnits } from '../../src/renderer/components/Lexical/lexical-units'

// The lexical tests must open with labiia_lex's defaults, so a corpus gives
// the same result in both programs without retuning; saved settings that
// fall outside a test's range are pulled back inside it.

describe('lexical catalog', () => {
  it('lists the twelve tests once each', () => {
    const ids = LEXICAL_TESTS.map((d) => d.id)
    expect(ids).toHaveLength(12)
    expect(new Set(ids).size).toBe(12)
  })

  it('keeps labiia_lex defaults', () => {
    const p = (id: string) => defaultParams(LEXICAL_TESTS.find((d) => d.id === id)!)
    expect(p('wordcloud')).toMatchObject({ max_words: 100, min_freq: 3, colors: 'Dark2', shape: 'square' })
    expect(p('chd')).toMatchObject({ n_classes: 5, classif_mode: '1', tailleuc1: 12, tailleuc2: 14, max_actives: 20000 })
    expect(p('similitude')).toMatchObject({ max_words: 80, min_freq: 3, coefficient: 'cooccurrence', layout: 'frutch', arbremax: true })
    expect(p('lda')).toMatchObject({ k: 6, method: 'VEM', seed: 42, max_features: 2000 })
    expect(p('thematic-map')).toMatchObject({ top_edges: 160, max_nodes: 120, resolution: 0.5 })
    expect(p('yake')).toMatchObject({ top_n: 50, max_tokens: 3, dedup_threshold: 0.9 })
    expect(p('word-tree')).toMatchObject({ max_depth: 4, top_branches: 120, min_branch_freq: 2 })
    expect(p('bigrams')).toMatchObject({ min_freq: 2, top_edges: 120 })
  })

  it('restores saved settings and repairs out-of-range ones', () => {
    const chd = LEXICAL_TESTS.find((d) => d.id === 'chd')!
    const params = defaultParams(chd, { n_classes: 99, min_freq: 1, classif_mode: '7', bw: true, lab: 'A,B' })
    expect(params.n_classes).toBe(10)
    expect(params.min_freq).toBe(3) // IRaMuTeQ's floor
    expect(params.classif_mode).toBe('1')
    expect(params.bw).toBe(true)
    expect(params.lab).toBe('A,B')
    expect(defaultParams(chd, { n_classes: 'x' as unknown as number }).n_classes).toBe(5)
  })

  it('rounds whole-number settings', () => {
    const p = LEXICAL_TESTS.find((d) => d.id === 'lda')!.params.find((x) => x.key === 'k')!
    expect(clampParam(p, 4.6)).toBe(5)
  })

  it('recognises its tool types and no others', () => {
    expect(isLexicalToolType(lexicalToolType('chd'))).toBe(true)
    expect(isLexicalToolType('lexical-unknown')).toBe(false)
    expect(isLexicalToolType('word-frequencies')).toBe(false)
    expect(lexicalTestFor('lexical-yake')?.id).toBe('yake')
  })
})

describe('document units', () => {
  const data = {
    sources: [
      { guid: 'a', name: 'entrevista.txt', sourceType: 'text' },
      { guid: 'b', name: 'foto.png', sourceType: 'image' },
      { guid: 'c', name: 'notas.md', sourceType: 'text' },
      { guid: 'd', name: 'questionario.csv', sourceType: 'survey' },
      { guid: 'e', name: 'vazio.txt', sourceType: 'text' }
    ],
    sourceContents: { a: 'Não há ação sem pré-escola.', b: '', c: '# Título\n\n**negrito** e texto', d: 'id,q1\n1,resposta', e: '   ' },
    surveyCodableCells: { d: [{ respondentId: '1', questionId: 'q1', text: 'resposta aberta' }] }
  } as never

  it('takes plain text, survey answers only, and leaves out documents without text', () => {
    const { units, skipped } = documentUnits(data, ['a', 'b', 'c', 'd', 'e'])
    expect(units.map((u) => u.id)).toEqual(['a', 'c', 'd'])
    expect(units[0].text).toBe('Não há ação sem pré-escola.')
    expect(units[1].text).not.toContain('**')
    expect(units[2].text).toBe('resposta aberta')
    expect(skipped.map((s) => s.id)).toEqual(['b', 'e'])
  })

  it('keeps only the chosen documents', () => {
    expect(documentUnits(data, ['c']).units.map((u) => u.id)).toEqual(['c'])
  })
})
