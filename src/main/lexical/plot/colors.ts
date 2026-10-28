/**
 * labiia_lex's ggplot_hue: n hues evenly spaced from 15°, CIELAB L=65 C=100,
 * converted to sRGB with clamping. Its clamping makes the first colour
 * #FF0076 (ggplot2 itself gives #F8766D); kept as labiia_lex draws it.
 */
function labToXyz(L: number, a: number, b: number): [number, number, number] {
  const [Xn, Yn, Zn] = [0.95047, 1.0, 1.08883]
  const delta = 6 / 29
  const fInv = (t: number): number => (t > delta ? t ** 3 : 3 * delta ** 2 * (t - 4 / 29))
  const fy = (L + 16) / 116
  const fx = a / 500 + fy
  const fz = fy - b / 200
  return [Xn * fInv(fx), Yn * fInv(fy), Zn * fInv(fz)]
}

function xyzToSrgb(X: number, Y: number, Z: number): [number, number, number] {
  const gamma = (c: number): number => {
    c = Math.max(0, Math.min(1, c))
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  }
  return [
    gamma(3.2406 * X - 1.5372 * Y - 0.4986 * Z),
    gamma(-0.9689 * X + 1.8758 * Y + 0.0415 * Z),
    gamma(0.0557 * X - 0.204 * Y + 1.057 * Z)
  ]
}

/** Python's round(): halves go to the even neighbour. */
function roundHalfEven(x: number): number {
  const r = Math.round(x)
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r
}

const hex = (v: number): string => roundHalfEven(v * 255).toString(16).toUpperCase().padStart(2, '0')

export function ggplotHue(n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const h = ((15 + (360 * i) / n) * Math.PI) / 180
    const [X, Y, Z] = labToXyz(65, 100 * Math.cos(h), 100 * Math.sin(h))
    const [R, G, B] = xyzToSrgb(X, Y, Z)
    out.push(`#${hex(R)}${hex(G)}${hex(B)}`)
  }
  return out
}
