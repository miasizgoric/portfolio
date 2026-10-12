import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { tileable } from '@/lib/proceduralTextures'
import { clamp01, fbm2, makeNoise2D, ridged2 } from '@/lib/terrainNoise'
import { useSkyClock } from '@/lib/sun'
import { useWeather } from '@/lib/weather'

const SIZE = 1200
const HEIGHT = 235
const TEX = 256

const LIT_NIGHT = new THREE.Color('#2f3a52')
const LIT_DUSK = new THREE.Color('#f6c9a0')
const LIT_DAY = new THREE.Color('#fbf7f0')
const SHADE_NIGHT = new THREE.Color('#10151f')
const SHADE_DUSK = new THREE.Color('#6d5668')
const SHADE_DAY = new THREE.Color('#93a3b6')

function makeCloudTexture(): THREE.DataTexture {
  const soft = makeNoise2D(60617)
  const wisp = makeNoise2D(71723)
  const data = new Uint8Array(TEX * TEX)
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const u = x / TEX
      const v = y / TEX
      const body = tileable(u, v, (a, b) => fbm2(soft, a * 3.1, b * 3.1, 4) * 0.5 + 0.5)
      const wisps = tileable(u, v, (a, b) => ridged2(wisp, a * 7.3, b * 7.3, 3))
      data[y * TEX + x] = clamp01(body * 0.78 + wisps * 0.3 - 0.06) * 255
    }
  }
  const tex = new THREE.DataTexture(data, TEX, TEX, THREE.RedFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

const CLOUD_VERTEX = `
varying vec2 vCloudUv;
void main() {
  vCloudUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const CLOUD_FRAGMENT = `
uniform sampler2D uMap;
uniform vec2 uDriftA;
uniform vec2 uDriftB;
uniform float uCover;
uniform float uOpacity;
uniform vec3 uLit;
uniform vec3 uShade;
varying vec2 vCloudUv;

void main() {
  float a = texture2D(uMap, vCloudUv * 2.6 + uDriftA).r;
  float b = texture2D(uMap, vCloudUv * 6.1 + uDriftB).r;
  float density = a * 0.68 + b * 0.32;

  float mask = smoothstep(uCover, uCover + 0.17, density);
  float edgeFade = 1.0 - smoothstep(0.3, 0.49, length(vCloudUv - 0.5));
  float alpha = mask * edgeFade * uOpacity;
  if (alpha < 0.004) discard;

  float thickness = smoothstep(uCover, uCover + 0.46, density);
  vec3 color = mix(uLit, uShade, thickness * 0.85);

  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const lit = new THREE.Color()
const shade = new THREE.Color()

export function CloudLayer() {
  const { sun } = useSkyClock()
  const weather = useWeather()
  const mesh = useRef<THREE.Mesh>(null)
  const texture = useMemo(() => makeCloudTexture(), [])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: CLOUD_VERTEX,
        fragmentShader: CLOUD_FRAGMENT,
        uniforms: {
          uMap: { value: texture },
          uDriftA: { value: new THREE.Vector2() },
          uDriftB: { value: new THREE.Vector2(0.37, 0.12) },
          uCover: { value: 0.6 },
          uOpacity: { value: 0.85 },
          uLit: { value: new THREE.Color() },
          uShade: { value: new THREE.Color() },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    [texture],
  )

  useLayoutEffect(() => {
    lit.copy(LIT_NIGHT).lerp(LIT_DUSK, sun.twilightFactor).lerp(LIT_DAY, sun.dayFactor)
    shade.copy(SHADE_NIGHT).lerp(SHADE_DUSK, sun.twilightFactor).lerp(SHADE_DAY, sun.dayFactor)
    material.uniforms.uLit.value.copy(lit)
    material.uniforms.uShade.value.copy(shade)
    material.uniforms.uCover.value = 0.74 - weather.cloudCover * 0.52
    material.uniforms.uOpacity.value = 0.42 + weather.cloudCover * 0.5
  }, [material, sun.dayFactor, sun.twilightFactor, weather.cloudCover])

  useEffect(() => {
    return () => {
      texture.dispose()
      material.dispose()
    }
  }, [texture, material])

  useFrame(({ camera }, delta) => {
    if (mesh.current) mesh.current.position.set(camera.position.x, HEIGHT, camera.position.z)
    const step = Math.min(delta, 0.1)
    const pace = (0.0016 + Math.min(weather.windSpeed, 20) * 0.00035) * step
    const wx = Math.sin(weather.windDirection) * pace
    const wz = -Math.cos(weather.windDirection) * pace
    const a = material.uniforms.uDriftA.value
    const b = material.uniforms.uDriftB.value
    a.set((a.x + wx) % 1, (a.y + wz) % 1)
    b.set((b.x + wx * 1.7) % 1, (b.y + wz * 1.7) % 1)
  })

  return (
    <mesh ref={mesh} position={[0, HEIGHT, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material} frustumCulled={false}>
      <planeGeometry args={[SIZE, SIZE]} />
    </mesh>
  )
}
