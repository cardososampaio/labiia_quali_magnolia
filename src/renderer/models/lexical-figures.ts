/**
 * Figures the lexical tests describe as data and the window draws (instead
 * of images made by R), so they can be redrawn sharply at any size and
 * exported as PNG or SVG. Coordinates follow matplotlib, which labiia_lex
 * uses for these charts: data units for positions, points for sizes.
 */
export interface NetworkFigure {
  kind: 'network'
  title: string
  /** Figure size in inches; drawn at `dpi` pixels per inch, like labiia_lex's PNG. */
  figW: number
  figH: number
  dpi: number
  /** `area` is the marker area in points squared (matplotlib scatter `s`); `font` null = no label. */
  nodes: { label: string; x: number; y: number; area: number; color: string; font: number | null }[]
  /** `width` in points. */
  edges: { x1: number; y1: number; x2: number; y2: number; width: number }[]
  edgeColor: string
  edgeAlpha: number
  nodeAlpha: number
  labelColor: string
  /** Share of the data range added around it (matplotlib ax.margins). */
  margins: number
}

export type LexicalFigure = NetworkFigure
