import { useEffect, useLayoutEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SEA } from '@/lib/terrain'
import { mulberry32 } from '@/lib/noise'
import { useSkyClock } from '@/lib/sun'
import { useSkyProbe } from '@/lib/skyProbe'
import { useWeather } from '@/lib/weather'

const SIZE = 3200
const CENTER_Z = -(SEA.cliffFoot + SIZE / 2 - 40)

const WAVE_SIZE = 256
const PATCH_SIZE = 128
const GRADIENT_RANGE = 4

const LAYERS = [
  { tile: 7.3, angle: 0.35, speed: 1.1, heading: 0.42 },
  { tile: 18.9, angle: -1.05, speed: 1.7, heading: -0.38 },
  { tile: 63.7, angle: 2.2, speed: 2.6, heading: 0 },
]

const PATCH_LAYERS = [
  { tile: 173, angle: 0.6, speed: 0.35 },
  { tile: 71, angle: -1.3, speed: 0.6 },
]

const DEEP_NIGHT = new THREE.Color('#050d15')
const AIRGLOW = new THREE.Color('#0e1a2e')
const DEEP_DAY = new THREE.Color('#123a44')

interface Wave {
  kx: number
  ky: number
  amp: number
  phase: number
}

function makeWaves(count: number, seed: number, kMin: number, kMax: number, spread: number): Wave[] {
  const rand = mulberry32(seed)
  const waves: Wave[] = []
  const seen = new Set<number>()
  for (let guard = 0; waves.length < count && guard < count * 50; guard++) {
    const k = kMin + Math.pow(rand(), 1.7) * (kMax - kMin)
    const theta = (rand() * 2 - 1) * spread
    const kx = Math.round(Math.cos(theta) * k)
    const ky = Math.round(Math.sin(theta) * k)
    if (kx === 0 && ky === 0) continue
    const key = (kx + 512) * 1024 + (ky + 512)
    if (seen.has(key)) continue
    seen.add(key)
    const len = Math.hypot(kx, ky)
    waves.push({ kx, ky, amp: Math.pow(len, -1.55) * (0.55 + rand() * 0.9), phase: rand() * Math.PI * 2 })
  }
  return waves
}

function gradientField(size: number, waves: Wave[]): Float32Array {
  const out = new Float32Array(size * size * 2)
  const tau = Math.PI * 2
  const n = waves.length
  const cosU = new Float32Array(n * size)
  const sinU = new Float32Array(n * size)
  const cosV = new Float32Array(n * size)
  const sinV = new Float32Array(n * size)
  for (let i = 0; i < n; i++) {
    const w = waves[i]
    for (let t = 0; t < size; t++) {
      const a = (tau * w.kx * t) / size
      const b = (tau * w.ky * t) / size + w.phase
      cosU[i * size + t] = Math.cos(a)
      sinU[i * size + t] = Math.sin(a)
      cosV[i * size + t] = Math.cos(b)
      sinV[i * size + t] = Math.sin(b)
    }
  }

  let sum = 0
  for (let y = 0; y < size; y++) {
    const row = y * size * 2
    for (let i = 0; i < n; i++) {
      const w = waves[i]
      const scale = w.amp * tau
      const su = scale * w.kx
      const sv = scale * w.ky
      const cv = cosV[i * size + y]
      const snv = sinV[i * size + y]
      const base = i * size
      for (let x = 0; x < size; x++) {
        const c = cosU[base + x] * cv - sinU[base + x] * snv
        out[row + x * 2] += c * su
        out[row + x * 2 + 1] += c * sv
      }
    }
    for (let x = 0; x < size; x++) {
      const gu = out[row + x * 2]
      const gv = out[row + x * 2 + 1]
      sum += gu * gu + gv * gv
    }
  }
  const rms = Math.sqrt(sum / (size * size)) || 1
  for (let i = 0; i < out.length; i++) out[i] /= rms
  return out
}

function encodeGradient(value: number): number {
  const t = THREE.MathUtils.clamp(value / GRADIENT_RANGE, -1, 1)
  return Math.round((t * 0.5 + 0.5) * 255)
}

