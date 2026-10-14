import { useEffect, useState } from 'react'
import { diag } from '@/lib/diagnostics'
import { useGalleryStore } from '@/store/useGalleryStore'

export function DebugOverlay() {
  const [text, setText] = useState('')

  useEffect(() => {
    let lastFrames = 0
    let lastTime = performance.now()
    let maxGap = 0
    let prevTick = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      maxGap = Math.max(maxGap, now - prevTick - 250)
      prevTick = now
      const fps = ((diag.frames - lastFrames) * 1000) / (now - lastTime)
      lastFrames = diag.frames
      lastTime = now
      const s = useGalleryStore.getState()
      setText(
        [
          `frames ${diag.frames}  fps ${fps.toFixed(0)}  since last frame ${(now - diag.lastFrameAt).toFixed(0)} ms`,
          `main-thread stall max ${maxGap.toFixed(0)} ms`,
          `tier ${diag.tier}  ready ${s.sceneReady}  moved ${s.hasMoved}  ctxLost ${diag.contextLost}`,
          ...diag.tierLog.slice(-4),
          diag.info,
          diag.gpu,
          `dpr ${window.devicePixelRatio}  ${innerWidth}x${innerHeight}`,
          ...diag.errors,
        ].join('\n'),
      )
    }, 250)
    return () => clearInterval(id)
  }, [])

  return (
    <pre className="pointer-events-none fixed bottom-2 left-2 z-50 max-w-[96vw] whitespace-pre-wrap rounded bg-black/70 p-2 font-mono text-[10px] leading-tight text-lime-300">
      {text}
    </pre>
  )
}
