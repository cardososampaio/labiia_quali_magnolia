/**
 * numpy's legacy random generator (np.random.RandomState: Mersenne Twister
 * MT19937 seeded with an integer, `rand()` doubles with 53 random bits).
 *
 * labiia_lex lays out its networks with networkx, which draws the starting
 * positions from RandomState(seed). Reproducing the same numbers here makes
 * the same seed give the same layout as in labiia_lex.
 */
const N = 624
const M = 397
const UPPER = 0x80000000
const LOWER = 0x7fffffff
const MATRIX_A = 0x9908b0df

export class RandomState {
  protected mt = new Uint32Array(N)
  protected index = N

  constructor(seed: number) {
    this.mt[0] = seed >>> 0
    for (let i = 1; i < N; i++) {
      const prev = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30)
      // 1812433253 * prev + i, in 32-bit arithmetic.
      this.mt[i] = (Math.imul(1812433253, prev) + i) >>> 0
    }
  }

  protected nextUint32(): number {
    if (this.index >= N) {
      const mt = this.mt
      let y: number
      let k = 0
      for (; k < N - M; k++) {
        y = (mt[k] & UPPER) | (mt[k + 1] & LOWER)
        mt[k] = mt[k + M] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)
      }
      for (; k < N - 1; k++) {
        y = (mt[k] & UPPER) | (mt[k + 1] & LOWER)
        mt[k] = mt[k + (M - N)] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)
      }
      y = (mt[N - 1] & UPPER) | (mt[0] & LOWER)
      mt[N - 1] = mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)
      this.index = 0
    }
    let y = this.mt[this.index++]
    y ^= y >>> 11
    y ^= (y << 7) & 0x9d2c5680
    y ^= (y << 15) & 0xefc60000
    y ^= y >>> 18
    return y >>> 0
  }

  /** A double in [0, 1), as numpy's random_sample. */
  random(): number {
    const a = this.nextUint32() >>> 5
    const b = this.nextUint32() >>> 6
    return (a * 67108864 + b) / 9007199254740992
  }
}

/**
 * Python's own `random.Random(seed)` (also MT19937, but seeded through
 * init_by_array). networkx's Louvain shuffles the nodes with it, so the same
 * seed gives the same communities as in labiia_lex.
 */
export class PyRandom extends RandomState {
  constructor(seed: number) {
    super(19650218)
    const mt = this.mt
    const key = [Math.abs(Math.trunc(seed)) >>> 0]
    let i = 1, j = 0
    for (let k = Math.max(N, key.length); k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30)
      mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) + key[j] + j) >>> 0
      i++; j++
      if (i >= N) { mt[0] = mt[N - 1]; i = 1 }
      if (j >= key.length) j = 0
    }
    for (let k = N - 1; k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30)
      mt[i] = ((mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0
      i++
      if (i >= N) { mt[0] = mt[N - 1]; i = 1 }
    }
    mt[0] = 0x80000000
    this.index = N
  }

  /** random.getrandbits(k) for 1 <= k <= 32. */
  getrandbits(k: number): number {
    return this.nextUint32() >>> (32 - k)
  }

  /** random._randbelow(n): rejection sampling on n's bit length. */
  randbelow(n: number): number {
    const k = 32 - Math.clz32(n)
    let r = this.getrandbits(k)
    while (r >= n) r = this.getrandbits(k)
    return r
  }

  shuffle<T>(x: T[]): void {
    for (let i = x.length - 1; i > 0; i--) {
      const j = this.randbelow(i + 1)
      const t = x[i]; x[i] = x[j]; x[j] = t
    }
  }
}
