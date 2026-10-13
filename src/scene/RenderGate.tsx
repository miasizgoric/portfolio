import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { diag } from '@/lib/diagnostics'
import { useGalleryStore } from '@/store/useGalleryStore'

// Stops drawing while the My Work page covers the scene and starts again, loop included, when
// it is dismissed. Rendering a hidden scene only burns battery and GPU memory.
export function RenderGate() {
  const paused = useGalleryStore((s) => s.paused)
  const setFrameloop = useThree((s) => s.setFrameloop)
  const invalidate = useThree((s) => s.invalidate)
  const previous = useRef(false)

  useEffect(() => {
    if (paused === previous.current) return
    previous.current = paused
    if (!useGalleryStore.getState().sceneReady) return
    if (paused) {
      setFrameloop('never')
    } else {
      diag.lastFrameAt = performance.now()
      setFrameloop('always')
      invalidate()
    }
  }, [paused, setFrameloop, invalidate])

  return null
}
