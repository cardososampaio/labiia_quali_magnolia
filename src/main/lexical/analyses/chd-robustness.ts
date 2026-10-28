/**
 * CHD robustness check (labiia_lex's chd_robustness): the classification is
 * repeated with reasonable alternative settings (number of classes and
 * minimum frequency) and each solution is compared with the main one by the
 * adjusted Rand index (ARI; Hubert & Arabie, 1985). ARI is 1 for identical
 * classifications and near 0 when the agreement is what chance would give.
 * Unclassified segments count as a group of their own.
 */

export type RobustnessSpec = { classes: number; minFreq: number }

const MAX_CLASSES = 20
const comb2 = (n: number): number => (n * (n - 1)) / 2

export function adjustedRandIndex(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('The two classifications must cover the same segments.')
  const n = a.length
  if (n < 2) return 1
  const pairs = new Map<string, number>()
  const countA = new Map<number, number>()
  const countB = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    const key = `${a[i]}|${b[i]}`
    pairs.set(key, (pairs.get(key) ?? 0) + 1)
    countA.set(a[i], (countA.get(a[i]) ?? 0) + 1)
    countB.set(b[i], (countB.get(b[i]) ?? 0) + 1)
  }
  let index = 0
  for (const v of pairs.values()) index += comb2(v)
  let sumA = 0
  for (const v of countA.values()) sumA += comb2(v)
  let sumB = 0
  for (const v of countB.values()) sumB += comb2(v)
  const expected = (sumA * sumB) / comb2(n)
  const maximum = (sumA + sumB) / 2
  // Trivial partitions (a single group, or only singletons, on both sides).
  if (maximum === expected) return 1
  return (index - expected) / (maximum - expected)
}

/** The main setting first, then classes k, k+1, k+3 with frequency f and f+2 (labiia_lex's default_specs). */
export function robustnessSpecs(classes: number, minFreq: number): RobustnessSpec[] {
  const k = Math.max(2, Math.round(classes))
  const f = Math.max(1, Math.round(minFreq))
  const specs: RobustnessSpec[] = [{ classes: k, minFreq: f }]
  for (const freq of [f, f + 2]) {
    for (const c of [k, k + 1, k + 3]) {
      const spec = { classes: Math.min(MAX_CLASSES, c), minFreq: freq }
      if (!specs.some((s) => s.classes === spec.classes && s.minFreq === spec.minFreq)) specs.push(spec)
    }
  }
  return specs
}

export const specLabel = (s: RobustnessSpec): string => `${s.classes} classes, freq. mín. ${s.minFreq}`
