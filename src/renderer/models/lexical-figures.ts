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

/** Word tree: words in columns left and right of the central word (matplotlib text and lines). */
export interface TreeFigure {
  kind: 'tree'
  title: string
  figW: number
  figH: number
  dpi: number
  background: string
  /** `width` in points. */
  lines: { x1: number; y1: number; x2: number; y2: number; width: number; alpha: number }[]
  /** Centred on (x, y); `size` in points. */
  labels: { text: string; x: number; y: number; size: number; bold: boolean; color: string }[]
}

/** labiia_lex's legend panel to the right of a chart (create_figure with_legend_panel). */
export interface FigureLegend {
  title: string
  entries: { code: string; label: string; color: string }[]
  fontScale?: number
  compact?: boolean
  widthScale?: number
  gap?: number
}

/**
 * Horizontal bar chart in labiia_lex's ggplot-like matplotlib theme
 * (grey #FAFAFA panel, vertical grid lines, bottom and left spines, value
 * labels to the right of the bars). Bars are listed bottom to top.
 */
export interface BarFigure {
  kind: 'barh'
  title: string
  xlabel: string
  figW: number
  figH: number
  dpi: number
  /** Axes box as figure fractions (matplotlib subplot parameters). */
  box: { left: number; right: number; bottom: number; top: number }
  bars: { label: string; value: number; color: string; text: string }[]
  /** Right end of the value axis (labiia_lex leaves 32% room for the value labels). */
  xmax: number
  barHeight: number
  /** With a legend, figW includes the panel and the chart box comes from the gridspec. */
  legend?: FigureLegend
  /** Category (bar name) labels; default 9 pt grey. */
  categoryStyle?: { size: number; bold: boolean; color: string }
}

/** Bars in a grid of panels (one per focal word), matplotlib's default style with tight_layout. */
export interface PanelBarsFigure {
  kind: 'panel-bars'
  title: string
  footnote: string
  figW: number
  figH: number
  dpi: number
  rows: number
  cols: number
  /** labiia_lex's chart theme (grey panels, grid, small grey ticks) instead of matplotlib's default look. */
  theme?: boolean
  panels: ({ title: string; color: string; xlabel: string; ylabel?: string; xmax: number; bars: { label: string; value: number; text: string }[] } | { empty: string })[]
}

/** Spokes around each focal word: closer and thicker = stronger. */
export interface RadialFigure {
  kind: 'radial'
  title: string
  footnote: string
  figW: number
  figH: number
  dpi: number
  rows: number
  cols: number
  panels: { focal: string; color: string; spokes: { label: string; x: number; y: number; alpha: number; width: number; size: number }[] }[]
}

/** Vertical bars in labiia_lex's theme (grey panel, horizontal grid, labels above the bars). */
export interface VBarFigure {
  kind: 'vbar'
  title: string
  ylabel: string
  figW: number
  figH: number
  dpi: number
  bars: { label: string; value: number; color: string; text: string }[]
  /** Top of the value axis (labiia_lex leaves 25% room for the labels). */
  ymax: number
  barWidth: number
  alpha: number
  edgeColor: string
  edgeWidth: number
}

/** LDA intertopic distance map: circles at PCoA coordinates (data units, equal aspect). */
export interface IntertopicFigure {
  kind: 'intertopic'
  title: string
  footnote: string
  figW: number
  figH: number
  dpi: number
  xlim: [number, number]
  ylim: [number, number]
  topics: { id: number; x: number; y: number; r: number; lines: string[]; proportion: number }[]
}

/** LDA document x topic heatmap (YlGnBu), with a colour bar and the legend panel. */
export interface HeatmapFigure {
  kind: 'heatmap'
  title: string
  figW: number
  figH: number
  dpi: number
  matrix: number[][]
  rowLabels: string[]
  colLabels: string[]
  vmin: number
  vmax: number
  cellFont: number
  colorbarLabel: string
  legend: FigureLegend
}

/** Strategic diagram of themes: bubbles at centrality x density ranks, quadrants split at the mean ranks. */
export interface StrategicFigure {
  kind: 'strategic'
  title: string
  xlabel: string
  ylabel: string
  figW: number
  figH: number
  dpi: number
  xlim: [number, number]
  ylim: [number, number]
  meanX: number
  meanY: number
  /** size: marker area in points squared, as matplotlib's scatter. */
  bubbles: { x: number; y: number; size: number; color: string; lines: string[] }[]
  corners: { topRight: string; topLeft: string; bottomRight: string; bottomLeft: string }
}

/** CHD dendrogram with each class's share and most specific words (labiia_lex's readable dendrogram). */
export interface ChdDendrogramFigure {
  kind: 'chd-dendrogram'
  title: string
  figW: number
  figH: number
  dpi: number
  /** Leaves left to right, x = 1..n. */
  classes: { id: number; x: number; color: string; percent: number; words: string[] }[]
  /** Tree segments in data units (x: class positions, y: 0..1). */
  lines: [number, number, number, number][]
  rectW: number
}

export type LexicalFigure = NetworkFigure | TreeFigure | BarFigure | PanelBarsFigure | RadialFigure | VBarFigure | IntertopicFigure | HeatmapFigure | StrategicFigure | ChdDendrogramFigure
