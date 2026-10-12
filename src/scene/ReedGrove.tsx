import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  applyWind,
  createInstanceWriter,
  distanceToFootprint,
  makeBladeGeometry,
  makeBranchGeometry,
  makeFrondGeometry,
  makeFrondTexture,
  makeTrunkGeometry,
  scatter,
  windUniform,
  type InstanceBuffer,
} from '@/lib/grove'
import { mulberry32 } from '@/lib/noise'
import { getRockTextures } from '@/lib/proceduralTextures'
import { FOOTPRINT, SEA, getTerrainField } from '@/lib/terrain'
import { useWeather } from '@/lib/weather'

const CLEARANCE = 2.6
const BARK_NORMAL_SCALE = new THREE.Vector2(1.4, 1.4)

const PATH_CLEARANCE = 0.05
const ENTRANCE = { minX: -4.2, maxX: 4.2, minZ: 8.5, maxZ: 19 }

const MAX_SLOPE = 0.42
const BRINK_RADIUS = 3
const MAX_BRINK_DROP = 2.5
const BRINK_RING = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2
  return [Math.cos(a) * BRINK_RADIUS, Math.sin(a) * BRINK_RADIUS]
})

interface Layer {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  buffer: InstanceBuffer
}

function toInstancedMesh({ geometry, material, buffer }: Layer): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, buffer.count)
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const euler = new THREE.Euler(0, 0, 0, 'YXZ')
  const scale = new THREE.Vector3()
  const color = new THREE.Color()

  for (let i = 0; i < buffer.count; i++) {
    const o = i * 3
    position.set(buffer.position[o], buffer.position[o + 1], buffer.position[o + 2])
    euler.set(buffer.rotation[o], buffer.rotation[o + 1], buffer.rotation[o + 2])
    quaternion.setFromEuler(euler)
    scale.set(buffer.scale[o], buffer.scale[o + 1], buffer.scale[o + 2])
    mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale))
    if (buffer.color) {
      color.setRGB(buffer.color[o], buffer.color[o + 1], buffer.color[o + 2])
      mesh.setColorAt(i, color)
    }
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.frustumCulled = false
  return mesh
}

function buildGrove() {
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

  const trunkWriter = createInstanceWriter(2600, true)
  const flareWriter = createInstanceWriter(1000, true)
  const branchWriter = createInstanceWriter(6400, true)
  const canopyWriter = createInstanceWriter(20000, true)
  const trunkColor = new THREE.Color()
  const leafColor = new THREE.Color()

  const bands = [
    { count: 900, inner: 11, outer: 72, seed: 8101, minH: 9, varH: 8, minR: 0.1, varR: 0.12, near: true },
    { count: 1500, inner: 70, outer: 210, seed: 9203, minH: 12, varH: 11, minR: 0.13, varR: 0.16, near: false },
  ]

  for (const band of bands) {
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
      }

      if (band.near) {
        const branches = 5 + Math.floor(r() * 4)
        for (let b = 0; b < branches; b++) {
          const angle = (b / branches) * Math.PI * 2 + r() * 0.8
          const along = 0.44 + (b / branches) * 0.44 + r() * 0.08
          const tilt = Math.PI * (0.2 + (1 - along) * 0.3 + r() * 0.08)
          const len = height * (0.13 + (1 - along) * 0.2 + r() * 0.07)
          const y = baseY + height * along
          branchWriter.push(p.x, y, p.z, tilt, angle, 0, len, len, len, trunkColor)

          const tipY = len * (Math.cos(tilt) - 0.36 * Math.sin(tilt))
          const tipR = len * (Math.sin(tilt) + 0.36 * Math.cos(tilt)) * 0.82
          const size = len * (0.68 + r() * 0.42)
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

  const frondWriter = createInstanceWriter(2200, true)
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

  const bladeWriter = createInstanceWriter(14500, true)
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
    trunks: trunkWriter.finish(),
    flares: flareWriter.finish(),
    branches: branchWriter.finish(),
    canopy: canopyWriter.finish(),
    fronds: frondWriter.finish(),
    blades: bladeWriter.finish(),
  }
}

export function ReedGrove() {
  const weather = useWeather()
  const frondTexture = useMemo(() => makeFrondTexture(21), [])
  const bark = useMemo(() => getRockTextures(), [])

  const meshes = useMemo(() => {
    const data = buildGrove()

    const trunkMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      normalMap: bark.normalMap,
      roughnessMap: bark.roughnessMap,
      normalScale: BARK_NORMAL_SCALE,
      roughness: 0.94,
      metalness: 0,
    })
    applyWind(trunkMaterial, 'grove-trunk', { amplitude: 0.09, speed: 0.55, stiffness: 2.4 })

    const frondMaterial = new THREE.MeshStandardMaterial({
      map: frondTexture,
      vertexColors: true,
      roughness: 0.82,
      metalness: 0,
      transparent: true,
      alphaTest: 0.42,
      side: THREE.DoubleSide,
    })
    applyWind(frondMaterial, 'grove-frond', { amplitude: 0.16, speed: 0.95, stiffness: 1.5, translucency: 0.9 })

    const bladeMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    applyWind(bladeMaterial, 'grove-blade', { amplitude: 0.1, speed: 1.35, stiffness: 1.2, translucency: 0.7 })

    const canopyMaterial = new THREE.MeshStandardMaterial({
      map: frondTexture,
      vertexColors: true,
      roughness: 0.78,
      metalness: 0,
      transparent: true,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
    })
    applyWind(canopyMaterial, 'grove-canopy', { amplitude: 0.09, speed: 0.55, stiffness: 2.4, translucency: 1 })

    const trunks = toInstancedMesh({
      geometry: makeTrunkGeometry(10, 7, 0.42, true),
      material: trunkMaterial,
      buffer: data.trunks,
    })
    trunks.castShadow = true

    const flares = toInstancedMesh({
      geometry: makeTrunkGeometry(10, 2, 0.32, true),
      material: trunkMaterial,
      buffer: data.flares,
    })
    flares.receiveShadow = true

    const branches = toInstancedMesh({
      geometry: makeBranchGeometry(9173, 0.034, 0.36),
      material: trunkMaterial,
      buffer: data.branches,
    })

    const canopy = toInstancedMesh({
      geometry: makeFrondGeometry(3, 5, 0.7),
      material: canopyMaterial,
      buffer: data.canopy,
    })
    canopy.castShadow = true

    const fronds = toInstancedMesh({
      geometry: makeFrondGeometry(3, 5, 0.55),
      material: frondMaterial,
      buffer: data.fronds,
    })

    const blades = toInstancedMesh({
      geometry: makeBladeGeometry(7319, 12, 3),
      material: bladeMaterial,
      buffer: data.blades,
    })

    return { trunks, flares, branches, canopy, fronds, blades }
  }, [frondTexture, bark])

  useEffect(() => {
    return () => {
      for (const mesh of Object.values(meshes)) {
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
        mesh.dispose()
      }
      frondTexture.dispose()
    }
  }, [meshes, frondTexture, bark])

  useFrame((state) => {
    windUniform.value = state.clock.elapsedTime * (0.08 + Math.min(weather.windSpeed, 18) * 0.11)
  })

  return (
    <group>
      <primitive object={meshes.trunks} />
      <primitive object={meshes.flares} />
      <primitive object={meshes.branches} />
      <primitive object={meshes.canopy} />
      <primitive object={meshes.fronds} />
      <primitive object={meshes.blades} />
    </group>
  )
}
