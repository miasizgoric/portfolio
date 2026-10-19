import { useEffect, useLayoutEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { tiledTexture } from '@/lib/proceduralTextures'
import { SEA } from '@/lib/terrain'
import { GRADIENT_RANGE, PATCH_SIZE, WAVE_SIZE } from '@/world/seaData'
import type { World } from '@/world/useWorld'
import { useSkyClock } from '@/lib/sun'
import { useSkyProbe } from '@/lib/skyProbe'
import { useWeather } from '@/lib/weather'

const SIZE = 3200
const CENTER_Z = -(SEA.cliffFoot + SIZE / 2 - 40)

const HORIZON_FADE_START = 260
const HORIZON_FADE_END = 540

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

// The sea is the farthest thing in the scene; the scene fog would flatten most of it into the sky.
const SEA_FOG = `
#ifdef USE_FOG
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear * 2.0, fogFar * 2.6, vFogDepth));
  // The camera stops drawing at its far plane, which used to leave the sea ending in an edge.
  // Fading by view depth (the same measure the far plane clips by) dissolves the water into the sky along a straight horizon instead.
  gl_FragColor.a *= 1.0 - smoothstep(${HORIZON_FADE_START.toFixed(1)}, ${HORIZON_FADE_END.toFixed(1)}, vFogDepth);
#endif
`

// Night sea: the lit sky is near black, so the water would read as flat fog.
// A faint airglow sheen, strongest where the swell tilts the surface toward the viewer, keeps the waves visible.
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

export function Sea({ world }: { world: World }) {
  const weather = useWeather()
  const { sun } = useSkyClock()

  const waves = useMemo(() => tiledTexture(world.seaWaves, WAVE_SIZE, THREE.RGBAFormat, 8), [world])
  const patches = useMemo(() => tiledTexture(world.seaPatches, PATCH_SIZE, THREE.RGBAFormat, 1), [world])
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
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0, envMap: probe, transparent: true })
    // Fade the colour into whatever is behind but leave the framebuffer alpha alone.
    mat.blending = THREE.CustomBlending
    mat.blendSrc = THREE.SrcAlphaFactor
    mat.blendDst = THREE.OneMinusSrcAlphaFactor
    mat.blendSrcAlpha = THREE.ZeroFactor
    mat.blendDstAlpha = THREE.OneFactor
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
