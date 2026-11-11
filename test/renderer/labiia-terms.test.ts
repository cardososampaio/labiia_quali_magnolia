import { describe, it, expect } from 'vitest'
import en from '../../src/renderer/locales/en.json'
import ptBR from '../../src/renderer/locales/pt-BR.json'
import enTerms from '../../src/renderer/locales/labiia/en.json'
import ptBRTerms from '../../src/renderer/locales/labiia/pt-BR.json'

// labiia_quali's words replace Magnolia's sentences one for one: each must
// still exist in Magnolia's catalogue and keep its {{placeholders}}, or a
// new Magnolia release has changed the sentence and it must be redone.
type Tree = { [k: string]: string | Tree }
const flat = (t: Tree, pre = ''): [string, string][] =>
  Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [[pre + k, v] as [string, string]] : flat(v, `${pre}${k}.`)))
const placeholders = (s: string): string[] => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()

for (const [name, terms, base] of [['en', enTerms, en], ['pt-BR', ptBRTerms, ptBR]] as const) {
  describe(`labiia_quali terms (${name})`, () => {
    const baseFlat = new Map(flat(base as Tree))
    it('replace sentences Magnolia still has, with the same placeholders', () => {
      for (const [key, text] of flat(terms as Tree)) {
        const original = baseFlat.get(key)
        expect(original, `${key} is not in Magnolia's ${name} catalogue`).toBeTypeOf('string')
        expect(placeholders(text), key).toEqual(placeholders(original!))
      }
    })
    it('call tags and tag categories characteristics and attributes', () => {
      const texts = flat(terms as Tree).map(([, t]) => t).join('\n')
      if (name === 'pt-BR') expect(texts).not.toMatch(/etiqueta/i)
      else expect(texts).not.toMatch(/\btags?\b/i)
    })
  })
}
