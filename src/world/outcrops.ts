import * as THREE from 'three'
import { makeBoulderGeometry } from '@/lib/grove'
import type { TerrainField } from '@/lib/terrain'

export interface BoulderArrays {
  position: Float32Array
  normal: Float32Array
  uv: Float32Array
  color: Float32Array
  matrix: number[]
}

export function buildOutcropArrays(field: TerrainField): BoulderArrays[] {
  const bodies: BoulderArrays[] = []
  const matrix = new THREE.Matrix4()
  const quat = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const pos = new THREE.Vector3()
  const scale = new THREE.Vector3()

  for (const outcrop of field.outcrops) {
    for (let b = 0; b < outcrop.bodies; b++) {
      const seed = outcrop.seed + b * 977
      const angle = (b / outcrop.bodies) * Math.PI * 2 + outcrop.spin
      const spread = outcrop.radius * (0.18 + ((seed % 53) / 53) * 0.5)
      const x = outcrop.x + Math.cos(angle) * spread
      const z = outcrop.z + Math.sin(angle) * spread
      const size = outcrop.rise * (0.55 + ((seed % 31) / 31) * 0.75)

      pos.set(x, field.height(x, z) + size * 0.32, z)
      euler.set(outcrop.tilt * 0.6, angle + outcrop.spin, outcrop.tilt)
      quat.setFromEuler(euler)
      scale.set(size, size * (0.62 + ((seed % 17) / 17) * 0.4), size)

      const geometry = makeBoulderGeometry(seed, 2)
      bodies.push({
        position: geometry.attributes.position.array as Float32Array,
        normal: geometry.attributes.normal.array as Float32Array,
        uv: geometry.attributes.uv.array as Float32Array,
        color: geometry.attributes.color.array as Float32Array,
        matrix: matrix.compose(pos, quat, scale).toArray(),
      })
    }
  }
  return bodies
}
