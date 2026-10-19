import * as THREE from 'three'
import { createInstanceWriter, distanceToFootprint, scatter, type InstanceBuffer } from '@/lib/grove'
import { mulberry32 } from '@/lib/noise'
import { FOOTPRINT, SEA, getTerrainField } from '@/lib/terrain'

const CLEARANCE = 2.6
export const CHUNKS = {
  trunks: { cell: 24, castShadow: true },
  farTrunks: { cell: 48 },
  flares: { cell: 24, receiveShadow: true },
  branches: { cell: 24 },
  canopy: { cell: 24, castShadow: true },
  farCanopy: { cell: 48 },
  fronds: { cell: 16 },
  blades: { cell: 12 },
} satisfies Record<string, ChunkOptions>

// Crowns reach several metres sideways; foliage that would end up inside the house below the roofline is dropped instead of clearing the whole forest around it.
const ROOF_TOP = 7.5
const intrudesHouse = (x: number, y: number, z: number, radius: number) =>
  y - radius < ROOF_TOP && distanceToFootprint(x, z, FOOTPRINT) < radius

const PATH_CLEARANCE = 0.05
const ENTRANCE = { minX: -4.2, maxX: 4.2, minZ: 8.5, maxZ: 19 }

const MAX_SLOPE = 0.42
const BRINK_RADIUS = 3
const MAX_BRINK_DROP = 2.5
const BRINK_RING = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2
  return [Math.cos(a) * BRINK_RADIUS, Math.sin(a) * BRINK_RADIUS]
})

export interface ChunkOptions {
  cell: number
  castShadow?: boolean
  receiveShadow?: boolean
}

export type LayerName = keyof typeof CHUNKS

export interface ChunkArrays {
  count: number
  matrices: Float32Array
  colors: Float32Array
}

