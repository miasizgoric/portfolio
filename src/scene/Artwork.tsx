import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Artwork as ArtworkData, Room } from '@/data/rooms'
import { getWallInfo, wallPointToWorld, wallRotationY } from '@/lib/roomGeometry'
import { useGalleryStore } from '@/store/useGalleryStore'
import { loadBitmap } from '@/world/bitmaps'

// Once the visitor walks into the room each screen takes its turn: the tube's line opens up, it shows snow for a moment, then the picture comes through.
const POWER_ON_SECONDS = 0.5
const STATIC_SECONDS = 1.7
const PICTURE_SECONDS = 1.2
const STAGGER_SECONDS = 1.1
const FIRST_SCREEN_DELAY = 0.35
const STATIC_GLOW = new THREE.Color('#9dbdf0')
const PICTURE_GLOW = new THREE.Color('#ffe8c4')

const PLATE_BACK = '#26221e'
const PLATE_BACK_Z = 0.031

const SCREEN_BASE_Z = 0.478
const SCREEN_BULGE = 0.2
const SCREEN_SEGMENTS = 40
const BULGE_EXPONENT = 2.6
const PICTURE_DEPTH = 0.03
const PICTURE_BARREL = 0.16
const PICTURE_SATURATION = 1.6
const PICTURE_GAIN = 1.1

const FRAME_BACK_Z = 0.4
const FRAME_DEPTH = SCREEN_BASE_Z + SCREEN_BULGE * 0.6 - FRAME_BACK_Z
const FRAME_BORDER = 0.12
const FRAME_OVERLAP = 0.012

const SCREEN_GEOMETRY = new THREE.PlaneGeometry(1, 1, SCREEN_SEGMENTS, SCREEN_SEGMENTS)

// Like on a real set, the controls sit in a recessed panel on the front of the cabinet, in a column to the right of the tube.
// The cabinet is widened by CONTROL_STRIP to make room for it.
const CONTROL_STRIP = 0.34
const CONTROL_PANEL_WIDTH = 0.26
const CONTROL_PANEL_HEIGHT = 1
const CONTROL_RELIEF = 0.014
const SHELL_FRONT_Z = 0.45
const LED_Y = 0.4

function tinted(geometry: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const tint = new THREE.Color(color)
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) tint.toArray(colors, i * 3)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function buildControls(): THREE.BufferGeometry {
  const r = CONTROL_RELIEF
  const parts = [
    tinted(new THREE.BoxGeometry(CONTROL_PANEL_WIDTH, CONTROL_PANEL_HEIGHT, r).translate(0, 0, r / 2), '#8a8e92'),
    tinted(new THREE.CylinderGeometry(0.052, 0.058, 0.03, 20).rotateX(Math.PI / 2).translate(0, 0.24, r + 0.015), '#d3d6d9'),
  ]
  for (const y of [0.06, -0.06, -0.18]) {
    parts.push(
      tinted(new THREE.CylinderGeometry(0.032, 0.034, 0.022, 16).rotateX(Math.PI / 2).translate(0, y, r + 0.011), '#e4e7ea'),
    )
  }
  for (let i = 0; i < 4; i++) {
    parts.push(tinted(new THREE.BoxGeometry(0.18, 0.016, 0.006).translate(0, -0.32 - i * 0.045, r + 0.003), '#32353a'))
  }
  const merged = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  return merged
}

const CONTROLS_GEOMETRY = buildControls()
const CONTROLS_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5 })
const LED_GEOMETRY = new THREE.SphereGeometry(0.014, 10, 8)

function glslFloat(value: number): string {
  return value.toFixed(5)
}

const SURFACE_GLSL = `
uniform vec2 uHalfSize;

vec2 bulgeAxis(vec2 n) {
  return max(1.0 - pow(abs(n), vec2(${glslFloat(BULGE_EXPONENT)})), 0.0);
}

vec3 bulgePoint(vec2 n) {
  vec2 axis = bulgeAxis(n);
  return vec3(n * uHalfSize, ${glslFloat(SCREEN_BASE_Z)} + ${glslFloat(SCREEN_BULGE)} * axis.x * axis.y);
}
`

const SCREEN_VERTEX = `
varying vec2 vUv;
${SURFACE_GLSL}
#include <fog_pars_vertex>

void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(bulgePoint(uv * 2.0 - 1.0), 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

const SCREEN_FRAGMENT = `
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uOn;
uniform float uWarm;
uniform float uTime;
uniform float uSeed;
uniform vec3 uViewLocal;
uniform vec3 uUpLocal;
varying vec2 vUv;
${SURFACE_GLSL}
#include <fog_pars_fragment>

