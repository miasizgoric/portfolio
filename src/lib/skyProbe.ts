import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useSkyClock, type MoonState, type SunState } from './sun'

const ENV_W = 256
const ENV_H = 128

const ZENITH_NIGHT = new THREE.Color('#38548f')
const ZENITH_DUSK = new THREE.Color('#33407a')
const ZENITH_DAY = new THREE.Color('#4a7ad0')
const HORIZON_NIGHT = new THREE.Color('#5f7db8')
const HORIZON_DUSK = new THREE.Color('#e08a4a')
const HORIZON_DAY = new THREE.Color('#cddcea')
const NADIR_NIGHT = new THREE.Color('#05090f')
const NADIR_DAY = new THREE.Color('#1d2a2e')
const SUN_GLOW = new THREE.Color('#fff0d0')
const MOON_GLOW = new THREE.Color('#cfe0ff')

const zenith = new THREE.Color()
const horizon = new THREE.Color()
const nadir = new THREE.Color()
const glowTint = new THREE.Color()

function paintSkyProbe(data: Uint16Array, sun: SunState, moon: MoonState) {
  const gain = 0.6 + sun.twilightFactor * 0.5 + sun.dayFactor * 1.25
  zenith.copy(ZENITH_NIGHT).lerp(ZENITH_DUSK, sun.twilightFactor).lerp(ZENITH_DAY, sun.dayFactor).multiplyScalar(gain)
  horizon.copy(HORIZON_NIGHT).lerp(HORIZON_DUSK, sun.twilightFactor).lerp(HORIZON_DAY, sun.dayFactor).multiplyScalar(gain)
  nadir.copy(NADIR_NIGHT).lerp(NADIR_DAY, sun.dayFactor).multiplyScalar(gain)

  const night = sun.nightFactor > 0.5
  const glowDir = night ? moon.position : sun.position
  glowTint.copy(night ? MOON_GLOW : SUN_GLOW)
  const glowGain = night ? moon.light * 2.2 : 0.6 + sun.dayFactor * 4.6

  const toHalf = THREE.DataUtils.toHalfFloat
  for (let y = 0; y < ENV_H; y++) {
    const dirY = Math.sin(((y + 0.5) / ENV_H - 0.5) * Math.PI)
    const ring = Math.sqrt(Math.max(0, 1 - dirY * dirY))
    const above = dirY >= 0
    const blend = above ? Math.pow(dirY, 0.55) : Math.min(-dirY * 2.4, 1)
    const far = above ? zenith : nadir
    const r0 = horizon.r + (far.r - horizon.r) * blend
    const g0 = horizon.g + (far.g - horizon.g) * blend
    const b0 = horizon.b + (far.b - horizon.b) * blend

    for (let x = 0; x < ENV_W; x++) {
      const theta = ((x + 0.5) / ENV_W - 0.5) * Math.PI * 2
      const cosGlow =
        Math.cos(theta) * ring * glowDir[0] + dirY * glowDir[1] + Math.sin(theta) * ring * glowDir[2]
      const halo = cosGlow > 0 ? Math.pow(cosGlow, 14) * glowGain : 0
      const i = (y * ENV_W + x) * 4
      data[i] = toHalf(r0 + glowTint.r * halo)
      data[i + 1] = toHalf(g0 + glowTint.g * halo)
      data[i + 2] = toHalf(b0 + glowTint.b * halo)
      data[i + 3] = toHalf(1)
    }
  }
}

export function useSkyProbe(): THREE.DataTexture {
  const { sun, moon } = useSkyClock()

  const probe = useMemo(() => {
    const tex = new THREE.DataTexture(
      new Uint16Array(ENV_W * ENV_H * 4),
      ENV_W,
      ENV_H,
      THREE.RGBAFormat,
      THREE.HalfFloatType,
    )
    tex.mapping = THREE.EquirectangularReflectionMapping
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    return tex
  }, [])

  useEffect(() => {
    paintSkyProbe(probe.image.data as Uint16Array, sun, moon)
    probe.needsUpdate = true
    probe.needsPMREMUpdate = true
  }, [probe, sun, moon])

  useEffect(() => () => probe.dispose(), [probe])

  return probe
}
