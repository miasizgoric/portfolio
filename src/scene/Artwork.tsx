import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Artwork as ArtworkData, Room } from '@/data/rooms'
import { getWallInfo, wallPointToWorld, wallRotationY } from '@/lib/roomGeometry'
import { loadBitmap } from '@/world/bitmaps'

const WARM_UP_SECONDS = 1.4
const STATIC_GLOW = new THREE.Color('#9dbdf0')
const PICTURE_GLOW = new THREE.Color('#ffe8c4')

const SCREEN_BASE_Z = 0.478
const SCREEN_BULGE = 0.086
const SCREEN_SEGMENTS = 40
const BULGE_EXPONENT = 2.6
const PICTURE_DEPTH = 0.03
const PICTURE_STRETCH = 0.05

const FRAME_BACK_Z = 0.4
const FRAME_DEPTH = SCREEN_BASE_Z + SCREEN_BULGE * 0.45 - FRAME_BACK_Z
const FRAME_BORDER = 0.12
const FRAME_OVERLAP = 0.012

const SCREEN_GEOMETRY = new THREE.PlaneGeometry(1, 1, SCREEN_SEGMENTS, SCREEN_SEGMENTS)

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
uniform float uWarm;
uniform float uTime;
uniform float uSeed;
uniform vec2 uPictureRotation;
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

  vec2 raster = n * (1.0 - ${glslFloat(PICTURE_STRETCH)} * (1.0 - profile));
  float travel = (${glslFloat(SCREEN_BULGE)} * profile + ${glslFloat(PICTURE_DEPTH)}) / max(viewDir.z, 0.25);
  vec2 behind = (raster - viewDir.xy * travel / uHalfSize) * 0.5;
  vec2 pictureUv = vec2(
    uPictureRotation.x * behind.x + uPictureRotation.y * behind.y,
    uPictureRotation.x * behind.y - uPictureRotation.y * behind.x
  ) + 0.5;

  float frame = floor(uTime * 24.0);
  float grain = hash21(floor(vUv * vec2(200.0, 140.0)) + vec2(frame, uSeed));
  float drift = hash21(vec2(floor((vUv.y + uTime * 0.7) * 70.0), frame + uSeed));
  vec3 snow = vec3(0.04 + grain * 0.74 + drift * 0.14);

  vec2 beyond = max(abs(behind) - 0.5, 0.0);
  float inside = 1.0 - smoothstep(0.0, 0.016, max(beyond.x, beyond.y));
  vec3 picture = texture2D(uMap, pictureUv).rgb * inside;
  vec3 color = mix(snow, picture, uHasMap * smoothstep(0.34, 0.9, uWarm));

  float gate = mix(1.0, smoothstep(0.0, 0.42, uWarm), uHasMap);
  float span = gate * 0.53;
  float dy = abs(raster.y) * 0.5;
  color *= 1.0 - smoothstep(span - 0.015, span + 0.015, dy);
  color += vec3(1.0, 0.95, 0.85) * exp(-abs(dy - span) * 120.0) * (1.0 - smoothstep(0.7, 1.0, gate));
  color *= 0.93 + 0.07 * sin((raster.y * 0.5 + 0.5) * 540.0);
  color *= mix(0.62, 1.0, pow(profile, 0.28));
  color *= 1.0 - 0.42 * (1.0 - axis.x) * (1.0 - axis.y);

  vec3 mirror = reflect(-viewDir, normal);
  vec3 lightDir = normalize(uUpLocal * 0.78 + vec3(0.0, 0.0, 0.62));
  float lobe = max(dot(mirror, lightDir), 0.0);
  float ceiling = smoothstep(-0.25, 0.85, dot(mirror, uUpLocal));
  float grazing = pow(1.0 - ndv, 2.5);
  vec3 glass = vec3(0.46, 0.55, 0.68) * (ceiling * 0.2 + grazing * 0.95)
    + vec3(1.0, 0.97, 0.9) * (pow(lobe, 140.0) * 0.65 + pow(lobe, 14.0) * 0.12);

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

    // The source JPEGs are up to 3637x2550; decoding and downscaling them on the main thread
    // blocks it for seconds on a phone, so a worker does it and only the small bitmap comes back.
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
  const inverseWorld = useMemo(() => new THREE.Matrix4(), [])

  const info = useMemo(() => getWallInfo(room, artwork.wall), [room, artwork.wall])
  const rotationY = wallRotationY(info)
  const anchor = wallPointToWorld(room, artwork.wall, artwork.offset, artwork.elevation)

  const { screenWidth, screenHeight, roll } = useMemo(() => {
    const box = Math.max(artwork.width, artwork.height)
    const image = texture?.image as { width?: number; height?: number } | undefined
    if (!image?.width || !image.height) {
      return { screenWidth: artwork.width, screenHeight: artwork.height, roll: 0 }
    }
    const aspect = image.width / image.height
    return aspect >= 1
      ? { screenWidth: box, screenHeight: box / aspect, roll: 0 }
      : { screenWidth: box, screenHeight: box * aspect, roll: Math.PI / 2 }
  }, [texture, artwork.width, artwork.height])

  const bezel = useMemo(() => buildBezel(screenWidth, screenHeight), [screenWidth, screenHeight])

  useEffect(() => () => bezel.dispose(), [bezel])

  const material = useMemo(() => {
    const seed = seedFrom(artwork.id)
    return new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uMap: { value: null },
        uHasMap: { value: 0 },
        uWarm: { value: 0 },
        uTime: { value: seed },
        uSeed: { value: seed },
        uPictureRotation: { value: new THREE.Vector2(1, 0) },
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
    uniforms.uPictureRotation.value.set(Math.cos(roll), -Math.sin(roll))
    uniforms.uHalfSize.value.set(screenWidth / 2, screenHeight / 2)
    uniforms.uWarm.value = 0
    warmRef.current = 0
  }, [material, texture, roll, screenWidth, screenHeight])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    const uniforms = material.uniforms
    uniforms.uTime.value = (uniforms.uTime.value + dt) % 600

    if (uniforms.uHasMap.value === 1 && warmRef.current < 1) {
      warmRef.current = Math.min(1, warmRef.current + dt / WARM_UP_SECONDS)
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
    light.intensity = (1.4 + 2.6 * warm) * flicker
    light.color.copy(STATIC_GLOW).lerp(PICTURE_GLOW, warm)
  })

  const shellWidth = screenWidth + 0.46
  const shellHeight = screenHeight + 0.5
  const controlX = shellWidth / 2 + 0.16

  return (
    <group position={anchor} rotation={[0, rotationY, roll]}>
      <mesh position={[0, 0, 0.01]} castShadow receiveShadow>
        <boxGeometry args={[shellWidth + 0.44, shellHeight + 0.6, 0.08]} />
        <meshStandardMaterial color={room.wallColor} roughness={0.92} />
      </mesh>

      <mesh position={[0, 0, 0.24]} castShadow receiveShadow>
        <boxGeometry args={[shellWidth, shellHeight, 0.42]} />
        <meshStandardMaterial color="#cbb9a2" roughness={0.58} metalness={0.05} />
      </mesh>

      <mesh position={[0, 0, FRAME_BACK_Z]} geometry={bezel} castShadow>
        <meshStandardMaterial color="#2a2520" roughness={0.45} />
      </mesh>

      <mesh position={[controlX, 0, 0.45]}>
        <boxGeometry args={[0.16, shellHeight * 0.42, 0.06]} />
        <meshStandardMaterial color="#8d7a63" roughness={0.5} metalness={0.2} />
      </mesh>
      {[0.12, -0.02, -0.16].map((dy, i) => (
        <mesh key={i} position={[controlX, dy, 0.49]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.05, 12]} />
          <meshStandardMaterial color="#e3d8c6" roughness={0.4} metalness={0.25} />
        </mesh>
      ))}

      <mesh ref={screenRef} geometry={SCREEN_GEOMETRY} material={material} frustumCulled={false} />

      <pointLight ref={lightRef} position={[0, 0, 0.8]} distance={6} decay={2} />
    </group>
  )
}