float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

void main() {
  vec2 n = vUv * 2.0 - 1.0;
  vec2 axis = bulgeAxis(n);
  float profile = axis.x * axis.y;
  vec3 surface = bulgePoint(n);
  vec2 slope = ${glslFloat(-SCREEN_BULGE * BULGE_EXPONENT)}
    * pow(abs(n), vec2(${glslFloat(BULGE_EXPONENT - 1)})) * sign(n) * axis.yx / uHalfSize;
  vec3 normal = normalize(vec3(-slope, 1.0));
  vec3 viewDir = normalize(uViewLocal - surface);
  float ndv = clamp(dot(normal, viewDir), 0.0, 1.0);

  // Barrel distortion: the middle of the picture is magnified, the corners are squeezed out of the frame, which is what makes a bulging tube read as curved from straight on.
  vec2 raster = n * (1.0 + ${glslFloat(PICTURE_BARREL)} * dot(n, n)) / ${glslFloat(1 + PICTURE_BARREL)};
  float travel = (${glslFloat(SCREEN_BULGE)} * profile + ${glslFloat(PICTURE_DEPTH)}) / max(viewDir.z, 0.25);
  vec2 behind = (raster - viewDir.xy * travel / uHalfSize) * 0.5;
  vec2 pictureUv = behind + 0.5;

  float frame = floor(uTime * 24.0);
  float grain = hash21(floor(vUv * vec2(200.0, 140.0)) + vec2(frame, uSeed));
  float drift = hash21(vec2(floor((vUv.y + uTime * 0.7) * 70.0), frame + uSeed));
  vec3 snow = vec3(0.04 + grain * 0.74 + drift * 0.14);

  vec2 beyond = max(abs(behind) - 0.5, 0.0);
  float inside = 1.0 - smoothstep(0.0, 0.016, max(beyond.x, beyond.y));
  // Curved glass pulls the colour channels slightly apart towards the edges.
  vec2 fringe = (pictureUv - 0.5) * 0.014 * (1.0 - profile);
  vec3 picture = vec3(
    texture2D(uMap, pictureUv + fringe).r,
    texture2D(uMap, pictureUv).g,
    texture2D(uMap, pictureUv - fringe).b
  ) * inside;
  // The tube, the glare and the tone mapping all wash colour out, so push it back.
  float luma = dot(picture, vec3(0.2126, 0.7152, 0.0722));
  picture = max(mix(vec3(luma), picture, ${glslFloat(PICTURE_SATURATION)}), 0.0) * ${glslFloat(PICTURE_GAIN)};
  vec3 color = mix(snow, picture, uHasMap * smoothstep(0.15, 0.95, uWarm));

  float lit = step(0.0001, uOn);
  float gate = smoothstep(0.0, 1.0, uOn);
  float span = gate * 0.53;
  float dy = abs(raster.y) * 0.5;
  color *= lit * (1.0 - smoothstep(span - 0.015, span + 0.015, dy));
  color += lit * vec3(1.0, 0.95, 0.85) * exp(-abs(dy - span) * 120.0) * (1.0 - smoothstep(0.7, 1.0, gate));
  color *= 0.93 + 0.07 * sin((raster.y * 0.5 + 0.5) * 540.0);
  color *= mix(0.5, 1.0, pow(profile, 0.32));
  color *= 1.0 - 0.6 * (1.0 - axis.x) * (1.0 - axis.y);

  vec3 mirror = reflect(-viewDir, normal);
  vec3 lightDir = normalize(uUpLocal * 0.78 + vec3(0.0, 0.0, 0.62));
  float lobe = max(dot(mirror, lightDir), 0.0);
  float wide = max(dot(mirror, normalize(vec3(-0.4, 0.55, 0.75))), 0.0);
  float ceiling = smoothstep(-0.25, 0.85, dot(mirror, uUpLocal));
  float grazing = pow(1.0 - ndv, 2.5);
  vec3 glass = vec3(0.46, 0.55, 0.68) * (ceiling * 0.2 + grazing * 0.95)
    + vec3(1.0, 0.97, 0.9) * (pow(lobe, 140.0) * 0.65 + pow(lobe, 14.0) * 0.12 + pow(wide, 4.0) * 0.24);

  gl_FragColor = vec4(color * 1.15 + glass, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

function seedFrom(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash << 5) - hash + id.charCodeAt(i)
  return Math.abs(hash) % 613
}

const ARTWORK_MAX_EDGE = 1536

async function decodeOnMainThread(url: string): Promise<ImageBitmap> {
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  await image.decode()
  const scale = Math.min(1, ARTWORK_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
  return createImageBitmap(image, {
    resizeWidth: Math.round(image.naturalWidth * scale),
    resizeHeight: Math.round(image.naturalHeight * scale),
    resizeQuality: 'high',
    imageOrientation: 'flipY',
  })
}

function useArtworkTexture(url: string | undefined): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!url) return
    let loaded: THREE.Texture | null = null
    let cancelled = false

    // The source JPEGs are up to 3637x2550; decoding and downscaling them on the main thread blocks it for seconds on a phone, so a worker does it and only the small bitmap comes back.
    loadBitmap(url, ARTWORK_MAX_EDGE)
      .then((bitmap) => bitmap ?? decodeOnMainThread(url))
      .then((bitmap) => {
        if (cancelled) {
          bitmap.close()
          return
        }
        const tex = new THREE.Texture(bitmap)
        tex.flipY = false
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 8
        tex.needsUpdate = true
        loaded = tex
        setTexture(tex)
      })
      .catch(() => {
        if (!cancelled) setTexture(null)
      })

    return () => {
      cancelled = true
      loaded?.dispose()
      setTexture(null)
    }
  }, [url])

  return texture
}

