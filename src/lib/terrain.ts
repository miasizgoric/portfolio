import * as THREE from 'three'
import type { Rect } from '@/data/rooms'
import { distanceToFootprint } from './grove'
import { mulberry32 } from './noise'
import {
  billow2,
  clamp01,
  fbm2,
  lerp,
  makeNoise2D,
  ridged2,
  smoothstep,
  terrace,
} from './terrainNoise'

export const FOOTPRINT: Rect = { minX: -9, maxX: 9, minZ: -16, maxZ: 10 }

const GROUND_BIAS = -0.06

export const TERRAIN_RADIUS = 420

const CX = 0
const CZ = -1

export const SEA = {
  level: -26,
  cliffEdge: 62,
  cliffFoot: 78,
  cliffTop: 9,
}

const CLEARING_NEAR = 6
const CLEARING_FAR = 22
const CLEARING_DEPTH = 0.62

const TRACK_DEPTH = 0.44
const TRACK_GRADE = 0.8
const TRACK_SMOOTH = 170

const COAST_SWING = 24
const COAST_LO = SEA.cliffEdge - 14 - COAST_SWING
const COAST_HI = SEA.cliffFoot + COAST_SWING

interface Stack {
  x: number
  z: number
  inner: number
  outer: number
  cull: number
  top: number
}

const STACKS: Stack[] = [
  { x: -63, z: -112, inner: 4.4, outer: 11.2, cull: 13.4, top: 3 },
  { x: -48, z: -98, inner: 2.1, outer: 5.4, cull: 6.8, top: -13 },
  { x: 96, z: -104, inner: 3.6, outer: 7.8, cull: 9.8, top: -6 },
  { x: 104, z: -118, inner: 1.9, outer: 4.6, cull: 5.8, top: -23 },
]

interface Ramp {
  pts: Float32Array
  count: number
  inner: number
  outer: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

let rampY = 0
let rampFade = 0

function rampDistance(ramp: Ramp, x: number, z: number): number {
  if (x < ramp.minX || x > ramp.maxX || z < ramp.minZ || z > ramp.maxZ) return Infinity
  const p = ramp.pts
  let best = Infinity
  let bestY = 0
  let bestFade = 0
  for (let i = 0; i < ramp.count - 1; i++) {
    const o = i * 4
    const ax = p[o]
    const az = p[o + 1]
    const vx = p[o + 4] - ax
    const vz = p[o + 5] - az
    const len2 = vx * vx + vz * vz
    let t = len2 > 0 ? ((x - ax) * vx + (z - az) * vz) / len2 : 0
    if (t < 0) t = 0
    else if (t > 1) t = 1
    const ddx = x - (ax + vx * t)
    const ddz = z - (az + vz * t)
    const dist2 = ddx * ddx + ddz * ddz
    if (dist2 < best) {
      best = dist2
      bestY = p[o + 2] + (p[o + 6] - p[o + 2]) * t
      bestFade = p[o + 3] + (p[o + 7] - p[o + 3]) * t
    }
  }
  rampY = bestY
  rampFade = bestFade
  return Math.sqrt(best)
}

function rampWeight(ramp: Ramp, x: number, z: number): number {
  return 1 - smoothstep(ramp.inner, ramp.outer, rampDistance(ramp, x, z))
}

function buildRamp(
  control: [number, number][],
  samples: number,
  inner: number,
  outer: number,
  fade: number,
  reach: number,
): Ramp {
  const curve = new THREE.CatmullRomCurve3(
    control.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'catmullrom',
    0.5,
  )
  const pts = new Float32Array(samples * 4)
  const v = new THREE.Vector3()
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let run = 0
  let px = 0
  let pz = 0
  for (let i = 0; i < samples; i++) {
    curve.getPoint(i / (samples - 1), v)
    const o = i * 4
    if (i > 0) run += Math.hypot(v.x - px, v.z - pz)
    px = v.x
    pz = v.z
    pts[o] = v.x
    pts[o + 1] = v.z
    pts[o + 3] = fade > 0 ? smoothstep(0, fade, run) : 1
    if (v.x < minX) minX = v.x
    if (v.x > maxX) maxX = v.x
    if (v.z < minZ) minZ = v.z
    if (v.z > maxZ) maxZ = v.z
  }
  return { pts, count: samples, inner, outer, minX: minX - reach, maxX: maxX + reach, minZ: minZ - reach, maxZ: maxZ + reach }
}

function gradeRamp(ramp: Ramp, ground: (x: number, z: number) => number): void {
  const p = ramp.pts
  const n = ramp.count
  const raw = new Float32Array(n)
  const next = new Float32Array(n)
  for (let i = 0; i < n; i++) raw[i] = ground(p[i * 4], p[i * 4 + 1])
  next[0] = raw[0]
  next[n - 1] = raw[n - 1]
  for (let k = 0; k < TRACK_SMOOTH; k++) {
    for (let i = 1; i < n - 1; i++) next[i] = 0.25 * raw[i - 1] + 0.5 * raw[i] + 0.25 * raw[i + 1]
    raw.set(next)
  }
  for (let i = 0; i < n; i++) p[i * 4 + 2] = raw[i]
}

function carve(h: number, ramp: Ramp, dist: number, bed: number, fade: number): number {
  const w = (1 - smoothstep(ramp.inner, ramp.outer, dist)) * fade
  if (w <= 0) return h
  return h + w * ((bed - h) * TRACK_GRADE - TRACK_DEPTH * w)
}

const APPROACH_CONTROL: [number, number][] = [
  [3.0, 74],
  [7.5, 66],
  [11.5, 58],
  [11.0, 51],
  [8.5, 46],
  [5.0, 38],
  [-1.5, 31],
  [2.5, 24.5],
  [-0.8, 18.5],
  [-0.9, 14.0],
  [0.4, 11.8],
  [0.0, 9.5],
]

interface Outcrop {
  x: number
  z: number
  radius: number
  rise: number
  tilt: number
  spin: number
  bodies: number
  seed: number
}

export interface TerrainField {
  readonly outcrops: readonly Outcrop[]
  height(x: number, z: number): number
  slope(x: number, z: number): number
  moss(x: number, z: number, slope: number, y: number): number
  onPath(x: number, z: number): number
  coast(x: number, z: number): number
}

function angleDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2)
  if (d > Math.PI) d = Math.PI * 2 - d
  return d
}

