import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { rooms } from '@/data/rooms'
import { findRoomAt, groundHeightAt } from '@/lib/collision'
import { SEA } from '@/lib/terrain'
import { keyLightOf, useSkyClock } from '@/lib/sun'
import { useWeather } from '@/lib/weather'

// The visitor has no body, so their shadow is a small cloud that lies on the ground where the
// sun (or moon) would throw it. The cloud is a flat patch laid over the terrain rather than a
// shadow-map caster: the key light's map only refreshes every few frames and would lag behind.
const PATCH = 6.6
const GRID = 10
const LIFT = 0.05
const CLOUD_RADIUS = 1.05
const MIN_TAN = 0.28
const MAX_REACH = 12
const INDOOR_STRENGTH = 0.65

const COUNT = (GRID + 1) * (GRID + 1)

const VERTEX = `
attribute float aWet;
varying vec2 vLocal;
varying float vWet;

void main() {
  vLocal = (uv - 0.5) * ${PATCH.toFixed(3)};
  vWet = aWet;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAGMENT = `
uniform float uTime;
uniform float uStrength;
uniform float uRadius;
uniform float uStretch;
uniform float uSoft;
varying vec2 vLocal;
varying float vWet;

float lobe(vec2 q, vec2 center, float radius) {
  vec2 d = (q - center) / radius;
  float w = max(1.0 - dot(d, d), 0.0);
  return w * w;
}

