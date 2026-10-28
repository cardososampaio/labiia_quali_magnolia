/**
 * Files of saved lexical analyses (images, tables) inside the project file.
 *
 * In memory a saved lexical analysis carries its result files as base64
 * (config.result.files[].data). In the .qdpx each file is stored as its own
 * entry, labiia-lexical/<analysis guid>/<file name>, and the analyses JSON
 * keeps only a reference, so the JSON stays small and a reopened project
 * shows its results without running the tests again.
 */
import type JSZip from 'jszip'

export const LEXICAL_RESULTS_FOLDER = 'labiia-lexical'

interface FileRef { name: string; data?: string; path?: string; [k: string]: unknown }
interface AnalysisLike { guid: string; toolType: string; config?: { result?: { files?: FileRef[] } & Record<string, unknown> } & Record<string, unknown> }

const isLexical = (a: AnalysisLike): boolean => typeof a?.toolType === 'string' && a.toolType.startsWith('lexical-')

/** File names come from the tests; anything outside a plain name is refused. */
function safeName(name: string): string | null {
  return /^[\w.-]{1,120}$/.test(name) && !name.startsWith('.') ? name : null
}

/** Copies the analyses for writing: result files go into the zip, the JSON keeps their paths. */
export function packLexicalResults<T extends AnalysisLike>(analyses: T[], zip: JSZip): T[] {
  return analyses.map((a) => {
    const files = a.config?.result?.files
    if (!isLexical(a) || !Array.isArray(files) || !/^[\w-]+$/.test(a.guid)) return a
    const packed = files.flatMap((f) => {
      const name = safeName(String(f.name))
      if (!name || typeof f.data !== 'string') return []
      const path = `${LEXICAL_RESULTS_FOLDER}/${a.guid}/${name}`
      zip.file(path, f.data, { base64: true })
      const { data: _data, ...rest } = f
      return [{ ...rest, name, path }]
    })
    return { ...a, config: { ...a.config, result: { ...a.config!.result, files: packed } } }
  })
}

/** Reads result files back from the zip into the analyses (in place). */
export async function unpackLexicalResults(analyses: AnalysisLike[], zip: JSZip): Promise<void> {
  for (const a of analyses) {
    const files = a.config?.result?.files
    if (!isLexical(a) || !Array.isArray(files)) continue
    for (const f of files) {
      if (typeof f.path !== 'string' || !f.path.startsWith(`${LEXICAL_RESULTS_FOLDER}/`)) continue
      const entry = zip.file(f.path)
      if (entry) f.data = await entry.async('base64')
    }
  }
}
