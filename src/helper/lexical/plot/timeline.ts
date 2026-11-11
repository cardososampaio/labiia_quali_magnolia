/**
 * Timelines of labiia_lex (sentiment_extra._plot_timeline and
 * lda_analysis._write_timeline), computed from the documents' dates.
 * A document's date comes from a tag of a date category ("YYYY",
 * "YYYY-MM" or "YYYY-MM-DD"); documents without a date stay out.
 */
import type { TimelineFigure } from '../../../renderer/models/lexical-figures'
import { ggplotHue } from './colors'

/** Days since 1970-01-01; a year or a month is placed on its first day. */
export function dateDays(date: string): number {
  const [y, m = '1', d = '1'] = date.split('-')
  return Math.round(Date.UTC(Number(y), Number(m) - 1, Number(d)) / 86_400_000)
}

/** Date in the Brazilian order: 15/03/2024, 03/2024 or 2024. */
export function dateLabel(date: string): string {
  return date.split('-').reverse().join('/')
}

const SENTIMENTS = ['Positivo', 'Negativa', 'Neutro'] as const
const SENTIMENT_COLORS = { Positivo: '#00BA38', Negativa: '#F8766D', Neutro: '#6B7280' }

/**
 * Share of each polarity among the matched words of the documents of each
 * date (labiia_lex's "Sentimentos ao Longo do Tempo"). Null without dates.
 */
export function sentimentTimeline(
  perUnit: Record<(typeof SENTIMENTS)[number], number>[],
  dates: (string | undefined)[]
): { figure: TimelineFigure; rows: [string, string, number, number][] } | null {
  const byDate = new Map<string, Record<string, number>>()
  perUnit.forEach((c, u) => {
    const d = dates[u]
    if (!d) return
    const acc = byDate.get(d) ?? { Positivo: 0, Negativa: 0, Neutro: 0 }
    for (const s of SENTIMENTS) acc[s] += c[s]
    byDate.set(d, acc)
  })
  if (byDate.size === 0) return null
  const days = [...byDate.keys()].sort((a, b) => dateDays(a) - dateDays(b) || (a < b ? -1 : 1))
  const pct = (d: string, s: string): number => {
    const c = byDate.get(d)!
    const total = c.Positivo + c.Negativa + c.Neutro || 1
    return (c[s] / total) * 100
  }
  const rows: [string, string, number, number][] = days.flatMap((d) => SENTIMENTS.map((s) => [d, s, byDate.get(d)![s], pct(d, s)] as [string, string, number, number]))
  return {
    rows,
    figure: {
      kind: 'timeline',
      title: 'Sentimentos ao Longo do Tempo',
      ylabel: 'Porcentagem por data',
      // create_figure(max(8.5, 1100/125), max(5, 700/130)), saved at 160 dpi; autofmt_xdate leaves 20% below.
      figW: Math.max(8.5, 1100 / 125),
      figH: Math.max(5, 700 / 130),
      dpi: 160,
      box: [0.125, 0.9, 0.2, 0.88],
      dates: days.map((d) => ({ x: dateDays(d), label: dateLabel(d) })),
      series: SENTIMENTS.map((s) => ({ label: s, color: SENTIMENT_COLORS[s], values: days.map((d) => pct(d, s)) })),
      lineWidth: 1.7,
      markerSize: 3.8,
      ylim: [0, 100],
      rotation: 30,
      legendFontSize: 8
    }
  }
}

/** Mean P(topic | document) of the documents of each date (labiia_lex's "Evolução Média dos Tópicos no Tempo"). */
export function ldaTimeline(gamma: number[][], dates: (string | undefined)[]): { figure: TimelineFigure; rows: (string | number)[][] } | null {
  const k = gamma[0]?.length ?? 0
  const sums = new Map<string, number[]>()
  const counts = new Map<string, number>()
  gamma.forEach((row, d) => {
    const date = dates[d]
    if (!date) return
    const acc = sums.get(date) ?? new Array(k).fill(0)
    row.forEach((v, t) => { acc[t] += v })
    sums.set(date, acc)
    counts.set(date, (counts.get(date) ?? 0) + 1)
  })
  if (sums.size === 0 || k === 0) return null
  const days = [...sums.keys()].sort((a, b) => dateDays(a) - dateDays(b) || (a < b ? -1 : 1))
  const mean = (date: string): number[] => sums.get(date)!.map((v) => v / counts.get(date)!)
  const colors = ggplotHue(k)
  return {
    rows: days.map((d) => [d, counts.get(d)!, ...mean(d)]),
    figure: {
      kind: 'timeline',
      title: 'Evolução Média dos Tópicos no Tempo',
      xlabel: 'Data',
      ylabel: 'Probabilidade Média P(T|D)',
      figW: 10,
      figH: 6,
      dpi: 120,
      box: [0.125, 0.9, 0.18, 0.93],
      dates: days.map((d) => ({ x: dateDays(d), label: dateLabel(d) })),
      series: Array.from({ length: k }, (_v, t) => ({ label: `T${t + 1}`, color: colors[t], values: days.map((d) => mean(d)[t]) })),
      lineWidth: 1.5,
      markerSize: 4,
      rotation: 45,
      legendFontSize: 9
    }
  }
}