function buildGrove(): Record<LayerName, InstanceBuffer> {
  const field = getTerrainField()
  const blocked = (x: number, z: number) => {
    if (distanceToFootprint(x, z, FOOTPRINT) < CLEARANCE) return true
    if (x > ENTRANCE.minX && x < ENTRANCE.maxX && z > ENTRANCE.minZ && z < ENTRANCE.maxZ) return true
    if (field.onPath(x, z) > PATH_CLEARANCE) return true
    if (field.slope(x, z) > MAX_SLOPE) return true
    const y = field.height(x, z)
    if (y < SEA.level + 3) return true
    for (const [dx, dz] of BRINK_RING) {
      if (y - field.height(x + dx, z + dz) > MAX_BRINK_DROP) return true
    }
    return false
  }
  const lowGrowth = (x: number, z: number) => {
    if (distanceToFootprint(x, z, FOOTPRINT) < 0.9) return true
    if (field.onPath(x, z) > 0.44) return true
    if (field.slope(x, z) > MAX_SLOPE) return true
    return field.height(x, z) < SEA.level + 3
  }

  // Far trees lie outside the 45 m shadow frustum; keeping them in their own meshes lets the shadow pass skip them instead of rasterising thousands of instances that cannot land on screen.
  const trunkWriters = { near: createInstanceWriter(1000), far: createInstanceWriter(1600) }
  const flareWriter = createInstanceWriter(1000)
  const branchWriter = createInstanceWriter(6400)
  const canopyWriters = { near: createInstanceWriter(14000), far: createInstanceWriter(7000) }
  const trunkColor = new THREE.Color()
  const leafColor = new THREE.Color()

  const bands = [
    { count: 900, inner: 11, outer: 72, seed: 8101, minH: 9, varH: 8, minR: 0.1, varR: 0.12, near: true },
    { count: 1500, inner: 70, outer: 210, seed: 9203, minH: 12, varH: 11, minR: 0.13, varR: 0.16, near: false },
  ]

  for (const band of bands) {
    const trunkWriter = band.near ? trunkWriters.near : trunkWriters.far
    const canopyWriter = band.near ? canopyWriters.near : canopyWriters.far
    const points = scatter({
      count: band.count,
      seed: band.seed,
      centerX: 0,
      centerZ: -1,
      innerRadius: band.inner,
      outerRadius: band.outer,
      bias: 0.42,
      clump: 0.55,
      clumpRadius: 4.5,
      reject: blocked,
    })
    const r = mulberry32(band.seed)

    for (const p of points) {
      const height = band.minH + r() * band.varH
      const radius = band.minR + r() * band.varR
      const baseY = field.height(p.x, p.z) - 0.15
      const hue = 0.08 + r() * 0.04
      trunkColor.setHSL(hue, 0.26, 0.17 + r() * 0.13)
      trunkWriter.push(
        p.x,
        baseY,
        p.z,
        (r() - 0.5) * 0.05,
        r() * Math.PI * 2,
        (r() - 0.5) * 0.05,
        radius,
        height,
        radius,
        trunkColor,
      )

      const crownY = baseY + height
      if (band.near) {
        flareWriter.push(
          p.x,
          baseY,
          p.z,
          0,
          r() * Math.PI * 2,
          0,
          radius * 2.7,
          height * 0.055,
          radius * 2.7,
          trunkColor,
        )

        const branches = 5 + Math.floor(r() * 4)
        for (let b = 0; b < branches; b++) {
          const angle = (b / branches) * Math.PI * 2 + r() * 0.8
          const along = 0.44 + (b / branches) * 0.44 + r() * 0.08
          const tilt = Math.PI * (0.2 + (1 - along) * 0.3 + r() * 0.08)
          const len = height * (0.13 + (1 - along) * 0.2 + r() * 0.07)
          const y = baseY + height * along
          const tipY = len * (Math.cos(tilt) - 0.36 * Math.sin(tilt))
          const tipR = len * (Math.sin(tilt) + 0.36 * Math.cos(tilt)) * 0.82
          const size = len * (0.68 + r() * 0.42)
          const tipX = p.x + Math.sin(angle) * tipR
          const tipZ = p.z + Math.cos(angle) * tipR
          if (intrudesHouse(tipX, y + tipY, tipZ, size) || intrudesHouse(p.x, y, p.z, len * 0.4)) continue
          branchWriter.push(p.x, y, p.z, tilt, angle, 0, len, len, len, trunkColor)
          leafColor.setHSL(0.24 + r() * 0.08, 0.3 + r() * 0.2, 0.24 + r() * 0.16)
          canopyWriter.push(
            p.x + Math.sin(angle) * tipR,
            y + tipY,
            p.z + Math.cos(angle) * tipR,
            Math.PI * (0.16 + r() * 0.3),
            angle,
            (r() - 0.5) * 0.6,
            size,
            size,
            size,
            leafColor,
          )
        }
      }

      const cards = band.near ? 5 + Math.floor(r() * 3) : 4
      for (let c = 0; c < cards; c++) {
        const angle = (c / cards) * Math.PI * 2 + r() * 0.7
        const size = height * (0.16 + r() * 0.1)
        const drop = height * 0.04 + r() * height * 0.1
        const reach = radius * 0.8 + size * (0.12 + r() * 0.3)
        leafColor.setHSL(0.24 + r() * 0.08, 0.3 + r() * 0.2, 0.28 + r() * 0.18)
        if (intrudesHouse(p.x + Math.cos(angle) * reach, crownY - drop - size * 0.35, p.z + Math.sin(angle) * reach, size)) continue
        canopyWriter.push(
          p.x + Math.cos(angle) * reach,
          crownY - drop - size * 0.35,
          p.z + Math.sin(angle) * reach,
          Math.PI * (0.18 + r() * 0.26),
          angle,
          (r() - 0.5) * 0.5,
          size,
          size,
          size,
          leafColor,
        )
      }
    }
  }

  const frondWriter = createInstanceWriter(2200)
  const frondColor = new THREE.Color()
  const frondPoints = scatter({
    count: 1400,
    seed: 4507,
    centerX: 0,
    centerZ: -1,
    innerRadius: 9,
    outerRadius: 64,
    bias: 0.38,
    clump: 0.72,
    clumpRadius: 2.2,
    reject: blocked,
  })
  const fr = mulberry32(4507)
  for (const p of frondPoints) {
    const ground = field.height(p.x, p.z)
    const moss = field.moss(p.x, p.z, field.slope(p.x, p.z), ground)
    if (fr() > 0.25 + moss * 0.75) continue
    const size = 0.8 + fr() * 1.5
    frondColor.setHSL(0.26 + fr() * 0.06, 0.36 + fr() * 0.18, 0.26 + fr() * 0.16)
    frondWriter.push(
      p.x,
      ground - 0.05,
      p.z,
      (fr() - 0.5) * 0.25,
      fr() * Math.PI * 2,
      (fr() - 0.5) * 0.25,
      size,
      size,
      size,
      frondColor,
    )
  }

  const bladeWriter = createInstanceWriter(14500)
  const bladeColor = new THREE.Color()
  const bladeBands = [
    { count: 6500, seed: 6011, outer: 56, bias: 0.4 },
    { count: 7500, seed: 6029, outer: 30, bias: 0.5 },
  ]
  for (const band of bladeBands) {
    const bladePoints = scatter({
      count: band.count,
      seed: band.seed,
      centerX: 0,
      centerZ: -1,
      innerRadius: 1.6,
      outerRadius: band.outer,
      bias: band.bias,
      clump: 0.6,
      clumpRadius: 1.6,
      reject: lowGrowth,
    })
    const br = mulberry32(band.seed)
    for (const p of bladePoints) {
      const tall = 0.38 + br() * 0.46
      const spread = tall * (0.58 + br() * 0.36)
      bladeColor.setHSL(0.25 + br() * 0.07, 0.42, 0.22 + br() * 0.14)
      bladeWriter.push(
        p.x,
        field.height(p.x, p.z) - 0.03,
        p.z,
        0,
        br() * Math.PI * 2,
        0,
        spread,
        tall,
        spread,
        bladeColor,
      )
    }
  }

  return {
    trunks: trunkWriters.near.finish(),
    farTrunks: trunkWriters.far.finish(),
    flares: flareWriter.finish(),
    branches: branchWriter.finish(),
    canopy: canopyWriters.near.finish(),
    farCanopy: canopyWriters.far.finish(),
    fronds: frondWriter.finish(),
    blades: bladeWriter.finish(),
  }
}

