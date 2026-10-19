import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import * as THREE from 'three'
import { rooms } from '@/data/rooms'
import { isIndoors } from '@/lib/collision'
import { useSkyClock } from '@/lib/sun'
import { mulberry32 } from '@/lib/noise'

const STAR_COUNT = 1800
const STAR_RADIUS = 480
const MOON_RADIUS = 440
const MOON_SIZE = 7.8
const EYE_ADAPTATION = 2.5

function buildStarField() {
  const rand = mulberry32(20260918)
  const positions = new Float32Array(STAR_COUNT * 3)
  const colors = new Float32Array(STAR_COUNT * 3)
  const color = new THREE.Color()

  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = rand() * Math.PI * 2
    const phi = Math.acos(Math.pow(rand(), 1.7))
    const y = Math.cos(phi)
    const ring = Math.sin(phi)

    positions[i * 3] = Math.cos(theta) * ring * STAR_RADIUS
    positions[i * 3 + 1] = y * STAR_RADIUS
    positions[i * 3 + 2] = Math.sin(theta) * ring * STAR_RADIUS

    const magnitude = Math.pow(rand(), 5)
    const warmth = 0.55 + rand() * 0.45
    color.setHSL(0.58 - warmth * 0.12, 0.2 * (1 - magnitude), 0.4 + magnitude * 0.6)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function useOutdoorVisibility() {
  const visibility = useRef(1)
  useFrame(({ camera }, delta) => {
    const target = isIndoors(rooms, camera.position.x, camera.position.z) ? 0 : 1
    visibility.current = THREE.MathUtils.damp(visibility.current, target, EYE_ADAPTATION, delta)
  })
  return visibility
}

function StarField({ intensity }: { intensity: number }) {
  const outdoor = useOutdoorVisibility()
  const group = useRef<THREE.Group>(null)
  const geometry = useMemo(() => buildStarField(), [])

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        vertexColors: true,
        size: 1.5,
        sizeAttenuation: false,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    [],
  )

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useFrame(({ camera }) => {
    if (group.current) group.current.position.copy(camera.position)
    material.opacity = intensity * outdoor.current
  })

  if (intensity <= 0.01) return null

  return (
    <group ref={group} renderOrder={-2}>
      <points geometry={geometry} material={material} frustumCulled={false} />
    </group>
  )
}

function ShootingStar({ intensity }: { intensity: number }) {
  const outdoor = useOutdoorVisibility()
  const group = useRef<THREE.Group>(null)
  const line = useRef<THREE.Line>(null)
  const state = useRef({ nextAt: -1, elapsed: 0, active: false })

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -38, -13, 0], 3))
    return geo
  }, [])

  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: '#e8f0ff',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    [],
  )

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useFrame(({ camera }, delta) => {
    const s = state.current
    if (!group.current || !line.current) return
    group.current.position.copy(camera.position)

    if (s.nextAt < 0) s.nextAt = 4 + Math.random() * 18

    s.elapsed += delta
    if (!s.active) {
      if (s.elapsed < s.nextAt) return
      s.active = true
      s.elapsed = 0
      const theta = Math.random() * Math.PI * 2
      const height = 0.45 + Math.random() * 0.4
      const ring = Math.sqrt(1 - height * height)
      line.current.position.set(
        Math.cos(theta) * ring * STAR_RADIUS * 0.8,
        height * STAR_RADIUS * 0.8,
        Math.sin(theta) * ring * STAR_RADIUS * 0.8,
      )
      line.current.rotation.set(0, -theta + Math.PI / 2, Math.random() * 0.8 - 0.4)
      return
    }

    const life = 0.9
    const t = s.elapsed / life
    if (t >= 1) {
      s.active = false
      s.elapsed = 0
      s.nextAt = 6 + Math.random() * 26
      material.opacity = 0
      return
    }
    material.opacity = intensity * outdoor.current * Math.min(t * 6, 1) * (1 - t) ** 1.5
    line.current.translateX(-delta * 120)
  })

  if (intensity <= 0.05) return null

  return (
    <group ref={group} renderOrder={-1}>
      <primitive object={new THREE.Line(geometry, material)} ref={line} />
    </group>
  )
}

