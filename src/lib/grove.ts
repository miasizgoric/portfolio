import * as THREE from 'three'
import type { Rect } from '@/data/rooms'
import { mulberry32 } from './noise'

export function distanceToFootprint(x: number, z: number, fp: Rect): number {
  const dx = Math.max(fp.minX - x, 0, x - fp.maxX)
  const dz = Math.max(fp.minZ - z, 0, z - fp.maxZ)
  return Math.hypot(dx, dz)
}

export const windUniform = { value: 0 }

interface WindOptions {
  amplitude: number
  speed: number
  stiffness: number
  translucency?: number
}

export function applyWind(material: THREE.Material, cacheKey: string, o: WindOptions) {
  const amp = o.amplitude.toFixed(4)
  const speed = o.speed.toFixed(4)
  const stiff = o.stiffness.toFixed(3)

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniform
    shader.vertexShader = `uniform float uWindTime;\n${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      `
      vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      {
        float wBend = pow( clamp( position.y, 0.0, 1.0 ), ${stiff} );
        float wPhase = mvPosition.x * 0.21 + mvPosition.z * 0.17;
        float wWave = sin( uWindTime * ${speed} + wPhase ) + 0.45 * sin( uWindTime * ${speed} * 2.37 + wPhase * 1.83 );
        mvPosition.x += wWave * wBend * ${amp};
        mvPosition.z += wWave * 0.62 * wBend * ${amp};
      }
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;
      `,
    )
  }
  if (o.translucency) {
    const amount = o.translucency.toFixed(3)
    const inject = material.onBeforeCompile
    material.onBeforeCompile = (shader, renderer) => {
      inject(shader, renderer)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        {
          vec3 leafL = directionalLights[0].direction;
          float leafWrap = max(0.0, (dot(normal, leafL) + 0.7) / 1.7);
          float leafBack = pow(max(0.0, -dot(normalize(vViewPosition), leafL)), 2.5);
          reflectedLight.indirectDiffuse += diffuseColor.rgb * directionalLights[0].color * ((leafWrap * 0.22 + leafBack * 0.6) * ${amount});
        }
        #endif`,
      )
    }
  }
  material.customProgramCacheKey = () => cacheKey
}

export interface InstanceBuffer {
  count: number
  position: Float32Array
  rotation: Float32Array
  scale: Float32Array
  color: Float32Array
}

interface InstanceWriter {
  push(
    px: number,
    py: number,
    pz: number,
    rx: number,
    ry: number,
    rz: number,
    sx: number,
    sy: number,
    sz: number,
    color: THREE.Color,
  ): void
  finish(): InstanceBuffer
}

export function createInstanceWriter(capacity: number): InstanceWriter {
  const position = new Float32Array(capacity * 3)
  const rotation = new Float32Array(capacity * 3)
  const scale = new Float32Array(capacity * 3)
  const color = new Float32Array(capacity * 3)
  let n = 0

  return {
    push(px, py, pz, rx, ry, rz, sx, sy, sz, c) {
      if (n >= capacity) return
      const i = n * 3
      position[i] = px
      position[i + 1] = py
      position[i + 2] = pz
      rotation[i] = rx
      rotation[i + 1] = ry
      rotation[i + 2] = rz
      scale[i] = sx
      scale[i + 1] = sy
      scale[i + 2] = sz
      color[i] = c.r
      color[i + 1] = c.g
      color[i + 2] = c.b
      n++
    },
    finish() {
      return {
        count: n,
        position: position.subarray(0, n * 3),
        rotation: rotation.subarray(0, n * 3),
        scale: scale.subarray(0, n * 3),
        color: color.subarray(0, n * 3),
      }
    },
  }
}

interface ScatterOptions {
  count: number
  seed: number
  centerX: number
  centerZ: number
  innerRadius: number
  outerRadius: number
  bias: number
  clump: number
  clumpRadius: number
  reject: (x: number, z: number) => boolean
}

interface ScatterPoint {
  x: number
  z: number
}

