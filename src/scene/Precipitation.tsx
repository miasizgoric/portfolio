import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from '@/lib/noise'
import { useWeather, type Precipitation as Kind } from '@/lib/weather'

const AREA = 46
const TOP = 26
const MAX_PARTICLES = 5000

interface Profile {
  count: number
  fallSpeed: number
  size: number
  colour: string
  opacity: number
  drift: number
  stretch: number
}

function profileFor(kind: Kind, intensity: number, wind: number): Profile | null {
  if (kind === 'none' || intensity <= 0) return null

  switch (kind) {
    case 'snow':
      return {
        count: Math.round(MAX_PARTICLES * (0.3 + intensity * 0.7)),
        fallSpeed: 1.1 + wind * 0.05,
        size: 0.09,
        colour: '#f2f6ff',
        opacity: 0.85,
        drift: 1,
        stretch: 1,
      }
    case 'sleet':
      return {
        count: Math.round(MAX_PARTICLES * (0.4 + intensity * 0.6)),
        fallSpeed: 6 + wind * 0.2,
        size: 0.06,
        colour: '#dfe9f2',
        opacity: 0.7,
        drift: 0.4,
        stretch: 3,
      }
    case 'drizzle':
      return {
        count: Math.round(MAX_PARTICLES * (0.25 + intensity * 0.35)),
        fallSpeed: 7,
        size: 0.025,
        colour: '#c9d6de',
        opacity: 0.35,
        drift: 0.15,
        stretch: 4,
      }
    default:
      return {
        count: Math.round(MAX_PARTICLES * (0.45 + intensity * 0.55)),
        fallSpeed: 13 + wind * 0.3,
        size: 0.035,
        colour: '#cdd9e2',
        opacity: 0.5,
        drift: 0.1,
        stretch: 7,
      }
  }
}

export function Precipitation() {
  const weather = useWeather()
  const profile = profileFor(weather.precipitation, weather.intensity, weather.windSpeed)

  const group = useRef<THREE.Group>(null)
  const mesh = useRef<THREE.InstancedMesh>(null)

  const seeds = useMemo(() => {
    const rand = mulberry32(5150)
    return Array.from({ length: MAX_PARTICLES }, () => ({
      x: (rand() - 0.5) * AREA,
      y: rand() * TOP,
      z: (rand() - 0.5) * AREA,
      phase: rand() * Math.PI * 2,
      speed: 0.75 + rand() * 0.5,
    }))
  }, [])

  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
      }),
    [],
  )

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useEffect(() => {
    if (!profile) return
    material.color.set(profile.colour)
    material.opacity = profile.opacity
  }, [profile, material])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(({ camera, clock }, delta) => {
    const instanced = mesh.current
    if (!instanced || !profile) return

    group.current?.position.set(camera.position.x, 0, camera.position.z)

    const t = clock.elapsedTime
    const windX = Math.sin(weather.windDirection) * weather.windSpeed * 0.35
    const windZ = -Math.cos(weather.windDirection) * weather.windSpeed * 0.35
    const count = Math.min(profile.count, MAX_PARTICLES)

    for (let i = 0; i < count; i++) {
      const s = seeds[i]
      const fall = profile.fallSpeed * s.speed

      s.y -= fall * delta
      s.x += windX * delta
      s.z += windZ * delta
      if (s.y < 0) {
        s.y += TOP
        s.x = (Math.random() - 0.5) * AREA
        s.z = (Math.random() - 0.5) * AREA
      }
      if (s.x > AREA / 2) s.x -= AREA
      else if (s.x < -AREA / 2) s.x += AREA
      if (s.z > AREA / 2) s.z -= AREA
      else if (s.z < -AREA / 2) s.z += AREA

      const wobble = profile.drift * Math.sin(t * 1.4 + s.phase) * 0.6
      dummy.position.set(s.x + wobble, s.y, s.z + wobble * 0.7)
      dummy.rotation.set(0, -weather.windDirection, 0)
      dummy.scale.set(profile.size, profile.size * profile.stretch, profile.size)
      dummy.updateMatrix()
      instanced.setMatrixAt(i, dummy.matrix)
    }

    instanced.count = count
    instanced.instanceMatrix.needsUpdate = true
  })

  if (!profile) return null

  return (
    <group ref={group}>
      <instancedMesh
        ref={mesh}
        args={[geometry, material, MAX_PARTICLES]}
        frustumCulled={false}
        renderOrder={3}
      />
    </group>
  )
}