function buildBezel(screenWidth: number, screenHeight: number): THREE.ExtrudeGeometry {
  const outerX = screenWidth / 2 + FRAME_BORDER
  const outerY = screenHeight / 2 + FRAME_BORDER
  const innerX = screenWidth / 2 - FRAME_OVERLAP
  const innerY = screenHeight / 2 - FRAME_OVERLAP

  const shape = new THREE.Shape()
  shape.moveTo(-outerX, -outerY)
  shape.lineTo(outerX, -outerY)
  shape.lineTo(outerX, outerY)
  shape.lineTo(-outerX, outerY)
  shape.closePath()

  const aperture = new THREE.Path()
  aperture.moveTo(-innerX, -innerY)
  aperture.lineTo(-innerX, innerY)
  aperture.lineTo(innerX, innerY)
  aperture.lineTo(innerX, -innerY)
  aperture.closePath()
  shape.holes.push(aperture)

  return new THREE.ExtrudeGeometry(shape, { depth: FRAME_DEPTH, bevelEnabled: false })
}

export function Artwork({ room, artwork }: { room: Room; artwork: ArtworkData }) {
  const texture = useArtworkTexture(artwork.imageUrl)
  const lightRef = useRef<THREE.PointLight>(null)
  const screenRef = useRef<THREE.Mesh>(null)
  const warmRef = useRef(0)
  const powerClock = useRef(0)
  const inverseWorld = useMemo(() => new THREE.Matrix4(), [])

  const powerDelay = useMemo(
    () => FIRST_SCREEN_DELAY + ((seedFrom(artwork.id) % 100) / 100) * STAGGER_SECONDS,
    [artwork.id],
  )

  const info = useMemo(() => getWallInfo(room, artwork.wall), [room, artwork.wall])
  const rotationY = wallRotationY(info)
  const anchor = wallPointToWorld(room, artwork.wall, artwork.offset, artwork.elevation)

  // A portrait picture gets an upright, narrower set: the TV is never turned on its side, so the controls stay on the right of every one.
  const { screenWidth, screenHeight } = useMemo(() => {
    const box = Math.max(artwork.width, artwork.height)
    const image = texture?.image as { width?: number; height?: number } | undefined
    if (!image?.width || !image.height) {
      return { screenWidth: artwork.width, screenHeight: artwork.height }
    }
    const aspect = image.width / image.height
    return aspect >= 1
      ? { screenWidth: box, screenHeight: box / aspect }
      : { screenWidth: box * aspect, screenHeight: box }
  }, [texture, artwork.width, artwork.height])

  const bezel = useMemo(() => buildBezel(screenWidth, screenHeight), [screenWidth, screenHeight])

  const ledMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ color: '#2a0a0a', emissive: '#ff2a1a', emissiveIntensity: 0, roughness: 0.4 }),
    [],
  )
  useEffect(() => () => ledMaterial.dispose(), [ledMaterial])

  useEffect(() => () => bezel.dispose(), [bezel])

  const material = useMemo(() => {
    const seed = seedFrom(artwork.id)
    return new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uMap: { value: null },
        uHasMap: { value: 0 },
        uOn: { value: 0 },
        uWarm: { value: 0 },
        uTime: { value: seed },
        uSeed: { value: seed },
        uHalfSize: { value: new THREE.Vector2(artwork.width / 2, artwork.height / 2) },
        uViewLocal: { value: new THREE.Vector3(0, 0, 4) },
        uUpLocal: { value: new THREE.Vector3(0, 1, 0) },
      },
      vertexShader: SCREEN_VERTEX,
      fragmentShader: SCREEN_FRAGMENT,
      fog: true,
      toneMapped: false,
    })
  }, [artwork.id, artwork.width, artwork.height])

  useEffect(() => () => material.dispose(), [material])

  useEffect(() => {
    const uniforms = material.uniforms
    uniforms.uMap.value = texture
    uniforms.uHasMap.value = texture ? 1 : 0
    uniforms.uHalfSize.value.set(screenWidth / 2, screenHeight / 2)
    uniforms.uWarm.value = 0
    warmRef.current = 0
  }, [material, texture, screenWidth, screenHeight])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    const uniforms = material.uniforms
    uniforms.uTime.value = (uniforms.uTime.value + dt) % 600

    if (useGalleryStore.getState().enteredRooms[room.id]) powerClock.current += dt
    const sinceOn = powerClock.current - powerDelay
    const on = THREE.MathUtils.clamp(sinceOn / POWER_ON_SECONDS, 0, 1)
    uniforms.uOn.value = on
    ledMaterial.emissiveIntensity = 2.6 * on

    if (uniforms.uHasMap.value === 1 && sinceOn > POWER_ON_SECONDS + STATIC_SECONDS && warmRef.current < 1) {
      warmRef.current = Math.min(1, warmRef.current + dt / PICTURE_SECONDS)
      uniforms.uWarm.value = warmRef.current
    }

    const screen = screenRef.current
    if (screen) {
      screen.updateWorldMatrix(true, false)
      inverseWorld.copy(screen.matrixWorld).invert()
      uniforms.uViewLocal.value.copy(state.camera.position).applyMatrix4(inverseWorld)
      uniforms.uUpLocal.value.set(0, 1, 0).transformDirection(inverseWorld)
    }

    const light = lightRef.current
    if (!light) return
    const warm = warmRef.current
    const flicker = 1 - 0.24 * (1 - warm) * Math.sin(uniforms.uTime.value * 17 + uniforms.uSeed.value)
    light.intensity = (1.4 * on + 2.6 * warm) * flicker
    light.color.copy(STATIC_GLOW).lerp(PICTURE_GLOW, warm)
  })

  const shellWidth = screenWidth + 0.46
  const shellHeight = screenHeight + 0.5
  const bodyWidth = shellWidth + CONTROL_STRIP
  const controlsX = screenWidth / 2 + 0.12 + (0.11 + CONTROL_STRIP) / 2

  return (
    <group position={anchor} rotation={[0, rotationY, 0]}>
      {/* The cabinet is centred on the anchor; the tube sits left of centre to leave the control column. */}
      <group position={[-CONTROL_STRIP / 2, 0, 0]}>
        <mesh position={[CONTROL_STRIP / 2, 0, 0.01]} castShadow receiveShadow>
          <boxGeometry args={[bodyWidth + 0.44, shellHeight + 0.6, 0.08]} />
          <meshStandardMaterial color={room.wallColor} roughness={0.92} />
        </mesh>

        {/* The mounting board is seen from behind through the glass wall, so its back is dark. */}
        <mesh position={[CONTROL_STRIP / 2, 0, -PLATE_BACK_Z]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[bodyWidth + 0.44, shellHeight + 0.6]} />
          <meshStandardMaterial color={PLATE_BACK} roughness={0.85} />
        </mesh>

        <mesh position={[CONTROL_STRIP / 2, 0, 0.24]} castShadow receiveShadow>
          <boxGeometry args={[bodyWidth, shellHeight, 0.42]} />
          <meshStandardMaterial color="#b3b7bb" roughness={0.36} metalness={0.55} />
        </mesh>

        <mesh position={[0, 0, FRAME_BACK_Z]} geometry={bezel} castShadow>
          <meshStandardMaterial color="#232527" roughness={0.45} />
        </mesh>

        <mesh position={[controlsX, 0, SHELL_FRONT_Z]} geometry={CONTROLS_GEOMETRY} material={CONTROLS_MATERIAL} />
        <mesh
          position={[controlsX, LED_Y, SHELL_FRONT_Z + CONTROL_RELIEF + 0.004]}
          geometry={LED_GEOMETRY}
          material={ledMaterial}
        />

        <mesh ref={screenRef} geometry={SCREEN_GEOMETRY} material={material} frustumCulled={false} />

        <pointLight ref={lightRef} position={[0, 0, 1.7]} distance={6} decay={2} />
      </group>
    </group>
  )
}
