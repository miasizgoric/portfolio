import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  N8AO,
  Noise,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { useGalleryStore } from '@/store/useGalleryStore'
import { DEBUG, diag, SCENE_FAILED } from '@/lib/diagnostics'
import { NoWebGL } from '@/ui/NoWebGL'
import { FrameProbe } from './FrameProbe'
import { Gallery } from './Gallery'

// Retina laptops and iGPUs are fill-rate bound: the same scene runs about twice as fast at
// dpr 1 as at 1.6. The monitor only ever steps down, so quality never flaps back and forth.
const TIERS = [
  { dpr: 1.5, ao: true, samples: 4 },
  { dpr: 1.25, ao: true, samples: 2 },
  { dpr: 1, ao: false, samples: 0 },
  { dpr: 0.8, ao: false, samples: 0 },
]

// Phones and low-end machines would only spend their first seconds rendering at full quality
// before the monitor steps them down, rebuilding the whole effect chain mid-load. Start them low.
function startingTier(): number {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const touch = window.matchMedia('(pointer: coarse)').matches
  const weak = (nav.deviceMemory ?? 8) <= 4 || (nav.hardwareConcurrency ?? 8) <= 4
  if (touch) return 2
  return weak ? 1 : 0
}

const SAFE_KEY = 'scene-safe-mode'
const STALL_MS = 4000

function readSafe(): boolean {
  // ?safe forces the lightweight renderer, ?safe=0 clears a remembered fallback.
  const param = new URLSearchParams(location.search).get('safe')
  try {
    if (param === '0') localStorage.removeItem(SAFE_KEY)
    else if (param !== null) return true
    return localStorage.getItem(SAFE_KEY) === '1'
  } catch {
    return false
  }
}

function rememberSafe() {
  try {
    localStorage.setItem(SAFE_KEY, '1')
  } catch {
    /* private mode: the fallback still applies for this visit */
  }
}

export function Experience() {
  const [tier, setTier] = useState(startingTier)
  // Safe mode drops the post-processing stack and shadows and renders straight to the screen.
  const [safe, setSafe] = useState(readSafe)
  const [epoch, setEpoch] = useState(0)
  const [dead, setDead] = useState(false)
  const { dpr, ao, samples } = TIERS[tier]
  if (DEBUG) (window as unknown as { __setTier: (t: number) => void }).__setTier = setTier

  // If the renderer stops producing frames or loses its GPU context, rebuild it in safe mode
  // instead of leaving a frozen picture; if even that fails, show the static fallback.
  useEffect(() => {
    const fail = () => {
      if (!safe) {
        rememberSafe()
        // The watchdog stays quiet until the rebuilt scene reports ready again.
        useGalleryStore.setState({ sceneReady: false })
        diag.lastFrameAt = performance.now()
        setSafe(true)
        setEpoch((n) => n + 1)
      } else {
        setDead(true)
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') diag.lastFrameAt = performance.now()
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (!useGalleryStore.getState().sceneReady) return
      if (performance.now() - diag.lastFrameAt > STALL_MS) fail()
    }, 1000)
    window.addEventListener(SCENE_FAILED, fail)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      window.removeEventListener(SCENE_FAILED, fail)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [safe])

  if (dead) return <NoWebGL />

  return (
    <Canvas
      key={epoch}
      frameloop="never"
      shadows={safe ? false : 'percentage'}
      camera={{ fov: 62, near: 0.1, far: 600 }}
      gl={{ antialias: safe, powerPreference: safe ? 'default' : 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        gl.debug.checkShaderErrors = import.meta.env.DEV
        gl.shadowMap.autoUpdate = false
        gl.transmissionResolutionScale = 0.5
      }}
      dpr={safe ? [1, 1] : [1, dpr]}
      style={{ touchAction: 'none' }}
    >
      <PerformanceMonitor
        ms={250}
        bounds={() => [52, 240]}
        iterations={6}
        threshold={0.75}
        onDecline={() => {
          // Frame times are meaningless while the scene is still loading and compiling.
          if (safe || !useGalleryStore.getState().sceneReady) return
          setTier((current) => Math.min(current + 1, TIERS.length - 1))
        }}
      />
      <FrameProbe tier={tier} />
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>

      {!safe && (
        <EffectComposer multisampling={samples}>
          {ao && (
            <N8AO halfRes quality="low" aoRadius={2.4} distanceFalloff={0.9} intensity={1.7} color="#0a1018" />
          )}
          <Bloom intensity={0.34} luminanceThreshold={0.82} luminanceSmoothing={0.28} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <HueSaturation saturation={-0.05} />
          <BrightnessContrast contrast={0.06} />
          <Vignette offset={0.26} darkness={0.42} />
          <Noise opacity={0.016} premultiply />
        </EffectComposer>
      )}
    </Canvas>
  )
}
