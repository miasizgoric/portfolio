import * as THREE from 'three'
import { billow2, clamp01, fbm2, makeNoise2D, ridged2, smoothstep, type Noise2D } from './terrainNoise'

const SIZE = 256

export interface SurfaceTextures {
  map: THREE.Texture
  normalMap: THREE.Texture
  roughnessMap: THREE.Texture
  aoMap: THREE.Texture
  dispose(): void
}

export function tileable(u: number, v: number, f: (x: number, y: number) => number): number {
  const a = f(u, v)
  const b = f(u - 1, v)
  const c = f(u, v - 1)
  const d = f(u - 1, v - 1)
  const iu = 1 - u
  const iv = 1 - v
  return a * iu * iv + b * u * iv + c * iu * v + d * u * v
}

function configure(tex: THREE.DataTexture, srgb: boolean): THREE.DataTexture {
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 8
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}

function heightToNormal(height: Float32Array, strength: number): THREE.DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++) {
    const yUp = ((y - 1 + SIZE) % SIZE) * SIZE
    const yDn = ((y + 1) % SIZE) * SIZE
    const yC = y * SIZE
    for (let x = 0; x < SIZE; x++) {
      const xL = (x - 1 + SIZE) % SIZE
      const xR = (x + 1) % SIZE
      const dx = (height[yC + xL] - height[yC + xR]) * strength
      const dy = (height[yUp + x] - height[yDn + x]) * strength
      const len = Math.sqrt(dx * dx + dy * dy + 1)
      const i = (yC + x) * 4
      data[i] = ((dx / len) * 0.5 + 0.5) * 255
      data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255
      data[i + 2] = (1 / len) * 0.5 * 255 + 127.5
      data[i + 3] = 255
    }
  }
  return configure(new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat), false)
}

function greyTexture(values: Float32Array): THREE.DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4)
  for (let i = 0; i < SIZE * SIZE; i++) {
    const g = clamp01(values[i]) * 255
    data[i * 4] = g
    data[i * 4 + 1] = g
    data[i * 4 + 2] = g
    data[i * 4 + 3] = 255
  }
  return configure(new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat), false)
}

function build(
  seed: number,
  sample: (u: number, v: number, n: Noise2D, m: Noise2D) => { h: number; tint: number; rough: number },
): SurfaceTextures {
  const n = makeNoise2D(seed)
  const m = makeNoise2D(seed + 977)

  const height = new Float32Array(SIZE * SIZE)
  const rough = new Float32Array(SIZE * SIZE)
  const ao = new Float32Array(SIZE * SIZE)
  const albedo = new Uint8Array(SIZE * SIZE * 4)

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x
      const s = sample(x / SIZE, y / SIZE, n, m)
      height[i] = s.h
      rough[i] = s.rough
      ao[i] = 0.42 + 0.58 * smoothstep(0.18, 0.72, s.h)
      const g = (0.74 + 0.36 * s.tint) * 255
      albedo[i * 4] = Math.min(g * 0.98, 255)
      albedo[i * 4 + 1] = Math.min(g, 255)
      albedo[i * 4 + 2] = Math.min(g * 0.93, 255)
      albedo[i * 4 + 3] = 255
    }
  }

  const map = configure(new THREE.DataTexture(albedo, SIZE, SIZE, THREE.RGBAFormat), true)
  const normalMap = heightToNormal(height, SIZE * 0.06)
  const roughnessMap = greyTexture(rough)
  const aoMap = greyTexture(ao)

  return {
    map,
    normalMap,
    roughnessMap,
    aoMap,
    dispose() {
      map.dispose()
      normalMap.dispose()
      roughnessMap.dispose()
      aoMap.dispose()
    },
  }
}

export function createMossTextures(): SurfaceTextures {
  return build(4801, (u, v, n, m) => {
    const clump = tileable(u, v, (a, b) => billow2(n, a * 5, b * 5, 3))
    const fuzz = tileable(u, v, (a, b) => fbm2(m, a * 22, b * 22, 3) * 0.5 + 0.5)
    const speck = tileable(u, v, (a, b) => ridged2(m, a * 42, b * 42, 2))
    const h = clamp01(clump * 0.62 + fuzz * 0.3 + speck * 0.14)
    return {
      h,
      tint: clamp01(fuzz * 0.7 + clump * 0.45 - 0.2),
      rough: clamp01(0.62 + 0.34 * h),
    }
  })
}

export function createWoodFloorTextures(width: number, depth: number): SurfaceTextures {
  const BOARDS = 9
  const textures = build(9281, (u, v, n, m) => {
    const board = Math.floor(v * BOARDS)
    const stagger = (board * 0.37) % 1
    const alongBoard = (u + stagger) % 1
    const acrossBoard = v * BOARDS - board

    const grain = tileable(u, v, (a, b) => ridged2(n, a * 3.2 + board * 7.3, b * 46, 3))
    const figure = tileable(u, v, (a, b) => fbm2(m, a * 5 + board * 3.1, b * 34, 3) * 0.5 + 0.5)
    const edge = 1 - smoothstep(0.012, 0.055, Math.min(acrossBoard, 1 - acrossBoard))
    const joint = 1 - smoothstep(0.004, 0.016, Math.min(alongBoard, 1 - alongBoard))
    const seam = Math.max(edge, joint)

    const h = clamp01(0.62 + grain * 0.24 + figure * 0.12 - seam * 0.85)
    const plankTone = ((board * 0.618) % 1) * 0.3
    return {
      h,
      tint: clamp01(0.32 + grain * 0.3 + figure * 0.2 + plankTone - seam * 0.6),
      rough: clamp01(0.42 + figure * 0.16 + seam * 0.35),
    }
  })

  for (const tex of [textures.map, textures.normalMap, textures.roughnessMap, textures.aoMap]) {
    tex.repeat.set(Math.max(1, width / 2.2), Math.max(1, depth / 2.2))
  }
  return textures
}

let rockTextures: SurfaceTextures | null = null

export function getRockTextures(): SurfaceTextures {
  if (!rockTextures) rockTextures = createRockTextures()
  return rockTextures
}

function createRockTextures(): SurfaceTextures {
  return build(6151, (u, v, n, m) => {
    const grain = tileable(u, v, (a, b) => fbm2(n, a * 26, b * 26, 3) * 0.5 + 0.5)
    const strata = tileable(u, v, (a, b) => ridged2(m, a * 3.5, b * 17, 3))
    const cracks = tileable(u, v, (a, b) => ridged2(n, a * 9, b * 9, 2))
    const h = clamp01(grain * 0.46 + strata * 0.34 + Math.pow(cracks, 3) * 0.3)
    return {
      h,
      tint: clamp01(grain * 0.85 + strata * 0.25 - 0.12),
      rough: clamp01(0.72 + 0.26 * grain),
    }
  })
}

