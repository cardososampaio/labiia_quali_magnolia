/**
 * The query a manual selection in the Query Builder describes: passages
 * coded with all ("and") or any ("or") of the chosen codes, the "All / Any
 * of the following" rule of form-based query tools, narrowed to those
 * containing the search text when one is given. With subcodes included, a
 * ticked parent stands for its whole branch (the node's "And subcodes" box),
 * so its ticked descendants are not added again.
 */
import type { CodeCondition } from '../models/types'
import type { PickedItems } from '../utils/drag-payload'

export interface ManualCodeInfo {
  guid: string
  parentGuid?: string
}

/** AND / OR nodes take at most this many inputs; longer manual selections
 *  are nested in groups of this size, which gives the same result. */
export const MAX_LOGICAL_INPUTS = 10

export function combineConditions(op: 'and' | 'or', items: CodeCondition[]): CodeCondition {
  if (items.length === 1) return items[0]
  if (items.length <= MAX_LOGICAL_INPUTS) return { type: op, conditions: items }
  const groups: CodeCondition[] = []
  for (let i = 0; i < items.length; i += MAX_LOGICAL_INPUTS) groups.push(combineConditions(op, items.slice(i, i + MAX_LOGICAL_INPUTS)))
  return combineConditions(op, groups)
}

export function manualCondition(
  picked: PickedItems,
  op: 'and' | 'or',
  searchText: string,
  includeSubcodes: boolean,
  codes: ManualCodeInfo[]
): CodeCondition | null {
  const parent = new Map(codes.map((c) => [c.guid, c.parentGuid]))
  const chosen = new Set((picked.code ?? []).map((c) => c.guid))
  const hasChosenAncestor = (guid: string): boolean => {
    for (let p = parent.get(guid); p; p = parent.get(p)) if (chosen.has(p)) return true
    return false
  }
  const items: CodeCondition[] = (picked.code ?? [])
    .filter((c) => !(includeSubcodes && hasChosenAncestor(c.guid)))
    .map((c) => ({ type: 'code', codeGuid: c.guid, includeSubcodes: includeSubcodes || undefined }) as CodeCondition)
  const text: CodeCondition | null = searchText.trim() ? ({ type: 'text', searchText: searchText.trim() } as CodeCondition) : null
  if (!items.length) return text
  const codesCond = combineConditions(op, items)
  return text ? { type: 'and', conditions: [codesCond, text] } : codesCond
}