export function scatter(o: ScatterOptions): ScatterPoint[] {
  const rand = mulberry32(o.seed)
  const { bias, clump, clumpRadius } = o
  const span = o.outerRadius - o.innerRadius
  const points: ScatterPoint[] = []
  const maxAttempts = o.count * 14

  let lastX = 0
  let lastZ = 0
  let attempts = 0

  while (points.length < o.count && attempts < maxAttempts) {
    attempts++
    let x: number
    let z: number

    if (points.length > 0 && rand() < clump) {
      const a = rand() * Math.PI * 2
      const d = clumpRadius * Math.sqrt(rand())
      x = lastX + Math.cos(a) * d
      z = lastZ + Math.sin(a) * d
    } else {
      const angle = rand() * Math.PI * 2
      const radius = o.innerRadius + span * Math.pow(rand(), bias > 0 ? 1 / (2 * bias) : 1)
      x = o.centerX + Math.cos(angle) * radius
      z = o.centerZ + Math.sin(angle) * radius
    }

    const r = Math.hypot(x - o.centerX, z - o.centerZ)
    if (r < o.innerRadius || r > o.outerRadius) continue
    if (o.reject(x, z)) continue

    points.push({ x, z })
    lastX = x
    lastZ = z
  }

  return points
}

export function makeTrunkGeometry(sides: number, heightSegments: number, taper: number, openEnded: boolean) {
  const geo = new THREE.CylinderGeometry(taper, 1, 1, sides, heightSegments, openEnded)
  geo.translate(0, 0.5, 0)

  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const y = THREE.MathUtils.clamp(pos.getY(i), 0, 1)
    const angle = Math.atan2(pos.getZ(i), pos.getX(i))
    const gradient = 0.3 + Math.pow(y, 0.55) * 0.95
    const strips = 0.9 + 0.1 * Math.sin(angle * 3.7 + 1.3) + 0.06 * Math.sin(angle * 9.1 - 0.7)
    const v = gradient * strips
    colors[i * 3] = v
    colors[i * 3 + 1] = v
    colors[i * 3 + 2] = v
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

function sweepTube(
  positions: number[],
  normals: number[],
  colors: number[],
  uvs: number[],
  indices: number[],
  segments: number,
  sides: number,
  path: (t: number) => [number, number, number],
  radius: (t: number) => number,
  shade: (t: number) => number,
) {
  const base = positions.length / 3
  const cols = sides + 1
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const [px, py, pz] = path(t)
    const [nx, ny, nz] = path(Math.min(t + 0.01, 1))
    const [bx, by, bz] = path(Math.max(t - 0.01, 0))
    let tx = nx - bx
    let ty = ny - by
    let tz = nz - bz
    const tl = Math.hypot(tx, ty, tz) || 1
    tx /= tl
    ty /= tl
    tz /= tl
    let ux = 1
    let uy = 0
    let uz = 0
    if (Math.abs(tx) > 0.9) {
      ux = 0
      uz = 1
    }
    let sx = uy * tz - uz * ty
    let sy = uz * tx - ux * tz
    let sz = ux * ty - uy * tx
    const sl = Math.hypot(sx, sy, sz) || 1
    sx /= sl
    sy /= sl
    sz /= sl
    const kx = ty * sz - tz * sy
    const ky = tz * sx - tx * sz
    const kz = tx * sy - ty * sx
    const r = radius(t)
    const tone = shade(t)
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const dx = sx * ca + kx * sa
      const dy = sy * ca + ky * sa
      const dz = sz * ca + kz * sa
      positions.push(px + dx * r, py + dy * r, pz + dz * r)
      normals.push(dx, dy, dz)
      colors.push(tone, tone, tone)
      uvs.push(j / sides, t)
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < sides; j++) {
      const a = base + i * cols + j
      const b = a + cols
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
}

export function makeBranchGeometry(seed: number, thickness: number, droop: number) {
  const rand = mulberry32(seed)
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const sway = (rand() - 0.5) * 0.18

  const main = (t: number): [number, number, number] => [sway * t * t, t, droop * t * t]
  sweepTube(positions, normals, colors, uvs, indices, 6, 6, main, (t) => thickness * (1 - 0.78 * t), (t) => 0.42 + 0.5 * (1 - t))

  const forkAt = 0.52 + rand() * 0.16
  const [fx, fy, fz] = main(forkAt)
  const side = rand() < 0.5 ? -1 : 1
  const spread = 0.3 + rand() * 0.22
  const length = 0.34 + rand() * 0.16
  const fork = (u: number): [number, number, number] => [
    fx + side * spread * u * length * 2.2,
    fy + u * length,
    fz + droop * 0.8 * u * u * length * 2.4,
  ]
  sweepTube(
    positions,
    normals,
    colors,
    uvs,
    indices,
    4,
    5,
    fork,
    (u) => thickness * (1 - 0.78 * forkAt) * (0.62 - 0.4 * u),
    (u) => 0.4 + 0.42 * (1 - u),
  )

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeBoundingSphere()
  return geo
}

export function makeFrondGeometry(planes: number, rows: number, bow: number) {
  const cols = 1
  const vertsPerPlane = (cols + 1) * (rows + 1)
  const total = vertsPerPlane * planes
  const positions = new Float32Array(total * 3)
  const normals = new Float32Array(total * 3)
  const uvs = new Float32Array(total * 2)
  const colors = new Float32Array(total * 3)
  const indices: number[] = []

  let v = 0
  for (let p = 0; p < planes; p++) {
    const a = (p / planes) * Math.PI
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const tone = 0.82 + (p / planes) * 0.3
    const base = v

    for (let row = 0; row <= rows; row++) {
      const ty = row / rows
      const lean = bow * ty * ty
      for (let col = 0; col <= cols; col++) {
        const tx = col / cols - 0.5
        const lx = tx
        const lz = lean * (tx >= 0 ? 1 : -1) * 0.35 + lean * 0.2
        const i3 = v * 3
        positions[i3] = lx * ca - lz * sa
        positions[i3 + 1] = ty
        positions[i3 + 2] = lx * sa + lz * ca
        const nx = -sa * 0.78
        const nz = ca * 0.78
        normals[i3] = nx
        normals[i3 + 1] = 0.62
        normals[i3 + 2] = nz
        const shade = (0.52 + ty * 0.48) * tone
        colors[i3] = shade
        colors[i3 + 1] = shade
        colors[i3 + 2] = shade
        const i2 = v * 2
        uvs[i2] = col / cols
        uvs[i2 + 1] = ty
        v++
      }
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const a0 = base + row * (cols + 1) + col
        const b0 = a0 + 1
        const c0 = a0 + (cols + 1)
        const d0 = c0 + 1
        indices.push(a0, c0, b0, b0, c0, d0)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeBoundingSphere()
  return geo
}

export function makeBladeGeometry(seed: number, blades: number, rows: number) {
  const rand = mulberry32(seed)
  const verts = blades * (rows + 1) * 2
  const positions = new Float32Array(verts * 3)
  const normals = new Float32Array(verts * 3)
  const colors = new Float32Array(verts * 3)
  const indices: number[] = []
  const up = new THREE.Vector3(0, 1, 0)
  const radial = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const normal = new THREE.Vector3()

  for (let b = 0; b < blades; b++) {
    const yaw = (b / blades) * Math.PI * 2 + rand() * 0.9
    const height = 0.58 + rand() * 0.42
    const width = 0.022 + rand() * 0.016
    const root = rand() * 0.05
    const lean = 0.12 + rand() * 0.26
    const tone = 0.78 + rand() * 0.26
    radial.set(Math.cos(yaw), 0, Math.sin(yaw))
    tangent.set(-Math.sin(yaw), 0, Math.cos(yaw))
    const base = b * (rows + 1) * 2

    for (let row = 0; row <= rows; row++) {
      const t = row / rows
      const half = width * Math.pow(1 - t, 0.7)
      const reach = root + lean * t * t
      normal.copy(radial).multiplyScalar(-height).addScaledVector(up, 2 * lean * t).normalize()
      const shade = (0.5 + t * 0.26) * tone

      for (let side = 0; side < 2; side++) {
        const idx = base + row * 2 + side
        const i3 = idx * 3
        const edge = side === 0 ? -half : half
        positions[i3] = radial.x * reach + tangent.x * edge
        positions[i3 + 1] = t * height
        positions[i3 + 2] = radial.z * reach + tangent.z * edge
        normals[i3] = normal.x
        normals[i3 + 1] = normal.y
        normals[i3 + 2] = normal.z
        colors[i3] = shade
        colors[i3 + 1] = shade
        colors[i3 + 2] = shade
      }

      if (row < rows) {
        const a = base + row * 2
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeBoundingSphere()
  return geo
}

export function makeBoulderGeometry(seed: number, detail: number) {
  const geo = new THREE.IcosahedronGeometry(1, detail)
  const rand = mulberry32(seed)
  const offsets = [rand() * 12, rand() * 12, rand() * 12]
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  const colors = new Float32Array(pos.count * 3)

  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i))
    const n =
      Math.sin(v.x * 2.3 + offsets[0]) * Math.cos(v.z * 2.1 + offsets[1]) * 0.22 +
      Math.sin(v.y * 3.7 + offsets[2]) * 0.1
    v.multiplyScalar(1 + n)
    v.y *= 0.72
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()

  const nrm = geo.attributes.normal
  for (let i = 0; i < pos.count; i++) {
    const up = THREE.MathUtils.clamp(nrm.getY(i), 0, 1)
    const moss = Math.pow(up, 1.6)
    colors[i * 3] = 0.42 + moss * 0.18
    colors[i * 3 + 1] = 0.5 + moss * 0.62
    colors[i * 3 + 2] = 0.44 + moss * 0.2
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeBoundingSphere()
  return geo
}

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas context unavailable')
  return { canvas, ctx }
}

function finishTexture(canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

export function makeFrondTexture(seed: number): THREE.CanvasTexture {
  const size = 256
  const { canvas, ctx } = makeCanvas(size, size)
  const rand = mulberry32(seed)
  ctx.clearRect(0, 0, size, size)

  const blades = 22
  for (let i = 0; i < blades; i++) {
    const t = i / (blades - 1)
    const spread = (t - 0.5) * 2
    const rootX = size * (0.5 + spread * 0.1)
    const tipX = size * (0.5 + spread * 0.46 + (rand() - 0.5) * 0.06)
    const tipY = size * (0.06 + Math.abs(spread) * 0.42 + rand() * 0.14)
    const ctrlX = size * (0.5 + spread * 0.2)
    const ctrlY = size * (0.22 + rand() * 0.16)
    const width = size * (0.026 + rand() * 0.03) * (1 - Math.abs(spread) * 0.35)

    const depth = 0.62 + rand() * 0.38
    const g = ctx.createLinearGradient(0, size, 0, tipY)
    g.addColorStop(0, `rgba(${Math.round(84 * depth)}, ${Math.round(104 * depth)}, ${Math.round(74 * depth)}, 1)`)
    g.addColorStop(0.55, `rgba(${Math.round(156 * depth)}, ${Math.round(178 * depth)}, ${Math.round(138 * depth)}, 1)`)
    g.addColorStop(1, `rgba(${Math.round(222 * depth)}, ${Math.round(236 * depth)}, ${Math.round(198 * depth)}, 1)`)
    ctx.strokeStyle = g
    ctx.lineCap = 'round'

    const passes = 5
    for (let p = 0; p < passes; p++) {
      const k = p / passes
      ctx.lineWidth = width * (1 - k)
      ctx.beginPath()
      ctx.moveTo(rootX, size)
      ctx.quadraticCurveTo(ctrlX, ctrlY, THREE.MathUtils.lerp(rootX, tipX, 0.25 + k * 0.75), THREE.MathUtils.lerp(size, tipY, 0.25 + k * 0.75))
      ctx.stroke()
    }
  }

  return finishTexture(canvas)
}
