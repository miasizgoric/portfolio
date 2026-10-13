import { Component, useEffect, type ReactNode } from 'react'
import { useGalleryStore } from '@/store/useGalleryStore'

export function canRunWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export function NoWebGL() {
  useEffect(() => {
    // The intro cover waits for the scene; there is no scene, so let it go.
    useGalleryStore.getState().setSceneReady()
  }, [])

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-[#0d1728] to-black px-8 text-center">
      <div className="font-mono text-4xl lowercase tracking-[0.22em] text-white">mia</div>
      <p className="max-w-sm font-mono text-xs leading-relaxed lowercase tracking-wide text-white/70">
        this site is a walkable 3d scene and your browser could not start it. try another browser, or turn on
        hardware acceleration in its settings. the menu in the corner still opens my work.
      </p>
    </div>
  )
}

// A WebGL context can still fail after the feature check passes (GPU blocklist, lost device).
export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <NoWebGL /> : this.props.children
  }
}
