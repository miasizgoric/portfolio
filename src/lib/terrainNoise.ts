import { mulberry32 } from './noise'

const G2X = new Float32Array([1, -1, 1, -1, 1, -1, 0, 0])
const G2Y = new Float32Array([1, 1, -1, -1, 0, 0, 1, -1])

export type Noise2D = (x: number, y: number) => number

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function permutation(seed: number): Uint8Array {
  const rand = mulberry32(seed)
  const base = new Uint8Array(256)
  for (let i = 0; i < 256; i++) base[i] = i
  for (let i = 255; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0
    const t = base[i]
    base[i] = base[j]
    base[j] = t
  }
  const p = new Uint8Array(512)
  for (let i = 0; i < 512; i++) p[i] = base[i & 255]
  return p
}

export function makeNoise2D(seed: number): Noise2D {
  const p = permutation(seed)
  return (x: number, y: number): number => {
    const fx = Math.floor(x)
    const fy = Math.floor(y)
    const X = fx & 255
    const Y = fy & 255
    const xf = x - fx
    const yf = y - fy
    const u = fade(xf)
    const v = fade(yf)

    const A = p[X] + Y
    const B = p[X + 1] + Y
    const aa = p[A] & 7
    const ab = p[A + 1] & 7
    const ba = p[B] & 7
    const bb = p[B + 1] & 7

    const n00 = G2X[aa] * xf + G2Y[aa] * yf
    const n10 = G2X[ba] * (xf - 1) + G2Y[ba] * yf
    const n01 = G2X[ab] * xf + G2Y[ab] * (yf - 1)
    const n11 = G2X[bb] * (xf - 1) + G2Y[bb] * (yf - 1)

    const a = n00 + u * (n10 - n00)
    const b = n01 + u * (n11 - n01)
    return (a + v * (b - a)) * 1.41
  }
}

const LACUNARITY = 2.03
const RIDGE_LACUNARITY = 2.07
const GAIN = 0.5

export function fbm2(noise: Noise2D, x: number, y: number, octaves = 4): number {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq)
    norm += amp
    amp *= GAIN
    freq *= LACUNARITY
  }
  return sum / norm
}

export function ridged2(noise: Noise2D, x: number, y: number, octaves = 4): number {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise(x * freq, y * freq))
    sum += amp * n * n
    norm += amp
    amp *= GAIN
    freq *= RIDGE_LACUNARITY
  }
  return sum / norm
}

export function billow2(noise: Noise2D, x: number, y: number, octaves = 3): number {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * Math.abs(noise(x * freq, y * freq))
    norm += amp
    amp *= GAIN
    freq *= LACUNARITY
  }
  return sum / norm
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

export function terrace(value: number, step: number, strength: number): number {
  if (strength <= 0) return value
  const f = value / step
  const i = Math.floor(f)
  const t = f - i
  const shaped = smoothstep(0.55, 0.95, t)
  return (i + lerp(t, shaped, strength)) * step
}