const MOON_VERTEX = `
  varying vec3 vSurface;
  varying vec3 vWorldNormal;
  varying vec3 vViewNormal;
  void main() {
    vSurface = normal;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const MOON_FRAGMENT = `
  uniform vec3 uSunDir;
  uniform float uNight;
  varying vec3 vSurface;
  varying vec3 vWorldNormal;
  varying vec3 vViewNormal;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }

  void main() {
    vec3 s = normalize(vSurface);
    float maria = noise(s * 2.1 + 3.7) * 0.62 + noise(s * 4.3 - 1.9) * 0.38;
    maria = smoothstep(0.46, 0.66, maria);
    float grit = noise(s * 19.0) * 0.5 + noise(s * 41.0) * 0.5;
    float albedo = mix(0.9, 0.56, maria) * (0.9 + 0.12 * grit);

    float facing = max(dot(normalize(vViewNormal), vec3(0.0, 0.0, 1.0)), 0.0);
    float limb = 0.72 + 0.28 * pow(facing, 0.5);

    float sunlit = dot(normalize(vWorldNormal), uSunDir);
    float lit = smoothstep(-0.04, 0.12, sunlit);

    vec3 day = vec3(1.0, 0.975, 0.93) * albedo * limb;
    vec3 earthshine = vec3(0.006, 0.008, 0.012) * albedo;
    vec3 color = mix(earthshine, day * mix(0.95, 1.7, uNight), lit);

    float sunlitAlpha = lit * mix(0.35 + 0.5 * albedo, 1.0, uNight);
    float darkAlpha = smoothstep(0.15, 0.6, uNight);

    gl_FragColor = vec4(color, max(sunlitAlpha, darkAlpha));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function MoonHalo({ strength }: { strength: number }) {
  const texture = useMemo(() => {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
      glow.addColorStop(0, 'rgba(210,225,255,0.55)')
      glow.addColorStop(0.18, 'rgba(190,210,255,0.22)')
      glow.addColorStop(0.45, 'rgba(160,185,240,0.06)')
      glow.addColorStop(1, 'rgba(140,165,230,0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, size, size)
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <sprite scale={[MOON_SIZE * 9, MOON_SIZE * 9, 1]} renderOrder={-1}>
      <spriteMaterial
        map={texture}
        transparent
        opacity={strength}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        fog={false}
      />
    </sprite>
  )
}

function Moon({
  position,
  light,
  sunDirection,
  night,
}: {
  position: [number, number, number]
  light: number
  sunDirection: [number, number, number]
  night: number
}) {
  const group = useRef<THREE.Group>(null)
  const body = useRef<THREE.Mesh>(null)

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: MOON_VERTEX,
        fragmentShader: MOON_FRAGMENT,
        uniforms: {
          uSunDir: { value: new THREE.Vector3() },
          uNight: { value: 0 },
        },
        transparent: true,
        depthWrite: true,
        fog: false,
      }),
    [],
  )

  useEffect(() => () => material.dispose(), [material])

  useFrame(({ camera }) => {
    if (group.current) group.current.position.copy(camera.position)
    if (body.current) body.current.lookAt(camera.position)
    material.uniforms.uSunDir.value.set(sunDirection[0], sunDirection[1], sunDirection[2]).normalize()
    material.uniforms.uNight.value = night
  })

  if (position[1] <= -0.02) return null

  const anchor: [number, number, number] = [
    position[0] * MOON_RADIUS,
    position[1] * MOON_RADIUS,
    position[2] * MOON_RADIUS,
  ]

  return (
    <group ref={group}>
      <group position={anchor}>
        <MoonHalo strength={light * night * 0.9} />
        <mesh ref={body} material={material} renderOrder={0}>
          <sphereGeometry args={[MOON_SIZE, 48, 32]} />
        </mesh>
      </group>
    </group>
  )
}

export function SkyDome() {
  const { sun, moon } = useSkyClock()

  return (
    <>
      {sun.nightFactor < 0.88 && (
        <Sky
          sunPosition={sun.position}
          turbidity={2.6 + sun.twilightFactor * 7}
          rayleigh={0.6 + sun.twilightFactor * 2.8}
          mieCoefficient={0.004 + sun.goldenFactor * 0.012}
          mieDirectionalG={0.8 + sun.goldenFactor * 0.15}
        />
      )}
      <StarField intensity={sun.nightFactor} />
      <ShootingStar intensity={sun.nightFactor} />
      <Moon position={moon.position} light={moon.light} sunDirection={sun.position} night={sun.nightFactor} />
    </>
  )
}
