/**
 * Text units — what the lexical analyses read.
 *
 * A unit is one piece of running text with an id and a name: today, one
 * document (an IRaMuTeQ "text", UCI); later, one coded passage, when the
 * analyses run over codes. Corpus preparation only ever sees units, so
 * adding the codes source means adding a second builder here, not changing
 * the preparation or the engines.
 */
import type { AnalysisInitData } from '../../models/types'
import { stripFormatting } from '../../utils/strip-formatting'
import { sourceTypeFromFilename } from '../../utils/format-registry'

export type LexicalSource = 'documents' | 'codes'

export interface TextUnit {
  /** Document guid (or, for codes, the passage id). */
  id: string
  name: string
  text: string
}

export interface UnitsResult {
  units: TextUnit[]
  /** Chosen documents left out because they hold no text (images, empty files). */
  skipped: { id: string; name: string }[]
}

/**
 * The plain text of each chosen document, in project order: formatting
 * syntax removed, and for surveys only the open-ended answers (the raw CSV
 * holds headers and closed answers, which are not running text).
 */
export function documentUnits(data: AnalysisInitData, sourceGuids: string[]): UnitsResult {
  const wanted = new Set(sourceGuids)
  const units: TextUnit[] = []
  const skipped: UnitsResult['skipped'] = []
  for (const src of data.sources) {
    if (!wanted.has(src.guid)) continue
    let text = ''
    if (src.sourceType === 'survey') {
      text = (data.surveyCodableCells?.[src.guid] ?? []).map((c) => c.text).join('\n')
    } else if (src.sourceType !== 'image') {
      text = data.sourceContents[src.guid] ?? ''
      const st = sourceTypeFromFilename(src.name)
      if (text && st !== 'text') text = stripFormatting(text, st)
    }
    if (text.trim()) units.push({ id: src.guid, name: src.name, text })
    else skipped.push({ id: src.guid, name: src.name })
  }
  return { units, skipped }
}
