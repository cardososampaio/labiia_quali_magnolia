/**
 * Text units — what the lexical analyses read.
 *
 * A unit is one piece of running text with an id and a name: one document
 * (an IRaMuTeQ "text", UCI), or one code with all its passages when the
 * analyses run over codes. Corpus preparation and the tests only ever see units.
 */
import type { AnalysisInitData } from '../../models/types'
import { stripFormatting } from '../../utils/strip-formatting'
import { sourceTypeFromFilename } from '../../utils/format-registry'

export type LexicalSource = 'documents' | 'codes'

export interface TextUnit {
  /** Document guid (or, for codes, the passage id). */
  id: string
  name: string
  /** The document a coded passage comes from (absent for whole documents, whose name is the document). */
  document?: string
  text: string
  /**
   * For a code, its passages one by one (text is them joined by line
   * breaks). Each passage is cut into segments on its own, so a segment or
   * an n-gram never joins the end of one passage to the start of the next,
   * which may come from another document.
   */
  parts?: string[]
  /** 'code' when the unit gathers the passages of one code. */
  kind?: 'code'
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
    variables.push(`*${variablePart(cat?.name ?? 'caracteristica')}_${variablePart(value)}`)
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

export interface CodeUnitsResult extends UnitsResult {
  /** Coded passages left out because they hold no text (image or PDF areas). */
  passagesWithoutText: number
  /** Passages with text gathered into each chosen code's text, by code guid. */
  passageCounts: Record<string, number>
  /** Chosen codes left out because none of their passages in the chosen documents holds text. */
  codesWithoutText: string[]
}

/** The chosen codes, plus all their subcodes when `includeSubcodes`. */
export function expandCodes(data: AnalysisInitData, codeGuids: string[], includeSubcodes: boolean): Set<string> {
  const chosen = new Set(codeGuids)
  if (!includeSubcodes) return chosen
  const children = new Map<string, string[]>()
  for (const c of data.codes ?? []) if (c.parentGuid) children.set(c.parentGuid, [...(children.get(c.parentGuid) ?? []), c.guid])
  const stack = [...chosen]
  while (stack.length) for (const k of children.get(stack.pop()!) ?? []) if (!chosen.has(k)) { chosen.add(k); stack.push(k) }
  return chosen
}

/**
 * Codes as text units (the "Codes" source): each chosen code becomes one
 * text gathering all its passages in the chosen documents, so the analyses
 * that compare texts (LDA topics, Thematic map documents, CHD variables)
 * compare codes. With `includeSubcodes`, a code's text also holds its
 * subcodes' passages. A passage coded with two chosen codes goes into both
 * texts, so each code is complete; within one code the same span counts
 * once, even when coded twice or by both a parent and its child. The text
 * carries only *codigo_name: it mixes documents, so it has no document
 * variables and no date.
 */
export function codeUnits(data: AnalysisInitData, sourceGuids: string[], codeGuids: string[], includeSubcodes: boolean): CodeUnitsResult {
  const wanted = new Set(sourceGuids)
  const codeByGuid = new Map((data.codes ?? []).map((c) => [c.guid, c]))
  const units: TextUnit[] = []
  const passageCounts: Record<string, number> = {}
  const codesWithoutText: string[] = []
  // A passage without text counts once, however many chosen codes hold it.
  const textless = new Set<string>()
  for (const codeGuid of [...new Set(codeGuids)]) {
    const code = codeByGuid.get(codeGuid)
    if (!code) continue
    const members = expandCodes(data, [codeGuid], includeSubcodes)
    const parts: string[] = []
    for (const src of data.sources) {
      if (!wanted.has(src.guid)) continue
      const coded = (data.sourceSelections?.[src.guid] ?? [])
        .filter((sel) => sel.codings.some((c) => members.has(c.codeGuid)))
        .sort((a, b) => a.startPosition - b.startPosition || a.endPosition - b.endPosition)
      if (coded.length === 0) continue
      const raw = data.sourceContents[src.guid] ?? ''
      const st = sourceTypeFromFilename(src.name)
      const cells = data.surveyCodableCells?.[src.guid] ?? []
      const seen = new Set<string>()
      for (const sel of coded) {
        const key = `${src.guid}|${sel.surveyCell?.respondentId ?? ''}|${sel.surveyCell?.questionId ?? ''}|${sel.startPosition}|${sel.endPosition}`
        if (seen.has(key)) continue
        seen.add(key)
        let text = ''
        if (src.sourceType === 'image') text = ''
        else if (sel.surveyCell) {
          const cell = cells.find((c) => c.respondentId === sel.surveyCell!.respondentId && c.questionId === sel.surveyCell!.questionId)
          text = cell ? cell.text.slice(sel.startPosition, sel.endPosition) : ''
        } else {
          text = raw.slice(sel.startPosition, sel.endPosition)
          if (text && st !== 'text') text = stripFormatting(text, st)
        }
        if (text.trim()) parts.push(text)
        else textless.add(key)
      }
    }
    passageCounts[codeGuid] = parts.length
    if (parts.length === 0) { codesWithoutText.push(code.name); continue }
    units.push({
      id: `code:${codeGuid}`,
      name: code.name,
      kind: 'code',
      text: parts.join('\n'),
      parts,
      variables: [`*codigo_${variablePart(code.name)}`]
    })
  }
  return { units, skipped: [], passagesWithoutText: textless.size, passageCounts, codesWithoutText }
}
