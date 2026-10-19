import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { BRAIN_REGIONS, severityOf, type BrainRegion } from '@/data/brainRegions'

const MODEL = '/models/human-brain.glb'
// How far a region's colour reaches over the surface, how much more it reaches as it gets worse, and how strong the colour gets at its strongest (the app's own values, toned down: a small frame makes the same colour read much louder).
const HEAT_REACH = 0.13
const HEAT_GROW = 0.1
const HEAT_STRENGTH = 0.72
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches

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

// The app's own shader: soft two-light tissue shading with a faint rim, translucent, and a red heat that grows around each region in proportion to how far it sits below normal.
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
    float r = ${HEAT_REACH.toFixed(2)} + ${HEAT_GROW.toFixed(2)} * uSev[i];
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
  heat = clamp(max(heatBoost * (0.55 + 0.75 * grain), core), 0.0, 1.0) * ${HEAT_STRENGTH.toFixed(2)};

  vec3 tissue = vec3(0.72) * shade + fres * 0.22;
  vec3 red = mix(vec3(0.55, 0.06, 0.05), vec3(1.0, 0.05, 0.02), heatBoost);
  red *= (0.55 + 0.6 * shade);

  vec3 col = mix(tissue, red, heat);
  float tissueA = 0.42 + 0.32 * diff;
  float alpha = mix(tissueA, 0.98, heat);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}`

// Where each region shows on the surface: the point at which a ray from the region, heading along its `surface` direction, leaves the brain.
// Found by casting from well outside back towards the region and taking the first surface it meets.
function surfaceAnchors(model: THREE.Object3D): THREE.Vector3[] {
  model.updateMatrixWorld(true)
  const raycaster = new THREE.Raycaster()
  return BRAIN_REGIONS.map((region) => {
    const centre = new THREE.Vector3(...region.position)
    const out = new THREE.Vector3(...region.surface).normalize()
    raycaster.set(centre.clone().addScaledVector(out, 4), out.clone().negate())
    return raycaster.intersectObject(model, true)[0]?.point.clone() ?? centre
  })
}

// How close, as a share of the view's height, the pointer has to be to a region's mark to pick it.
const PICK_RADIUS = 0.1
// A mark counts as hidden when the surface in front of it is closer to the camera by more than this.
const HIDDEN_BY = 0.06

// Pointing picks the region whose mark is nearest the pointer on screen, as long as nothing is in front of that mark.
// Picking by a ray through invisible spheres let neighbouring regions shadow one another from some angles.
function Picker({ model, anchors, onSelect }: { model: THREE.Object3D; anchors: THREE.Vector3[]; onSelect: (region: BrainRegion | null) => void }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()
    const spot = new THREE.Vector3()
    const toMark = new THREE.Vector3()
    const visible = (point: THREE.Vector3) => {
      toMark.copy(point).sub(camera.position)
      const distance = toMark.length()
      raycaster.set(camera.position, toMark.normalize())
      const first = raycaster.intersectObject(model, true)[0]
      return !first || first.distance > distance - HIDDEN_BY
    }
    const nearest = (e: PointerEvent): BrainRegion | null => {
      const rect = el.getBoundingClientRect()
      camera.updateMatrixWorld()
      const near: { region: BrainRegion; point: THREE.Vector3; distance: number }[] = []
      for (let i = 0; i < anchors.length; i++) {
        spot.copy(anchors[i]).project(camera)
        const x = rect.left + ((spot.x + 1) / 2) * rect.width
        const y = rect.top + ((1 - spot.y) / 2) * rect.height
        const distance = Math.hypot(x - e.clientX, y - e.clientY)
        if (distance < rect.height * PICK_RADIUS) near.push({ region: BRAIN_REGIONS[i], point: anchors[i], distance })
      }
      near.sort((p, q) => p.distance - q.distance)
      return near.find((mark) => visible(mark.point))?.region ?? null
    }
    // the mouse points by hovering; touch has no hover, so a tap picks and the pick stays until the next tap
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') onSelect(nearest(e))
    }
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') onSelect(nearest(e))
    }
    const leave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') onSelect(null)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointerleave', leave)
    }
  }, [anchors, camera, gl, model, onSelect])

  return null
}

function Specimen({ onSelect }: { onSelect: (region: BrainRegion | null) => void }) {
  const { scene } = useGLTF(MODEL)
  const material = useRef<THREE.ShaderMaterial | null>(null)
  // a copy, so the cached model keeps its own materials
  const model = useMemo(() => scene.clone(true), [scene])
  const anchors = useMemo(() => surfaceAnchors(model), [model])

  // The material is made here, not while rendering, because its uniforms are written every frame.
  useLayoutEffect(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uPos: { value: anchors },
        // the colour comes in once the view is on screen
        uSev: { value: BRAIN_REGIONS.map(() => 0) },
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
  }, [model, anchors])

  useFrame(({ clock }, delta) => {
    const mat = material.current
    if (!mat) return
    const sev = mat.uniforms.uSev.value as number[]
    // frame-rate independent ease towards the target, about the same pace as the app's
    const k = REDUCED_MOTION ? 1 : 1 - Math.exp(-5 * delta)
    BRAIN_REGIONS.forEach((region, i) => {
      sev[i] += (severityOf(region.z) - sev[i]) * k
    })
    mat.uniforms.uTime.value = REDUCED_MOTION ? 0 : clock.elapsedTime
  })

  // the model is the only thing this view loads, so let go of it with the view
  useEffect(() => () => useGLTF.clear(MODEL), [])

  return (
    <>
      <primitive object={model} />
      <Picker model={model} anchors={anchors} onSelect={onSelect} />
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
  picked: BrainRegion | null
  onSelect: (region: BrainRegion | null) => void
}

export default function BrainCanvas({ active, picked, onSelect }: BrainCanvasProps) {
  return (
    <Canvas
      // pulled back from the app's own framing, and turned to the side the regions are marked on
      frameloop="never"
      camera={{ position: [1.2, 0.85, 2.9], fov: 45 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#0a0a0a']} />
      <Gate active={active} />
      <Specimen onSelect={onSelect} />
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
        autoRotate={!REDUCED_MOTION && picked === null}
        autoRotateSpeed={0.7}
      />
    </Canvas>
  )
}