// Instances are grouped per grid cell so whole patches can be culled, in the shadow pass too.
function chunkLayer(buffer: InstanceBuffer, cell: number): ChunkArrays[] {
  const cells = new Map<string, number[]>()
  for (let i = 0; i < buffer.count; i++) {
    const cx = Math.floor(buffer.position[i * 3] / cell)
    const cz = Math.floor(buffer.position[i * 3 + 2] / cell)
    const key = cx + ':' + cz
    const list = cells.get(key)
    if (list) list.push(i)
    else cells.set(key, [i])
  }

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const euler = new THREE.Euler(0, 0, 0, 'YXZ')
  const scale = new THREE.Vector3()

  const chunks: ChunkArrays[] = []
  for (const indices of cells.values()) {
    const matrices = new Float32Array(indices.length * 16)
    const colors = new Float32Array(indices.length * 3)
    indices.forEach((source, slot) => {
      const o = source * 3
      position.set(buffer.position[o], buffer.position[o + 1], buffer.position[o + 2])
      euler.set(buffer.rotation[o], buffer.rotation[o + 1], buffer.rotation[o + 2])
      quaternion.setFromEuler(euler)
      scale.set(buffer.scale[o], buffer.scale[o + 1], buffer.scale[o + 2])
      matrix.compose(position, quaternion, scale).toArray(matrices, slot * 16)
      colors[slot * 3] = buffer.color[o]
      colors[slot * 3 + 1] = buffer.color[o + 1]
      colors[slot * 3 + 2] = buffer.color[o + 2]
    })
    chunks.push({ count: indices.length, matrices, colors })
  }
  return chunks
}

export function buildGroveChunks(): Record<LayerName, ChunkArrays[]> {
  const data = buildGrove()
  const out = {} as Record<LayerName, ChunkArrays[]>
  for (const name of Object.keys(CHUNKS) as LayerName[]) {
    out[name] = chunkLayer(data[name], CHUNKS[name].cell)
  }
  return out
}
