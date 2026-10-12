import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SUN_DISTANCE, useSkyClock } from '@/lib/sun'

const SUN_WARM = new THREE.Color('#ffd7a8')
const SUN_NOON = new THREE.Color('#fff6e8')
const MOON_TONE = new THREE.Color('#9db6e0')

const SKY_NIGHT = new THREE.Color('#8fb0e8')
const SKY_DUSK = new THREE.Color('#e8a878')
const SKY_DAY = new THREE.Color('#b8d4f0')
const EARTH_NIGHT = new THREE.Color('#10161f')
const EARTH_DAY = new THREE.Color('#38452a')
const SHADOW_EVERY = 3

export function Lighting() {
  const { sun, moon } = useSkyClock()
  const key = useRef<THREE.DirectionalLight>(null)
  const tick = useRef(0)

  const nightKey = sun.nightFactor > 0.5
  const keyDir = nightKey ? moon.position : sun.position
  const keyColor = nightKey ? MOON_TONE : SUN_WARM.clone().lerp(SUN_NOON, sun.dayFactor)
  const moonlit = (0.04 + moon.light * 0.96) * sun.nightFactor
  const keyIntensity = sun.dayFactor * 3.2 + sun.goldenFactor * 0.9 + moonlit * 1.56

  const skyColor = SKY_NIGHT.clone().lerp(SKY_DUSK, sun.twilightFactor).lerp(SKY_DAY, sun.dayFactor)
  const earthColor = EARTH_NIGHT.clone().lerp(EARTH_DAY, sun.dayFactor)
  const skyFill = 0.54 + sun.twilightFactor * 0.32 + sun.dayFactor * 0.56
  const ambient = 0.05 + sun.twilightFactor * 0.08 + sun.dayFactor * 0.1

  useFrame(({ gl }) => {
    tick.current = (tick.current + 1) % SHADOW_EVERY
    gl.shadowMap.needsUpdate = tick.current === 0

    const light = key.current
    if (!light) return
    light.position.set(keyDir[0] * SUN_DISTANCE, Math.max(keyDir[1], 0.02) * SUN_DISTANCE, keyDir[2] * SUN_DISTANCE)
    light.target.position.set(0, 0, -1)
    light.target.updateMatrixWorld()
  })

  return (
    <>
      <hemisphereLight args={[skyColor, earthColor, skyFill]} />
      <ambientLight intensity={ambient} color={skyColor} />
      <directionalLight
        ref={key}
        intensity={keyIntensity}
        color={keyColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
      />
    </>
  )
}
