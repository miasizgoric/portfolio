import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { DEBUG, diag, SCENE_FAILED } from '@/lib/diagnostics'

// Reports what the renderer is doing so a freeze can be told apart from a crash.
export function FrameProbe({ tier }: { tier: number }) {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    diag.tier = tier
  }, [tier])

  useEffect(() => {
    const canvas = gl.domElement
    const lost = (e: Event) => {
      e.preventDefault()
      diag.contextLost++
      window.dispatchEvent(new Event(SCENE_FAILED))
    }
    canvas.addEventListener('webglcontextlost', lost)
    const ctx = gl.getContext()
    const ext = ctx.getExtension('WEBGL_debug_renderer_info')
    diag.gpu = ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'gpu unknown'
    return () => canvas.removeEventListener('webglcontextlost', lost)
  }, [gl])

  useFrame(({ gl: renderer }) => {
    diag.frames++
    diag.lastFrameAt = performance.now()
    if (DEBUG) {
      const i = renderer.info
      diag.info = `calls ${i.render.calls}  tris ${i.render.triangles}  geo ${i.memory.geometries}  tex ${i.memory.textures}  prog ${i.programs?.length ?? 0}`
    }
  })

  return null
}
