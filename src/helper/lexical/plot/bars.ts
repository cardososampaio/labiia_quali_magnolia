/**
 * Horizontal bar figures as labiia_lex builds them for rankings (YAKE,
 * keyword associations, sentiment words): the first 15 items, the best at
 * the top, labels wrapped at 32 characters, ggplot hue colours, width from
 * the longest label and height from the number of bars.
 */
import { ggplotHue } from './colors'
import type { BarFigure } from '../../../renderer/models/lexical-figures'

/** Python's textwrap.fill: greedy wrapping on spaces at `width` characters. */
export function wrapText(text: string, width: number): string {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!line) line = word
    else if (line.length + 1 + word.length <= width) line += ' ' + word
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  return lines.join('\n')
}

export function rankingBars(
  items: { label: string; value: number }[],
  opts: { title: string; xlabel: string; format: (v: number) => string; limit?: number }
): BarFigure {
  const shown = items.slice(0, opts.limit ?? 15).reverse()
  const labels = shown.map((it) => wrapText(it.label, 32))
  const values = shown.map((it) => Math.max(0, it.value))
  const maxChars = Math.max(10, ...labels.map((l) => l.length))
  const n = labels.length
  const colors = ggplotHue(n)
  const maxVal = Math.max(0, ...values) || 1
  return {
    kind: 'barh',
    title: opts.title,
    xlabel: opts.xlabel,
    figW: Math.max(8, Math.min(16, 6 + maxChars * 0.12)),
    figH: Math.max(4, Math.min(10, 0.4 * n)),
    dpi: 120,
    box: { left: 0.32, right: 0.9, bottom: 0.11, top: 0.95 },
    bars: shown.map((_it, i) => ({ label: labels[i], value: values[i], color: colors[i], text: opts.format(values[i]) })),
    xmax: maxVal * 1.32,
    barHeight: 0.7
  }
}
