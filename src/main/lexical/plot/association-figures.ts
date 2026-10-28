/**
 * The two keyword-association figures of labiia_lex: bars of collocates per
 * focal word, and spokes around each focal word (closer and thicker =
 * stronger association; larger label = more segments in common).
 */
import { ggplotHue } from './colors'
import type { Collocate } from '../analyses/keyword-associations'
import type { PanelBarsFigure, RadialFigure } from '../../../renderer/models/lexical-figures'

const grid = (n: number): [number, number] => {
  const cols = n === 1 ? 1 : n <= 4 ? 2 : 3
  return [Math.ceil(n / cols), cols]
}

export function associationBars(focalTerms: string[], collocates: Map<string, Collocate[]>): PanelBarsFigure {
  const [rows, cols] = grid(focalTerms.length)
  const colors = ggplotHue(focalTerms.length)
  return {
    kind: 'panel-bars',
    title: 'Associações de palavras-chave',
    footnote: 'n× = segmentos em que termo focal e colocado aparecem juntos',
    figW: 6.2 * cols,
    figH: 4.6 * rows,
    dpi: 120,
    rows,
    cols,
    panels: focalTerms.map((focal, i) => {
      const items = collocates.get(focal) ?? []
      if (items.length === 0) return { empty: `Sem colocados para «${focal}»\ncom os limites atuais` }
      const shown = [...items].reverse()
      return {
        title: `«${focal}»  (${items[0].focalSegments} segmentos)`,
        color: colors[i],
        xlabel: 'força da associação (log-likelihood)',
        xmax: Math.max(...items.map((c) => c.logLikelihood)) * 1.18,
        bars: shown.map((c) => ({ label: c.term, value: c.logLikelihood, text: `  ${c.joint}×` }))
      }
    })
  }
}

export function associationRadial(focalTerms: string[], collocates: Map<string, Collocate[]>): RadialFigure {
  const [rows, cols] = grid(focalTerms.length)
  const colors = ggplotHue(focalTerms.length)
  return {
    kind: 'radial',
    title: 'Colocados por termo focal',
    footnote: 'Mais perto e linha mais grossa = associação mais forte; rótulo maior = mais segmentos em comum',
    figW: 7 * cols,
    figH: 6.6 * rows,
    dpi: 120,
    rows,
    cols,
    panels: focalTerms.map((focal, i) => {
      const items = collocates.get(focal) ?? []
      const gMax = Math.max(0, ...items.map((c) => c.logLikelihood)) || 1
      const jMax = Math.max(0, ...items.map((c) => c.joint)) || 1
      const n = items.length
      return {
        focal,
        color: colors[i],
        spokes: items.map((item, rank) => {
          const strength = item.logLikelihood / gMax
          const angle = (2 * Math.PI * rank) / n + Math.PI / 2
          const dist = 0.55 + 0.55 * (1 - strength) + (rank % 2 ? 0.12 : 0)
          return {
            label: item.term,
            x: dist * Math.cos(angle),
            y: dist * Math.sin(angle),
            alpha: 0.25 + 0.6 * strength,
            width: 0.8 + 4 * strength,
            size: 10 + (7 * item.joint) / jMax
          }
        })
      }
    })
  }
}
