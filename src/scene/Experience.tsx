import { Suspense, useState } from 'react'
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

export function Experience() {
  const [tier, setTier] = useState(startingTier)
  const { dpr, ao, samples } = TIERS[tier]

  return (
    <Canvas
      frameloop="never"
      shadows="percentage"
      camera={{ fov: 62, near: 0.1, far: 600 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        gl.debug.checkShaderErrors = import.meta.env.DEV
        gl.shadowMap.autoUpdate = false
        gl.transmissionResolutionScale = 0.5
      }}
      dpr={[1, dpr]}
      style={{ touchAction: 'none' }}
    >
      <PerformanceMonitor
        ms={250}
        bounds={() => [52, 240]}
        iterations={6}
        threshold={0.75}
        onDecline={() => {
          // Frame times are meaningless while the scene is still loading and compiling.
          if (!useGalleryStore.getState().sceneReady) return
          setTier((current) => Math.min(current + 1, TIERS.length - 1))
        }}
      />
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>

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
    </Canvas>
  )
}
