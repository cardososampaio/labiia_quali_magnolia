/**
 * Gephi's Label Adjust, as labiia_lex runs it after the layout: words whose
 * label boxes overlap are pushed apart along the axis of least overlap, each
 * by half the mean push it receives, never more than 15% of the cloud's
 * span per step. Shared by the text network's first layout (in the helper)
 * and the "spread words" button (in the window).
 *
 * pts: positions (changed in place); w, h: label box sizes in the same units.
 */
export function adjustLabels(pts: number[][], w: ArrayLike<number>, h: ArrayLike<number>, o: { speed: number; iterations: number }): void {
  const n = pts.length
  const dx = new Float64Array(n), dy = new Float64Array(n), cnt = new Float64Array(n)
  for (let it = 0; it < o.iterations; it++) {
    dx.fill(0); dy.fill(0); cnt.fill(0)
    let any = false
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue
        const ddx = pts[i][0] - pts[j][0], ddy = pts[i][1] - pts[j][1]
        const hw = (w[i] + w[j]) / 2, hh = (h[i] + h[j]) / 2
        const ax = Math.abs(ddx), ay = Math.abs(ddy)
        if (!(ax < hw && ay < hh)) continue
        any = true
        cnt[i]++
        const penX = hw - ax, penY = hh - ay
        if (penX < penY) dx[i] += (ddx === 0 ? 1 : Math.sign(ddx)) * penX * o.speed
        else dy[i] += (ddy === 0 ? 1 : Math.sign(ddy)) * penY * o.speed
      }
    }
    if (!any) return
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]) }
    const maxDx = Math.max((x1 - x0) * 0.15, 1), maxDy = Math.max((y1 - y0) * 0.15, 1)
    for (let i = 0; i < n; i++) {
      const c = Math.max(1, cnt[i])
      pts[i][0] += Math.max(-maxDx, Math.min(maxDx, (dx[i] / c) * 0.5))
      pts[i][1] += Math.max(-maxDy, Math.min(maxDy, (dy[i] / c) * 0.5))
    }
  }
}
