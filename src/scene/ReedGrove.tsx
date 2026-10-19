import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  applyWind,
  makeBladeGeometry,
  makeBranchGeometry,
  makeFrondGeometry,
  makeFrondTexture,
  makeTrunkGeometry,
  windUniform,
} from '@/lib/grove'
import { useWeather } from '@/lib/weather'
import { CHUNKS, type ChunkArrays, type ChunkOptions } from '@/world/grove'
import type { World } from '@/world/useWorld'

const BARK_NORMAL_SCALE = new THREE.Vector2(1.4, 1.4)

// Wind sways geometry by up to about a metre beyond its rest bounds.
const WIND_MARGIN = 1.5

// One InstancedMesh per grid cell so the renderer can cull whole patches instead of drawing every instance in the world each frame (and again in the shadow pass).
function toInstancedChunks(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  chunks: ChunkArrays[],
  options: ChunkOptions,
): THREE.Group {
  const group = new THREE.Group()
  for (const chunk of chunks) {
    const mesh = new THREE.InstancedMesh(geometry, material, chunk.count)
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(chunk.matrices, 16)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(chunk.colors, 3)
    mesh.computeBoundingSphere()
    if (mesh.boundingSphere) mesh.boundingSphere.radius += WIND_MARGIN
    mesh.castShadow = options.castShadow ?? false
    mesh.receiveShadow = options.receiveShadow ?? false
    group.add(mesh)
  }
  return group
}

function disposeChunks(group: THREE.Group) {
  for (const child of group.children) (child as THREE.InstancedMesh).dispose()
}

export function ReedGrove({ world }: { world: World }) {
  const weather = useWeather()
  const frondTexture = useMemo(() => makeFrondTexture(21), [])
  const bark = world.rockTextures

  const meshes = useMemo(() => {
    const data = world.grove
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

    const trunks = toInstancedChunks(makeTrunkGeometry(10, 7, 0.42, true), trunkMaterial, data.trunks, CHUNKS.trunks)

    const flares = toInstancedChunks(makeTrunkGeometry(10, 2, 0.32, true), trunkMaterial, data.flares, CHUNKS.flares)

    const branches = toInstancedChunks(makeBranchGeometry(9173, 0.034, 0.36), trunkMaterial, data.branches, CHUNKS.branches)

    const canopy = toInstancedChunks(makeFrondGeometry(3, 5, 0.7), canopyMaterial, data.canopy, CHUNKS.canopy)

    const fronds = toInstancedChunks(makeFrondGeometry(3, 5, 0.55), frondMaterial, data.fronds, CHUNKS.fronds)

    const blades = toInstancedChunks(makeBladeGeometry(7319, 12, 3), bladeMaterial, data.blades, CHUNKS.blades)

    const farTrunks = toInstancedChunks(makeTrunkGeometry(10, 7, 0.42, true), trunkMaterial, data.farTrunks, CHUNKS.farTrunks)

    const farCanopy = toInstancedChunks(makeFrondGeometry(3, 5, 0.7), canopyMaterial, data.farCanopy, CHUNKS.farCanopy)

    return { trunks, farTrunks, flares, branches, canopy, farCanopy, fronds, blades }
  }, [frondTexture, bark, world])

  useEffect(() => {
    return () => {
      for (const group of Object.values(meshes)) {
        const first = group.children[0] as THREE.InstancedMesh | undefined
        first?.geometry.dispose()
        ;(first?.material as THREE.Material | undefined)?.dispose()
        disposeChunks(group)
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
      <primitive object={meshes.farTrunks} />
      <primitive object={meshes.flares} />
      <primitive object={meshes.branches} />
      <primitive object={meshes.canopy} />
      <primitive object={meshes.farCanopy} />
      <primitive object={meshes.fronds} />
      <primitive object={meshes.blades} />
    </group>
  )
}
