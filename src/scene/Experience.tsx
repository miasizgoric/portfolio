import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
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
import { Gallery } from './Gallery'

export function Experience() {
  return (
    <Canvas
      frameloop="never"
      shadows="percentage"
      camera={{ fov: 62, near: 0.1, far: 600 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        gl.debug.checkShaderErrors = import.meta.env.DEV
        gl.shadowMap.autoUpdate = false
      }}
      dpr={[1, 1.6]}
    >
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>

      <EffectComposer multisampling={4}>
        <N8AO halfRes quality="low" aoRadius={2.4} distanceFalloff={0.9} intensity={1.7} color="#0a1018" />
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