function createTerrainField(fp: Rect): TerrainField {
  const warpN = makeNoise2D(1301)
  const nearN = makeNoise2D(2207)
  const fineN = makeNoise2D(3319)
  const midN = makeNoise2D(4421)
  const spineN = makeNoise2D(5527)
  const rimN = makeNoise2D(6637)
  const farN = makeNoise2D(7741)
  const mossN = makeNoise2D(8849)
  const coastN = makeNoise2D(9059)
  const cliffN = makeNoise2D(10163)

  const approach = buildRamp(APPROACH_CONTROL, 96, 2.0, 5.4, 18, CLEARING_FAR)

  const outcrops: Outcrop[] = (() => {
    const rand = mulberry32(0x9e3779b9)
    const list: Outcrop[] = []
    for (let attempt = 0; attempt < 2600 && list.length < 42; attempt++) {
      const ang = rand() * Math.PI * 2
      const rad = 20 + Math.sqrt(rand()) * 62
      const x = CX + Math.cos(ang) * rad
      const z = CZ + Math.sin(ang) * rad
      const d = distanceToFootprint(x, z, fp)
      if (d < 15) continue
      if (rampWeight(approach, x, z) > 0.05) continue

      const scale = smoothstep(16, 70, d)
      const radius = lerp(4.5, 17, scale * rand())
      if (rampDistance(approach, x, z) < radius * 1.3 + 8) continue
      let ok = true
      for (const o of list) {
        if (Math.hypot(o.x - x, o.z - z) < (o.radius + radius) * 0.72) {
          ok = false
          break
        }
      }
      if (!ok) continue
      list.push({
        x,
        z,
        radius,
        rise: radius * lerp(0.28, 0.62, rand()),
        tilt: (rand() - 0.5) * 0.5,
        spin: rand() * Math.PI * 2,
        bodies: 3 + Math.floor(rand() * 6),
        seed: Math.floor(rand() * 100000),
      })
    }
    return list.filter((o) => coastDepth(o.x, o.z) + o.radius * 0.8 < SEA.cliffEdge - 12)
  })()

  function coastDepth(x: number, z: number): number {
    const raw = -z
    return raw > COAST_LO && raw < COAST_HI ? raw + coastOffset(x) : raw
  }

  function coastOffset(x: number): number {
    const o =
      18 * fbm2(coastN, x * 0.0088, 5.7, 3) +
      6.5 * fbm2(coastN, x * 0.0268, 19.3, 2) +
      15 * Math.exp(-(x - 37) * (x - 37) * 0.0016)
    return o > COAST_SWING ? COAST_SWING : o < -COAST_SWING ? -COAST_SWING : o
  }

  function rimGap(dx: number, dz: number): number {
    const a = Math.atan2(dz, dx)
    let g = 1
    g -= 0.6 * Math.exp(-(angleDelta(a, Math.PI / 2) ** 2) / 0.32)
    g -= 0.38 * Math.exp(-(angleDelta(a, 0) ** 2) / 0.2)
    g += 0.24 * Math.exp(-(angleDelta(a, -Math.PI / 2) ** 2) / 0.7)
    return g < 0.16 ? 0.16 : g > 1.3 ? 1.3 : g
  }

  function landform(x: number, z: number, d: number, trackDist: number): number {
    const dx = x - CX
    const dz = z - CZ
    const r = Math.sqrt(dx * dx + dz * dz)

    const wq = warpN(x * 0.021, z * 0.021)
    const wr = warpN(x * 0.021 + 41.3, z * 0.021 - 17.7)
    const wx = x + 7.5 * wq
    const wz = z + 7.5 * wr

    const clearing = 1 - CLEARING_DEPTH * (1 - smoothstep(CLEARING_NEAR, CLEARING_FAR, trackDist))

    let h = 0

    const near = smoothstep(2, 12, d)
    if (near > 0) {
      let n = 1.0 * fbm2(nearN, wx * 0.042, wz * 0.042, 3)
      n += 0.26 * billow2(fineN, wx * 0.15, wz * 0.15, 3) - 0.13
      h += near * terrace(n, 0.45, 0.2) * clearing
    }

    const mid = smoothstep(14, 40, d)
    if (mid > 0) {
      let m = 6.2 * fbm2(midN, wx * 0.0165, wz * 0.0165, 4)
      m += 4.4 * (ridged2(spineN, wx * 0.0255, wz * 0.0255, 4) - 0.44)
      m = terrace(m, 1.15, 0.42 * smoothstep(19, 34, d))
      h += mid * m * clearing

      for (let i = 0; i < outcrops.length; i++) {
        const o = outcrops[i]
        const ox = x - o.x
        const oz = z - o.z
        const dist2 = ox * ox + oz * oz
        const rr = o.radius * 1.55
        if (dist2 >= rr * rr) continue
        const t = 1 - Math.sqrt(dist2) / rr
        h += mid * o.rise * t * t * (3 - 2 * t) * clearing
      }
    }

    const cz = coastDepth(x, z)
    const inland = 1 - smoothstep(SEA.cliffEdge - 14, SEA.cliffEdge, cz)

    const rim = smoothstep(32, 68, r) * (1 - 0.45 * smoothstep(95, 155, r)) * inland
    if (rim > 0) {
      const crag = ridged2(rimN, x * 0.0125, z * 0.0125, 4)
      h += rim * rimGap(dx, dz) * (13 + 13.5 * crag) * clearing
    }

    const far = smoothstep(115, 225, r) * inland
    if (far > 0) {
      h += far * (21 * fbm2(farN, x * 0.0031, z * 0.0031, 4) + 13 * ridged2(farN, x * 0.0018, z * 0.0018, 3) - 7)
    }

    const brinkBlend = smoothstep(SEA.cliffEdge - 12, SEA.cliffEdge + 3, cz)
    if (brinkBlend > 0) {
      const coast = smoothstep(SEA.cliffEdge, SEA.cliffFoot, cz)
      const brink =
        SEA.cliffTop +
        8.5 * coastN(x * 0.0071, 27.4) +
        3.2 * coastN(x * 0.0213, 41.8) +
        2.2 * fbm2(fineN, x * 0.035, z * 0.035, 2)
      const bed = SEA.level - 6.5 - 3 * fbm2(fineN, x * 0.02, z * 0.02, 2)
      const bias = 0.5 + 1.55 * clamp01(0.5 + 0.55 * coastN(x * 0.0183, 63.1))
      const tb = coast / (coast + (1 - coast) * bias)
      const relief = 4 * coast * (1 - coast) * (1 - 0.72 * smoothstep(130, 300, Math.abs(x)))
      let face = lerp(brink, bed, tb * tb * (3 - 2 * tb))
      face -= relief * (7 * ridged2(cliffN, x * 0.042, z * 0.019, 3) - 2.45)
      face = terrace(face, 3.4, 0.6 * relief * clamp01(0.3 + 0.8 * coastN(x * 0.0262, 5.2)))
      h = lerp(h, face, brinkBlend)
    }

    for (let i = 0; i < STACKS.length; i++) {
      const s = STACKS[i]
      const sx = x - s.x
      const sz = z - s.z
      const d2 = sx * sx + sz * sz
      if (d2 >= s.cull * s.cull) continue
      const sd = Math.sqrt(d2) * (1 + 0.12 * fineN(x * 0.11, z * 0.11))
      const t = 1 - smoothstep(s.inner, s.outer, sd)
      if (t > 0) h = lerp(h, s.top, t * t * (3 - 2 * t))
    }

    return h
  }

  function groundUnderTrack(x: number, z: number): number {
    const d = distanceToFootprint(x, z, fp)
    const trackDist = rampDistance(approach, x, z)
    return landform(x, z, d, trackDist)
  }

  function height(x: number, z: number): number {
    const d = distanceToFootprint(x, z, fp)
    const hardClear = smoothstep(2, 5.5, d)
    if (hardClear <= 0) return GROUND_BIAS

    const approachDist = rampDistance(approach, x, z)
    const approachY = rampY
    const approachFade = rampFade

    let h = landform(x, z, d, approachDist)
    h = carve(h, approach, approachDist, approachY, approachFade)

    return h * hardClear + GROUND_BIAS
  }

  const EPS = 0.55
  function slope(x: number, z: number): number {
    const gx = (height(x + EPS, z) - height(x - EPS, z)) / (2 * EPS)
    const gz = (height(x, z + EPS) - height(x, z - EPS)) / (2 * EPS)
    const g = Math.sqrt(gx * gx + gz * gz)
    return g / (1 + g)
  }

  function moss(x: number, z: number, s: number, y: number): number {
    const flat = 1 - smoothstep(0.2, 0.66, s)
    const damp = 1 - smoothstep(-1, 18, y)
    const patch = 0.5 + 0.5 * fbm2(mossN, x * 0.055, z * 0.055, 3)
    return clamp01((0.44 * flat + 0.3 * damp + 0.3 * patch - 0.24) * 1.4)
  }

  function onPath(x: number, z: number): number {
    return rampWeight(approach, x, z) * rampFade
  }

  function coast(x: number, z: number): number {
    return smoothstep(SEA.cliffEdge - 12, SEA.cliffEdge + 3, coastDepth(x, z))
  }

  gradeRamp(approach, groundUnderTrack)

  return { outcrops, height, slope, moss, onPath, coast }
}

const defaultField = createTerrainField(FOOTPRINT)

export function getTerrainField(): TerrainField {
  return defaultField
}

// The flat summit of a sea stack that rises clear of the water, where a visitor can land.
export function onStackTop(x: number, z: number, margin = 0): boolean {
  return STACKS.some(
    (s) => s.top > SEA.level + 1 && Math.hypot(x - s.x, z - s.z) < s.inner * 0.85 - margin,
  )
}

export function terrainHeightAt(x: number, z: number): number {
  return defaultField.height(x, z)
}

export function terrainSlopeAt(x: number, z: number): number {
  return defaultField.slope(x, z)
}
