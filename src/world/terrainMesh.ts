import * as THREE from 'three'
import { fbm2, makeNoise2D, smoothstep } from '@/lib/terrainNoise'
import { SEA, TERRAIN_RADIUS, type TerrainField } from '@/lib/terrain'


const RINGS = 168
const SECTORS = 192
const INNER_RADIUS = 1.5

const MOSS_DEEP = new THREE.Color('#4d6340')
const MOSS_LIT = new THREE.Color('#6f9159')
const ROCK_DARK = new THREE.Color('#4a5148')
const ROCK_PALE = new THREE.Color('#767a6a')
const PATH_TONE = new THREE.Color('#7b6150')

const LIMESTONE = new THREE.Color('#cdbfad')
const LIMESTONE_WARM = new THREE.Color('#c29f76')
const LIMESTONE_SHADE = new THREE.Color('#8d8579')
const WET_ROCK = new THREE.Color('#3c3e3a')

const TIDE_BAND = 2.4

export interface TerrainArrays {
  position: Float32Array
  normal: Float32Array
  color: Float32Array
  rockiness: Float32Array
  uv: Float32Array
  index: Uint32Array
}

export function buildTerrainArrays(field: TerrainField): TerrainArrays {
  const vertexCount = (RINGS + 1) * (SECTORS + 1)
  const positions = new Float32Array(vertexCount * 3)
  const colors = new Float32Array(vertexCount * 3)
  const rockiness = new Float32Array(vertexCount)
  const uvs = new Float32Array(vertexCount * 2)
  const indices = new Uint32Array(RINGS * SECTORS * 6)

  const stain = makeNoise2D(40519)
  const color = new THREE.Color()
  const rock = new THREE.Color()
  const stone = new THREE.Color()

  const heights = new Float32Array(vertexCount)
  const radii = new Float32Array(RINGS + 1)
  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS
    radii[r] = INNER_RADIUS + (TERRAIN_RADIUS - INNER_RADIUS) * t * t
  }

  for (let r = 0; r <= RINGS; r++) {
    const radius = radii[r]
    for (let s = 0; s <= SECTORS; s++) {
      const theta = (s / SECTORS) * Math.PI * 2
      const x = Math.cos(theta) * radius
      const z = Math.sin(theta) * radius
      const i = r * (SECTORS + 1) + s
      const y = field.height(x, z)
      heights[i] = y
      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z
      uvs[i * 2] = x * 0.06
      uvs[i * 2 + 1] = z * 0.06
    }
  }

  const sectorStep = (Math.PI * 2) / SECTORS
  for (let r = 0; r <= RINGS; r++) {
    const radius = radii[r]
    const inner = radii[Math.max(r - 1, 0)]
    const outer = radii[Math.min(r + 1, RINGS)]
    const radialSpan = Math.max(outer - inner, 0.01)
    const arcSpan = Math.max(radius * sectorStep * 2, 0.01)
    for (let s = 0; s <= SECTORS; s++) {
      const theta = (s / SECTORS) * Math.PI * 2
      const x = Math.cos(theta) * radius
      const z = Math.sin(theta) * radius
      const i = r * (SECTORS + 1) + s
      const y = heights[i]

      const up = heights[Math.max(r - 1, 0) * (SECTORS + 1) + s]
      const down = heights[Math.min(r + 1, RINGS) * (SECTORS + 1) + s]
      const left = heights[r * (SECTORS + 1) + (s === 0 ? SECTORS - 1 : s - 1)]
      const right = heights[r * (SECTORS + 1) + (s === SECTORS ? 1 : s + 1)]
      const gradient = Math.hypot((down - up) / radialSpan, (right - left) / arcSpan)
      const slope = gradient / (1 + gradient)
      const moss = field.moss(x, z, slope, y)

      rock.copy(ROCK_DARK).lerp(ROCK_PALE, slope)
      color.copy(MOSS_DEEP).lerp(MOSS_LIT, moss)
      color.lerp(rock, 1 - moss)
      const path = field.onPath(x, z)
      if (path > 0) {
        const tread = smoothstep(0.4, 0.86, path)
        const scuff = 0.5 + 0.5 * fbm2(stain, x * 0.32, z * 0.32, 2)
        color.lerp(PATH_TONE, tread * (0.56 + scuff * 0.34))
      }

      const coast = field.coast(x, z)
      const bare = Math.max(
        smoothstep(0.6, 0.92, slope) * (1 - moss * 0.8),
        coast * smoothstep(0.16, 0.4, slope),
        smoothstep(0.9, 1, coast),
      )
      if (bare > 0) {
        const warm = smoothstep(0.1, 0.6, fbm2(stain, x * 0.045, z * 0.045 + y * 0.08, 3))
        const shade = smoothstep(-0.2, 0.5, fbm2(stain, x * 0.11 + 31.7, y * 0.14, 2))
        stone.copy(LIMESTONE).lerp(LIMESTONE_WARM, warm * 0.8).lerp(LIMESTONE_SHADE, shade * 0.6)
        const tide = 1 - smoothstep(SEA.level, SEA.level + TIDE_BAND, y)
        stone.lerp(WET_ROCK, tide * 0.85)
        color.lerp(stone, bare)
      }
      rockiness[i] = bare

      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
  }
  let o = 0
  for (let r = 0; r < RINGS; r++) {
    for (let s = 0; s < SECTORS; s++) {
      const a = r * (SECTORS + 1) + s
      const b = a + SECTORS + 1
      indices[o++] = a
      indices[o++] = a + 1
      indices[o++] = b
      indices[o++] = a + 1
      indices[o++] = b + 1
      indices[o++] = b
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('rockiness', new THREE.BufferAttribute(rockiness, 1))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(new THREE.BufferAttribute(indices, 1))
  geo.computeVertexNormals()
  return {
    position: positions,
    normal: geo.attributes.normal.array as Float32Array,
    color: colors,
    rockiness,
    uv: uvs,
    index: indices,
  }
}
