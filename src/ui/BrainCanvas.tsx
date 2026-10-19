import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { BRAIN_REGIONS, severityOf, type BrainRegion } from '@/data/brainRegions'

const MODEL = '/models/human-brain.glb'
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches
// A fingertip is far bigger than a pointer, and the pointing targets are small on a phone's screen.
const TOUCH_HIT_SCALE = window.matchMedia('(pointer: coarse)').matches ? 1.8 : 1

const VERT = `
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vPos = position;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`

// The thesis app's own shader: soft two-light tissue shading with a faint rim, translucent, and a red heat around each region in proportion to how far it sits below normal.
const FRAG = `
uniform vec3  uPos[${BRAIN_REGIONS.length}];
uniform float uSev[${BRAIN_REGIONS.length}];
uniform float uTime;
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vView);

  vec3 L1 = normalize(vec3(0.45, 0.7, 0.55));
  vec3 L2 = normalize(vec3(-0.5, -0.2, -0.4));
  float diff = clamp(dot(N, L1), 0.0, 1.0) + 0.35 * clamp(dot(N, L2), 0.0, 1.0);
  float shade = 0.30 + 0.85 * diff;
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);

  float heat = 0.0;
  for (int i = 0; i < ${BRAIN_REGIONS.length}; i++) {
    float d = distance(vPos, uPos[i]);
    float r = 0.15 + 0.12 * uSev[i];
    float t = clamp(1.0 - d / r, 0.0, 1.0);
    heat = max(heat, smoothstep(0.0, 1.0, t) * uSev[i]);
  }
  float heatRaw = heat;
  // moderate severities are the common case and would barely tint grey tissue, so lift the middle
  float heatBoost = pow(heatRaw, 0.55);

  float grain = 0.0;
  if (heatRaw > 0.02) {
    vec3 q = vPos * 13.0 + vec3(uTime * 0.5, uTime * 0.35, -uTime * 0.4);
    grain = 0.65 * vnoise(q) + 0.35 * vnoise(q * 2.3 + 5.0);
  }
  float core = smoothstep(0.35, 0.65, heatRaw);
  heat = clamp(max(heatBoost * (0.55 + 0.75 * grain), core), 0.0, 1.0);

  vec3 tissue = vec3(0.72) * shade + fres * 0.22;
  vec3 red = mix(vec3(0.55, 0.06, 0.05), vec3(1.0, 0.05, 0.02), heatBoost);
  red *= (0.55 + 0.6 * shade);

  vec3 col = mix(tissue, red, heat);
  float tissueA = 0.42 + 0.32 * diff;
  float alpha = mix(tissueA, 0.98, heat);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}`

interface SpecimenProps {
  onSelect: (region: BrainRegion | null) => void
  onHover: (hovering: boolean) => void
}

function Specimen({ onSelect, onHover }: SpecimenProps) {
  const { scene } = useGLTF(MODEL)
  const material = useRef<THREE.ShaderMaterial | null>(null)
  // a copy, so the cached model keeps its own materials
  const model = useMemo(() => scene.clone(true), [scene])

  // The material is made here, not while rendering, because its time uniform is written every frame.
  useLayoutEffect(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uPos: { value: BRAIN_REGIONS.map((region) => new THREE.Vector3(...region.position)) },
        uSev: { value: BRAIN_REGIONS.map((region) => severityOf(region.z)) },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: true,
    })
    material.current = mat
    model.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).material = mat
    })
    return () => {
      mat.dispose()
      material.current = null
    }
  }, [model])

  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.uTime.value = REDUCED_MOTION ? 0 : clock.elapsedTime
  })

  // the model is the only thing this view loads, so let go of it with the view
  useEffect(() => () => useGLTF.clear(MODEL), [])

  return (
    <>
      <primitive object={model} />
      {BRAIN_REGIONS.map((region) => (
        <mesh
          key={region.id}
          position={region.position}
          // the mouse points by hovering; the view stops turning while it rests on a region so the card stays beside it
          onPointerEnter={(e: ThreeEvent<PointerEvent>) => {
            if (e.nativeEvent.pointerType !== 'mouse') return
            e.stopPropagation()
            onSelect(region)
            onHover(true)
          }}
          onPointerLeave={(e: ThreeEvent<PointerEvent>) => {
            if (e.nativeEvent.pointerType !== 'mouse') return
            onSelect(null)
            onHover(false)
          }}
          // touch has no hover: a tap picks, and the pick stays until something else is tapped
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation()
            onSelect(region)
          }}
        >
          <sphereGeometry args={[region.radius * TOUCH_HIT_SCALE, 14, 14]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </>
  )
}

// Draws only while the view is on screen; the loop stops itself at 'never' and has to be woken.
function Gate({ active }: { active: boolean }) {
  const setFrameloop = useThree((s) => s.setFrameloop)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    setFrameloop(active ? 'always' : 'never')
    if (active) invalidate()
  }, [active, setFrameloop, invalidate])
  return null
}

interface BrainCanvasProps {
  active: boolean
  onSelect: (region: BrainRegion | null) => void
}

export default function BrainCanvas({ active, onSelect }: BrainCanvasProps) {
  const [hovering, setHovering] = useState(false)

  return (
    <Canvas
      // pulled back from the app's own framing: here the brain shares a small frame with the chrome
      frameloop="never"
      camera={{ position: [0.47, 0.35, 3.3], fov: 45 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#0a0a0a']} />
      <Gate active={active} />
      <Specimen onSelect={onSelect} onHover={setHovering} />
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
        autoRotate={!REDUCED_MOTION && !hovering}
        autoRotateSpeed={0.7}
      />
    </Canvas>
  )
}
