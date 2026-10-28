import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { packLexicalResults, unpackLexicalResults } from '../../src/main/qdpx/lexical-results'

// A saved lexical analysis must reopen with its images and tables: they are
// stored as their own entries in the project file, and only a reference
// stays in the analyses list.

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString('base64')
const analyses = [
  {
    guid: 'ABC-1', toolType: 'lexical-wordcloud', name: 'Nuvem',
    config: { params: { max_words: 100 }, result: { summary: { words: 3 }, files: [
      { name: 'wordcloud.png', mime: 'image/png', role: 'image', data: png },
      { name: '../fora.txt', mime: 'text/plain', role: 'data', data: 'eA==' }
    ] } }
  },
  { guid: 'XYZ', toolType: 'word-frequencies', name: 'Frequências', config: { wordCount: 30 } }
]

describe('lexical results in the project file', () => {
  it('stores result files as entries and keeps only references in the JSON', async () => {
    const zip = new JSZip()
    const packed = packLexicalResults(analyses as never[], zip) as typeof analyses
    const files = packed[0].config.result!.files
    expect(files).toHaveLength(1) // the unsafe name is refused
    expect(files[0]).toMatchObject({ name: 'wordcloud.png', path: 'labiia-lexical/ABC-1/wordcloud.png' })
    expect('data' in files[0]).toBe(false)
    expect(packed[1]).toBe(analyses[1])
    expect(analyses[0].config.result!.files[0].data).toBe(png) // the in-memory copy is untouched

    const reread = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }))
    expect(await reread.file('labiia-lexical/ABC-1/wordcloud.png')!.async('base64')).toBe(png)

    const back = JSON.parse(JSON.stringify(packed))
    await unpackLexicalResults(back, reread)
    expect(back[0].config.result.files[0].data).toBe(png)
    expect(back[0].config.result.summary).toEqual({ words: 3 })
  })
})