void main() {
  vec2 q = vec2(vLocal.x / uStretch, vLocal.y) / uRadius;
  q += 0.05 * vec2(sin(q.y * 6.0 + uTime * 0.8), cos(q.x * 6.0 - uTime * 0.7));

  float t = uTime;
  float f = lobe(q, vec2(0.0, 0.0), 0.72);
  f += lobe(q, vec2(-0.48 + 0.04 * sin(t * 0.9), 0.30), 0.50);
  f += lobe(q, vec2(0.46 + 0.04 * sin(t * 0.7 + 1.0), 0.32), 0.52);
  f += lobe(q, vec2(-0.32 + 0.03 * sin(t * 1.1 + 2.0), -0.36), 0.44);
  f += lobe(q, vec2(0.40 + 0.03 * sin(t * 0.8 + 3.0), -0.32), 0.46);
  f += lobe(q, vec2(0.04, 0.58 + 0.03 * sin(t * 1.0 + 4.0)), 0.36);
  f += lobe(q, vec2(0.02, -0.60 + 0.03 * sin(t * 0.6 + 5.0)), 0.34);

  float edge = smoothstep(0.1, 0.1 + 0.5 * uSoft, f);
  float core = smoothstep(0.1, 1.3, f);
  // Over open water there is no surface to fall on, so the cloud stops at the shore.
  float alpha = edge * mix(0.72, 1.0, core) * uStrength * (1.0 - smoothstep(0.2, 0.8, vWet));
  if (alpha < 0.002) discard;

  // Multiplied onto the ground, so a shadow can only ever darken it, even on a near-black floor.
  gl_FragColor = vec4(mix(vec3(1.0), vec3(0.05, 0.08, 0.15), alpha), 1.0);
}
`

function createGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const uv = new Float32Array(COUNT * 2)
  const index: number[] = []
  for (let j = 0; j <= GRID; j++) {
    for (let i = 0; i <= GRID; i++) {
      const k = j * (GRID + 1) + i
      uv[k * 2] = i / GRID
      uv[k * 2 + 1] = j / GRID
    }
  }
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const a = j * (GRID + 1) + i
      const b = a + 1
      const c = a + GRID + 1
      const d = c + 1
      index.push(a, c, b, b, c, d)
    }
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setAttribute('aWet', new THREE.BufferAttribute(new Float32Array(COUNT), 1))
  geometry.setIndex(index)
  return geometry
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function PlayerShadow() {
  const { sun, moon } = useSkyClock()
  const weather = useWeather()
  const light = keyLightOf(sun, moon)
  const lightStrength = clamp01(light.intensity / 2.4)

  const geometry = useMemo(() => createGeometry(), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uStrength: { value: 0 },
          uRadius: { value: CLOUD_RADIUS },
          uStretch: { value: 1 },
          uSoft: { value: 0.5 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.SrcColorFactor,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    [],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  // `laid` is where the patch was last draped over the terrain, so the ground is only
  // re-sampled when the cloud actually moved.
  const laid = useRef({ cx: Infinity, cz: Infinity, ax: 0, az: 0 })
  const motion = useRef({ ax: 0, az: -1, indoor: 0, time: 0 })

  useFrame(({ camera }, delta) => {
    const m = motion.current
    const dt = Math.min(delta, 0.1)
    const px = camera.position.x
    const pz = camera.position.z

    const room = findRoomAt(rooms, px, pz)
    const groundY = groundHeightAt(rooms, px, pz, camera.position.y)
    // On a roof the visitor is outdoors again, under the sun.
    const inside = room !== undefined && groundY <= room.center[1] + 0.01
    m.indoor = THREE.MathUtils.damp(m.indoor, inside ? 1 : 0, 5, dt)
    const height = Math.max(camera.position.y - groundY, 0.3)

    // The shadow points away from the light.
    const [lx, ly, lz] = light.direction
    const horizontal = Math.hypot(lx, lz)
    if (horizontal > 1e-3) {
      m.ax = -lx / horizontal
      m.az = -lz / horizontal
    }
    const tanElevation = Math.max(Math.max(ly, 0.02) / Math.max(horizontal, 1e-3), MIN_TAN)
    const reach = Math.min(height / tanElevation, MAX_REACH)
    const offset = reach * 0.5 * (1 - m.indoor)

    // Under the ceiling lamps the light is straight overhead, so the cloud sits right under the
    // visitor, rounder and a little larger than a sun shadow.
    const stretch = THREE.MathUtils.lerp(THREE.MathUtils.clamp(0.7 + 0.6 / tanElevation, 1, 2.4), 1, m.indoor)
    const radius = Math.min(
      CLOUD_RADIUS * (1 + 0.04 * height) * (1 + 0.15 * m.indoor),
      (PATCH / 2 - 0.3) / (0.95 * stretch),
    )
    const cx = px + m.ax * offset
    const cz = pz + m.az * offset

    const l = laid.current
    if (
      Math.abs(cx - l.cx) > 0.01 ||
      Math.abs(cz - l.cz) > 0.01 ||
      Math.abs(m.ax - l.ax) > 0.002 ||
      Math.abs(m.az - l.az) > 0.002
    ) {
      const position = geometry.getAttribute('position') as THREE.BufferAttribute
      const uv = geometry.getAttribute('uv') as THREE.BufferAttribute
      const wet = geometry.getAttribute('aWet') as THREE.BufferAttribute
      // Local axes of the patch: `a` runs along the shadow, `b` across it.
      const bx = -m.az
      const bz = m.ax
      for (let k = 0; k < COUNT; k++) {
        const a = (uv.getX(k) - 0.5) * PATCH
        const b = (uv.getY(k) - 0.5) * PATCH
        const wx = cx + a * m.ax + b * bx
        const wz = cz + a * m.az + b * bz
        const ground = groundHeightAt(rooms, wx, wz, camera.position.y)
        position.setXYZ(k, wx, ground + LIFT, wz)
        wet.setX(k, ground < SEA.level + 0.2 ? 1 : 0)
      }
      position.needsUpdate = true
      wet.needsUpdate = true
      l.cx = cx
      l.cz = cz
      l.ax = m.ax
      l.az = m.az
    }

    const sunny = lightStrength * 0.85 * (1 - 0.45 * weather.cloudCover)
    const strength =
      THREE.MathUtils.lerp(sunny, INDOOR_STRENGTH, m.indoor) *
      (1 - THREE.MathUtils.smoothstep(height, 5, 28))

    m.time = (m.time + dt) % 600
    const uniforms = material.uniforms
    uniforms.uTime.value = m.time
    uniforms.uStrength.value = strength
    uniforms.uRadius.value = radius
    uniforms.uStretch.value = stretch
    uniforms.uSoft.value = THREE.MathUtils.clamp(0.4 + 0.4 * weather.cloudCover + 0.02 * height + 0.3 * m.indoor, 0.4, 1)
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />
}
