/**
 * Centralized registry of all analysis/query tools.
 * Icons, colors, and labels defined in one place.
 */
import {
  faMagnifyingGlass,
  faFileCodeCorner,
  faFrame,
  faFileSearchCorner,
  faSquaresIntersect,
  faChartColumn,
  faBarsStaggered,
  faFont,
  faCircleNodes,
  faNotebookTabs
} from '../components/Icon'
import type { IconComponent } from '../components/Icon'
import { t } from '../i18n'

export interface ToolDef {
  icon: IconComponent
  label: string
  color: string
  /** One-line summary shown in the toolbar Analysis popover's tile
   *  grid. Optional so existing call sites that only need icon/label/
   *  color don't have to provide one. */
  description?: string
}

/**
 * Tools spread across the warm→cool hue wheel; Framework Matrix takes the
 * otherwise-unused rose hue.
 * Order matches the toolbar layout (left to right).
 *
 * Labels are full-name versions ("Code Frequencies", "Word Frequencies"
 * — not the old "Code Freq.", "Word Freq." abbreviations). The
 * abbreviated forms only made sense in the old stacked-button toolbar
 * where horizontal space was tight; everywhere they're surfaced now
 * (Saved Analyses pane headings, the toolbar Analysis popover tiles)
 * the full name reads better.
 */
export const TOOL_REGISTRY: Record<string, ToolDef> = {
  queryBuilder:            { icon: faMagnifyingGlass,  label: t("Query Builder"),        color: '#D06828', description: t("Build a code / text query") },                              // burnt orange
  'codes-in-documents':    { icon: faFileCodeCorner,   label: t("Codes in Documents"),   color: '#C0A010', description: t("See which documents contain which codes") },                // golden
  'framework-matrix':      { icon: faFrame,            label: t("Framework Matrix"),     color: '#C8407A', description: t("Summarise each code in each document") },                   // rose
  'results-in-documents':  { icon: faFileSearchCorner, label: t("Results in Documents"), color: '#78B020', description: t("See which documents contain which query results") },        // yellow-green
  'code-cooccurrences':    { icon: faSquaresIntersect, label: t("Code Co-Occurrences"),  color: '#20A848', description: t("See which codes overlap with each other") },                // green
  'code-frequencies':      { icon: faChartColumn,      label: t("Code Frequencies"),     color: '#10A0A0', description: t("See how much of each document is covered by each code") }, // teal
  'code-orders':           { icon: faBarsStaggered,    label: t("Code Orders"),          color: '#2080D8', description: t("See the order in which codes appear in each document") },  // blue
  'word-frequencies':      { icon: faFont,             label: t("Word Frequencies"),     color: '#6848E0', description: t("See which words often appear") },                           // indigo
  'relationship-map':      { icon: faCircleNodes,      label: t("Relationships"),        color: '#A830D0', description: t("Map relationships between different things") },             // violet
  'reports':               { icon: faNotebookTabs,     label: t("Reports"),              color: '#607080', description: t("Compile results into an exportable PDF report") },          // slate
}

/** Backward-compatible color map (used by many components) */
export const toolColors: Record<string, string> = Object.fromEntries(
  Object.entries(TOOL_REGISTRY).map(([key, def]) => [key, def.color])
)

export type ToolColorKey = keyof typeof TOOL_REGISTRY
