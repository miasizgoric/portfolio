import * as THREE from 'three'
import { mulberry32 } from '@/lib/noise'

export const WAVE_SIZE = 256
export const PATCH_SIZE = 128
export const GRADIENT_RANGE = 4

interface Wave {
  kx: number
  ky: number
  amp: number
  phase: number
}

function makeWaves(count: number, seed: number, kMin: number, kMax: number, spread: number): Wave[] {
  const rand = mulberry32(seed)
  const waves: Wave[] = []
  const seen = new Set<number>()
  for (let guard = 0; waves.length < count && guard < count * 50; guard++) {
    const k = kMin + Math.pow(rand(), 1.7) * (kMax - kMin)
    const theta = (rand() * 2 - 1) * spread
    const kx = Math.round(Math.cos(theta) * k)
    const ky = Math.round(Math.sin(theta) * k)
    if (kx === 0 && ky === 0) continue
    const key = (kx + 512) * 1024 + (ky + 512)
    if (seen.has(key)) continue
    seen.add(key)
    const len = Math.hypot(kx, ky)
    waves.push({ kx, ky, amp: Math.pow(len, -1.55) * (0.55 + rand() * 0.9), phase: rand() * Math.PI * 2 })
  }
  return waves
}

function gradientField(size: number, waves: Wave[]): Float32Array {
  const out = new Float32Array(size * size * 2)
  const tau = Math.PI * 2
  const n = waves.length
  const cosU = new Float32Array(n * size)
  const sinU = new Float32Array(n * size)
  const cosV = new Float32Array(n * size)
  const sinV = new Float32Array(n * size)
  for (let i = 0; i < n; i++) {
    const w = waves[i]
    for (let t = 0; t < size; t++) {
      const a = (tau * w.kx * t) / size
      const b = (tau * w.ky * t) / size + w.phase
      cosU[i * size + t] = Math.cos(a)
      sinU[i * size + t] = Math.sin(a)
      cosV[i * size + t] = Math.cos(b)
      sinV[i * size + t] = Math.sin(b)
    }
  }

  let sum = 0
  for (let y = 0; y < size; y++) {
    const row = y * size * 2
    for (let i = 0; i < n; i++) {
      const w = waves[i]
      const scale = w.amp * tau
      const su = scale * w.kx
      const sv = scale * w.ky
      const cv = cosV[i * size + y]
      const snv = sinV[i * size + y]
      const base = i * size
      for (let x = 0; x < size; x++) {
        const c = cosU[base + x] * cv - sinU[base + x] * snv
        out[row + x * 2] += c * su
        out[row + x * 2 + 1] += c * sv
      }
    }
    for (let x = 0; x < size; x++) {
      const gu = out[row + x * 2]
      const gv = out[row + x * 2 + 1]
      sum += gu * gu + gv * gv
    }
  }
  const rms = Math.sqrt(sum / (size * size)) || 1
  for (let i = 0; i < out.length; i++) out[i] /= rms
  return out
}

function encodeGradient(value: number): number {
  const t = THREE.MathUtils.clamp(value / GRADIENT_RANGE, -1, 1)
  return Math.round((t * 0.5 + 0.5) * 255)
}

export function makeWaveData(): Uint8Array {
  const chop = gradientField(WAVE_SIZE, makeWaves(46, 71021, 3, 22, 1.25))
  const swell = gradientField(WAVE_SIZE, makeWaves(22, 93307, 2, 9, 0.38))
  const data = new Uint8Array(WAVE_SIZE * WAVE_SIZE * 4)
  for (let i = 0; i < WAVE_SIZE * WAVE_SIZE; i++) {
    data[i * 4] = encodeGradient(chop[i * 2])
    data[i * 4 + 1] = encodeGradient(chop[i * 2 + 1])
    data[i * 4 + 2] = encodeGradient(swell[i * 2])
    data[i * 4 + 3] = encodeGradient(swell[i * 2 + 1])
  }
  return data
}

export function makePatchData(): Uint8Array {
  const waves = makeWaves(14, 55117, 1, 5, Math.PI / 2)
  const tau = Math.PI * 2
  const height = new Float32Array(PATCH_SIZE * PATCH_SIZE)
  let lo = Infinity
  let hi = -Infinity
  for (let y = 0; y < PATCH_SIZE; y++) {
    for (let x = 0; x < PATCH_SIZE; x++) {
      let h = 0
      for (const w of waves) h += Math.sin(tau * ((w.kx * x) / PATCH_SIZE + (w.ky * y) / PATCH_SIZE) + w.phase) * w.amp
      height[y * PATCH_SIZE + x] = h
      if (h < lo) lo = h
      if (h > hi) hi = h
    }
  }
  const data = new Uint8Array(PATCH_SIZE * PATCH_SIZE * 4)
  for (let i = 0; i < height.length; i++) {
    const g = Math.round(((height[i] - lo) / (hi - lo)) * 255)
    data[i * 4] = g
    data[i * 4 + 1] = g
    data[i * 4 + 2] = g
    data[i * 4 + 3] = 255
  }
  return data
}
