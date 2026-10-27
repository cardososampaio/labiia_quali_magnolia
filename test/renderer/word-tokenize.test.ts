import { describe, it, expect } from 'vitest'
import { tokenizeWords, DEFAULT_STOP_WORDS } from '../../src/renderer/components/Analysis/analysis-helpers'

// Word Frequencies must count Portuguese words whole, accents included, and
// leave common Portuguese and English function words out by default.
describe('tokenizeWords', () => {
  it('keeps words that start or end with an accented letter', () => {
    expect(tokenizeWords('Não é café, é ação.')).toEqual(['não', 'café', 'ação'])
  })

  it('keeps accented letters in the middle of a word', () => {
    expect(tokenizeWords('O coração da questão')).toEqual(['coração', 'da', 'questão'])
  })

  it('keeps hyphenated and apostrophe words together', () => {
    expect(tokenizeWords("pré-escola, copo d'água, don't")).toEqual(['pré-escola', 'copo', "d'água", "don't"])
  })

  it('drops single letters and lower-cases', () => {
    expect(tokenizeWords('A Educação E o Brasil')).toEqual(['educação', 'brasil'])
  })
})

describe('DEFAULT_STOP_WORDS', () => {
  it('covers Portuguese and English function words', () => {
    for (const w of ['de', 'que', 'não', 'você', 'nao', 'né', 'estão', 'the', 'and']) {
      expect(DEFAULT_STOP_WORDS.has(w)).toBe(true)
    }
  })

  it('does not exclude content words', () => {
    for (const w of ['educação', 'escola', 'pesquisa', 'política']) {
      expect(DEFAULT_STOP_WORDS.has(w)).toBe(false)
    }
  })
})