function makeWaveTexture(): THREE.DataTexture {
  const chop = gradientField(WAVE_SIZE, makeWaves(46, 71021, 3, 22, 1.25))
  const swell = gradientField(WAVE_SIZE, makeWaves(22, 93307, 2, 9, 0.38))
  const data = new Uint8Array(WAVE_SIZE * WAVE_SIZE * 4)
  for (let i = 0; i < WAVE_SIZE * WAVE_SIZE; i++) {
    data[i * 4] = encodeGradient(chop[i * 2])
    data[i * 4 + 1] = encodeGradient(chop[i * 2 + 1])
    data[i * 4 + 2] = encodeGradient(swell[i * 2])
    data[i * 4 + 3] = encodeGradient(swell[i * 2 + 1])
  }
  const tex = new THREE.DataTexture(data, WAVE_SIZE, WAVE_SIZE, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

function makePatchTexture(): THREE.DataTexture {
  const waves = makeWaves(14, 55117, 1, 5, Math.PI / 2)
  const tau = Math.PI * 2
  const height = new Float32Array(PATCH_SIZE * PATCH_SIZE)
  let lo = Infinity
  let hi = -Infinity
  for (let y = 0; y < PATCH_SIZE; y++) {
    for (let x = 0; x < PATCH_SIZE; x++) {
      let h = 0
      for (const w of waves) h += Math.sin(tau * ((w.kx * x) / PATCH_SIZE + (w.ky * y) / PATCH_SIZE) + w.phase) * w.amp
      height[y * PATCH_SIZE + x] = h
      if (h < lo) lo = h
      if (h > hi) hi = h
    }
  }
  const data = new Uint8Array(PATCH_SIZE * PATCH_SIZE * 4)
  for (let i = 0; i < height.length; i++) {
    const g = Math.round(((height[i] - lo) / (hi - lo)) * 255)
    data[i * 4] = g
    data[i * 4 + 1] = g
    data[i * 4 + 2] = g
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, PATCH_SIZE, PATCH_SIZE, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

const SEA_VERTEX_PARS = `
varying vec3 vSeaWorld;
`

const SEA_VERTEX = `
vSeaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`

const SEA_FRAGMENT_PARS = `
uniform sampler2D uWaves;
uniform sampler2D uPatches;
uniform vec4 uLayerA;
uniform vec4 uLayerB;
uniform vec4 uLayerC;
uniform vec4 uPatchA;
uniform vec4 uPatchB;
uniform vec3 uStrength;
uniform float uChop;
uniform vec3 uSheen;
varying vec3 vSeaWorld;

vec2 seaRotate(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

vec2 seaLayer(vec2 p, vec4 layer, bool swell) {
  vec2 uv = seaRotate(p, layer.w) / layer.z + layer.xy;
  vec4 t = texture2D(uWaves, uv);
  vec2 g = ((swell ? t.ba : t.rg) * 2.0 - 1.0) * ${GRADIENT_RANGE.toFixed(1)};
  return seaRotate(g, -layer.w);
}
`

const SEA_ROUGHNESS = `
vec2 seaP = vSeaWorld.xz;
float seaDist = length(vSeaWorld - cameraPosition);
float seaGust = texture2D(uPatches, seaRotate(seaP, uPatchA.w) / uPatchA.z + uPatchA.xy).r;
seaGust *= 0.55 + 0.9 * texture2D(uPatches, seaRotate(seaP, uPatchB.w) / uPatchB.z + uPatchB.xy).r;
seaGust = smoothstep(0.08, 0.95, seaGust);
float seaFine = 1.0 - smoothstep(70.0, 360.0, seaDist);
float seaMid = 1.0 - smoothstep(180.0, 900.0, seaDist);
float roughnessFactor = mix(0.05, 0.3, seaGust) + (1.0 - seaFine) * 0.07;
`

const SEA_NORMAL = `
{
  float gust = mix(0.5, 1.3, seaGust) * uChop;
  vec2 g = seaLayer(seaP, uLayerA, false) * uStrength.x * seaFine * gust;
  g += seaLayer(seaP, uLayerB, false) * uStrength.y * seaMid * gust;
  g += seaLayer(seaP, uLayerC, true) * uStrength.z * mix(0.7, 1.0, uChop);
  vec3 seaNormal = normalize(vec3(-g.x, 1.0, -g.y));
  normal = normalize((viewMatrix * vec4(seaNormal, 0.0)).xyz);
}
`

// Night sea: the lit sky is near black, so the water would read as flat fog. A faint airglow
// sheen, strongest where the swell tilts the surface toward the viewer, keeps the waves visible.
// The sea is the farthest thing in the scene; the scene fog would flatten most of it into the sky.
const SEA_FOG = `
#ifdef USE_FOG
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear * 2.0, fogFar * 2.6, vFogDepth));
#endif
`

const SEA_SHEEN = `
#include <emissivemap_fragment>
{
  vec3 seaView = normalize(vViewPosition);
  float seaFacing = clamp(dot(normal, seaView), 0.0, 1.0);
  float seaGrazing = pow(1.0 - seaFacing, 2.2);
  float seaFade = 1.0 - smoothstep(120.0, 1100.0, seaDist);
  totalEmissiveRadiance += uSheen * (0.35 + 0.65 * seaGrazing) * (0.55 + 0.9 * seaGust) * (0.7 + 0.3 * seaFade);
}
`

function drift(target: THREE.Vector4, windX: number, windZ: number, speed: number, heading: number, delta: number) {
  const c = Math.cos(heading)
  const s = Math.sin(heading)
  const wx = (c * windX - s * windZ) * speed * delta
  const wz = (s * windX + c * windZ) * speed * delta
  const ca = Math.cos(target.w)
  const sa = Math.sin(target.w)
  target.x = (target.x - (ca * wx - sa * wz) / target.z) % 1
  target.y = (target.y - (sa * wx + ca * wz) / target.z) % 1
}

export function Sea() {
  const weather = useWeather()
  const { sun } = useSkyClock()

  const waves = useMemo(() => makeWaveTexture(), [])
  const patches = useMemo(() => makePatchTexture(), [])
  const probe = useSkyProbe()

  const uniforms = useMemo(
    () => ({
      uWaves: { value: waves },
      uPatches: { value: patches },
      uLayerA: { value: new THREE.Vector4(0, 0, LAYERS[0].tile, LAYERS[0].angle) },
      uLayerB: { value: new THREE.Vector4(0, 0, LAYERS[1].tile, LAYERS[1].angle) },
      uLayerC: { value: new THREE.Vector4(0, 0, LAYERS[2].tile, LAYERS[2].angle) },
      uPatchA: { value: new THREE.Vector4(0, 0, PATCH_LAYERS[0].tile, PATCH_LAYERS[0].angle) },
      uPatchB: { value: new THREE.Vector4(0, 0, PATCH_LAYERS[1].tile, PATCH_LAYERS[1].angle) },
      uStrength: { value: new THREE.Vector3(0.17, 0.12, 0.07) },
      uChop: { value: 1 },
      uSheen: { value: new THREE.Vector3() },
    }),
    [waves, patches],
  )

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0, envMap: probe })
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${SEA_VERTEX_PARS}`)
        .replace('#include <fog_vertex>', `#include <fog_vertex>\n${SEA_VERTEX}`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${SEA_FRAGMENT_PARS}`)
        .replace('#include <roughnessmap_fragment>', SEA_ROUGHNESS)
        .replace('#include <normal_fragment_maps>', SEA_NORMAL)
        .replace('#include <emissivemap_fragment>', SEA_SHEEN)
        .replace('#include <fog_fragment>', SEA_FOG)
    }
    return mat
  }, [probe, uniforms])

  useLayoutEffect(() => {
    material.color.copy(DEEP_NIGHT).lerp(DEEP_DAY, sun.dayFactor)
    uniforms.uSheen.value.set(AIRGLOW.r, AIRGLOW.g, AIRGLOW.b).multiplyScalar(sun.nightFactor * (1 - sun.dayFactor))
  }, [material, uniforms, sun.dayFactor, sun.nightFactor])

  useEffect(() => {
    return () => {
      waves.dispose()
      patches.dispose()
      material.dispose()
    }
  }, [waves, patches, material])

  useFrame((_, delta) => {
    const step = Math.min(delta, 0.1)
    const wind = Math.min(weather.windSpeed, 18)
    const pace = 0.55 + wind * 0.06
    const windX = Math.sin(weather.windDirection) * pace
    const windZ = -Math.cos(weather.windDirection) * pace
    drift(uniforms.uLayerA.value, windX, windZ, LAYERS[0].speed, LAYERS[0].heading, step)
    drift(uniforms.uLayerB.value, windX, windZ, LAYERS[1].speed, LAYERS[1].heading, step)
    drift(uniforms.uLayerC.value, windX, windZ, LAYERS[2].speed, LAYERS[2].heading, step)
    drift(uniforms.uPatchA.value, windX, windZ, PATCH_LAYERS[0].speed, 0, step)
    drift(uniforms.uPatchB.value, windX, windZ, PATCH_LAYERS[1].speed, 0.5, step)
    uniforms.uChop.value = 0.35 + wind * 0.07
  })

  return (
    <mesh position={[0, SEA.level, CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[SIZE, SIZE]} />
    </mesh>
  )
}
