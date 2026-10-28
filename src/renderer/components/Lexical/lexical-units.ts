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
  /**
   * The document's variables in IRaMuTeQ's form (*variable_value): one per
   * tag on the document (tag category, or "etiqueta" without category, and
   * the tag's value) and one for its folder (*pasta_name).
   */
  variables: string[]
  /** Date from a tag of a date category: "YYYY", "YYYY-MM" or "YYYY-MM-DD". */
  date?: string
}

/** IRaMuTeQ variable part: no accents, spaces or punctuation (they would break *variable_value). */
export function variablePart(text: string): string {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '').toLowerCase() || 'x'
}

/**
 * Reads the date of a date tag as people type it (dd/mm/yyyy, mm/yyyy,
 * yyyy, or yyyy-mm-dd): returns "YYYY-MM-DD", "YYYY-MM" or "YYYY", or
 * undefined when it is not a valid date.
 */
export function parseTagDate(raw: string): string | undefined {
  const v = raw.trim()
  const pad = (n: string): string => n.padStart(2, '0')
  const ok = (y: number, m?: number, d?: number): boolean => {
    if (y < 1000 || y > 9999) return false
    if (m !== undefined && (m < 1 || m > 12)) return false
    if (d !== undefined && (d < 1 || d > new Date(Date.UTC(y, m!, 0)).getUTCDate())) return false
    return true
  }
  let m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m && ok(+m[3], +m[2], +m[1])) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`
  m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m && ok(+m[1], +m[2], +m[3])) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  m = v.match(/^(\d{1,2})[/.-](\d{4})$/)
  if (m && ok(+m[2], +m[1])) return `${m[2]}-${pad(m[1])}`
  m = v.match(/^(\d{4})-(\d{1,2})$/)
  if (m && ok(+m[1], +m[2])) return `${m[1]}-${pad(m[2])}`
  m = v.match(/^(\d{4})$/)
  if (m && ok(+m[1])) return m[1]
  return undefined
}

/** Variables and date of one document, from its tags and folder. */
export function documentVariables(data: AnalysisInitData, sourceGuid: string): { variables: string[]; date?: string } {
  const variables: string[] = []
  let date: string | undefined
  // Projects without tags or folders simply give no variables.
  const catOf = new Map((data.categories ?? []).map((c) => [c.guid, c]))
  for (const tag of data.tags ?? []) {
    if (!(data.tagMembers?.[tag.guid] ?? []).includes(sourceGuid)) continue
    const cat = tag.categoryGuid ? catOf.get(tag.categoryGuid) : undefined
    const value = (tag.value || tag.name || '').trim()
    if (!value) continue
    variables.push(`*${variablePart(cat?.name ?? 'etiqueta')}_${variablePart(value)}`)
    if (cat?.type === 'date' && date === undefined) date = parseTagDate(value)
  }
  const folderGuid = data.sourceFolder?.[sourceGuid]
  const folder = folderGuid ? (data.folders ?? []).find((f) => f.guid === folderGuid) : undefined
  if (folder) variables.push(`*pasta_${variablePart(folder.name)}`)
  return { variables: [...new Set(variables)].sort(), date }
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
    if (text.trim()) units.push({ id: src.guid, name: src.name, text, ...documentVariables(data, src.guid) })
    else skipped.push({ id: src.guid, name: src.name })
  }
  return { units, skipped }
}
