/**
 * Intertopic distance map (labiia_lex's lda_intertopic, after LDAvis by
 * Sievert and Shirley, 2014): Jensen-Shannon distance between the topics'
 * word distributions, projected to 2D by classical multidimensional scaling
 * (PCoA); circle area = share of the corpus tokens in the topic.
 */
import type { LdaModel } from '../analyses/lda'
import type { IntertopicFigure } from '../../../renderer/models/lexical-figures'

const EPS = 1e-12

/** Topic x term probabilities over `vocabulary`, rows summing to 1. */
export function topicTermMatrix(m: LdaModel, vocabulary: string[]): number[][] {
  const index = new Map(vocabulary.map((t, i) => [t, i]))
  return m.topicTerms.map((terms) => {
    const row = new Array(vocabulary.length).fill(0)
    for (const { term, weight } of terms) {
      const i = index.get(term)
      if (i !== undefined) row[i] = Math.max(0, weight)
    }
    const sum = row.reduce((a, b) => a + b, 0)
    return sum > 0 ? row.map((v) => v / sum) : row.map(() => 1 / Math.max(1, row.length))
  })
}

export function jensenShannon(phi: number[][]): number[][] {
  const k = phi.length
  const d = Array.from({ length: k }, () => new Array(k).fill(0))
  const safe = phi.map((row) => row.map((v) => Math.max(v, EPS)))
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      let a = 0, b = 0
      for (let t = 0; t < safe[i].length; t++) {
        const m = 0.5 * (safe[i][t] + safe[j][t])
        a += safe[i][t] * Math.log(safe[i][t] / m)
        b += safe[j][t] * Math.log(safe[j][t] / m)
      }
      d[i][j] = d[j][i] = Math.max(0, 0.5 * a + 0.5 * b)
    }
  }
  return d
}

/** Eigenvalues and eigenvectors (columns) of a symmetric matrix, by Jacobi rotations. */
export function symmetricEigen(input: number[][]): { values: number[]; vectors: number[][] } {
  const n = input.length
  const a = input.map((r) => [...r])
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2
    if (off < 1e-22) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1), s = t * c
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q]
          a[k][p] = c * akp - s * akq
          a[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k]
          a[p][k] = c * apk - s * aqk
          a[q][k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q]
          v[k][p] = c * vkp - s * vkq
          v[k][q] = s * vkp + c * vkq
        }
      }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: v }
}

/** Classical MDS to 2D; each axis oriented so its largest coordinate is positive (as labiia_lex). */
export function classicalMds(dist: number[][]): [number, number][] {
  const k = dist.length
  if (k === 1) return [[0, 0]]
  if (k === 2) { const h = dist[0][1] / 2; return [[-h, 0], [h, 0]] }
  const sq = dist.map((r) => r.map((v) => v * v))
  const rowMean = sq.map((r) => r.reduce((a, b) => a + b, 0) / k)
  const all = rowMean.reduce((a, b) => a + b, 0) / k
  const b = sq.map((r, i) => r.map((v, j) => -0.5 * (v - rowMean[i] - rowMean[j] + all)))
  const { values, vectors } = symmetricEigen(b)
  const order = values.map((_v, i) => i).sort((x, y) => values[y] - values[x]).slice(0, 2)
  const coords: [number, number][] = Array.from({ length: k }, () => [0, 0])
  order.forEach((col, axis) => {
    const scale = Math.sqrt(Math.max(values[col], 0))
    for (let i = 0; i < k; i++) coords[i][axis] = vectors[i][col] * scale
    let pivot = 0
    for (let i = 1; i < k; i++) if (Math.abs(coords[i][axis]) > Math.abs(coords[pivot][axis])) pivot = i
    if (coords[pivot][axis] < 0) for (let i = 0; i < k; i++) coords[i][axis] *= -1
  })
  return coords
}

export function intertopicFigure(m: LdaModel, vocabulary: string[], docLengths: number[]): IntertopicFigure {
  const phi = topicTermMatrix(m, vocabulary)
  const coords = classicalMds(jensenShannon(phi))
  const freq = new Array(m.k).fill(0)
  m.gamma.forEach((row, d) => row.forEach((g, t) => { freq[t] += g * (docLengths[d] ?? 0) }))
  const clipped = freq.map((f) => Math.max(f, EPS))
  const total = clipped.reduce((a, b) => a + b, 0)
  const props = clipped.map((f) => f / total)
  const xs = coords.map((c) => c[0]), ys = coords.map((c) => c[1])
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1e-6)
  const maxProp = Math.max(...props, EPS)
  const radii = props.map((p) => (Math.sqrt(p / maxProp) * span) / 6)
  const pad = Math.max(...radii) * 1.15 + span * 0.05
  return {
    kind: 'intertopic',
    title: 'Mapa de distância entre tópicos',
    footnote: 'Distância de Jensen-Shannon entre tópicos projetada em 2D (PCoA). Área do círculo = proporção dos tokens.',
    figW: 9,
    figH: 8,
    // The figure asks for 150 dpi, but the theme saves at 120 dpi.
    dpi: 120,
    xlim: [Math.min(...xs) - pad, Math.max(...xs) + pad],
    ylim: [Math.min(...ys) - pad, Math.max(...ys) + pad],
    topics: coords.map((c, i) => ({ id: i + 1, x: c[0], y: c[1], r: radii[i], lines: (m.labels[i] ?? '').split(' / ').slice(0, 3), proportion: props[i] }))
  }
}
