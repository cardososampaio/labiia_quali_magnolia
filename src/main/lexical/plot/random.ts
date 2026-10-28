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
  private mt = new Uint32Array(N)
  private index = N

  constructor(seed: number) {
    this.mt[0] = seed >>> 0
    for (let i = 1; i < N; i++) {
      const prev = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30)
      // 1812433253 * prev + i, in 32-bit arithmetic.
      this.mt[i] = (Math.imul(1812433253, prev) + i) >>> 0
    }
  }

  private nextUint32(): number {
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
