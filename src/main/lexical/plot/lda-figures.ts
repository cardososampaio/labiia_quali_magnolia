/**
 * The LDA figures of labiia_lex: topic distribution (bars with the legend
 * panel) and top terms per topic (one themed panel per topic).
 */
import { ggplotHue } from './colors'
import type { LdaModel } from '../analyses/lda'
import type { BarFigure, PanelBarsFigure } from '../../../renderer/models/lexical-figures'

export function meanTopicProbabilities(m: LdaModel): number[] {
  const means = new Array(m.k).fill(0)
  for (const row of m.gamma) row.forEach((v, t) => { means[t] += v })
  return means.map((v) => Math.max(0, Math.min(1, m.gamma.length ? v / m.gamma.length : 0)))
}

export function ldaDistribution(m: LdaModel): BarFigure {
  const means = meanTopicProbabilities(m)
  const total = means.reduce((a, b) => a + b, 0) || 1
  const colors = ggplotHue(m.k)
  const legend = { title: 'Tópicos', entries: means.map((_v, i) => ({ code: `T${i + 1}`, label: m.labels[i] ?? `T${i + 1}`, color: colors[i] })) }
  const maxLen = Math.max(10, ...legend.entries.map((e) => e.label.length))
  const legendIn = Math.max(3, Math.min(6, maxLen * 0.115))
  // T1 at the top (labiia_lex inverts the axis): bars are listed bottom to top.
  const order = means.map((_v, i) => i).reverse()
  return {
    kind: 'barh',
    title: 'Distribuição de Tópicos',
    xlabel: 'Probabilidade Média P(Tópico | Documento)',
    figW: 8 + legendIn,
    figH: Math.max(4, Math.min(10, 0.55 * m.k + 1.5)),
    dpi: 120,
    box: { left: 0.07, right: 0.98, bottom: 0.12, top: 0.96 },
    bars: order.map((i) => ({ label: `T${i + 1}`, value: means[i], color: colors[i], text: `${means[i].toFixed(3)} (${((means[i] / total) * 100).toFixed(1)}%)` })),
    xmax: Math.max(...means, 1e-9) * 1.32,
    barHeight: 0.6,
    legend,
    // labiia_lex sets 12 pt dark labels, but style_axes runs after and resets them to 9 pt grey (bold stays).
    categoryStyle: { size: 9, bold: true, color: '#666666' }
  }
}

export function ldaTopTerms(m: LdaModel, topN = 10): PanelBarsFigure {
  const cols = Math.min(3, m.k)
  const rows = Math.ceil(m.k / cols)
  const colors = ggplotHue(m.k)
  return {
    kind: 'panel-bars',
    title: 'Top Termos por Tópico',
    footnote: '',
    figW: 4.4 * cols,
    figH: 3.2 * rows,
    dpi: 120,
    rows,
    cols,
    theme: true,
    panels: m.topicTerms.map((terms, i) => {
      const top = terms.slice(0, topN)
      if (top.length === 0) return { empty: 'Sem termos' }
      return {
        title: `T${i + 1}`,
        color: colors[i],
        xlabel: 'beta',
        ylabel: i % cols === 0 ? 'Termos' : undefined,
        // Bars start at 0; matplotlib adds its 5% margin on the far side.
        xmax: Math.max(...top.map((t) => t.weight)) * 1.05,
        bars: [...top].reverse().map((t) => ({ label: t.term, value: t.weight, text: '' }))
      }
    })
  }
}
