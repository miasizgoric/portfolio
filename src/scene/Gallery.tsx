import { useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { rooms } from '@/data/rooms'
import { useSkyClock } from '@/lib/sun'
import { useSkyProbe } from '@/lib/skyProbe'
import { useWeather } from '@/lib/weather'
import { RoomMesh } from './Room'
import { Lighting } from './Lighting'
import { Forest, FOREST_STAGES } from './Forest'
import { CameraRig } from './CameraRig'
import { useGalleryStore } from '@/store/useGalleryStore'
import { useWorld } from '@/world/useWorld'

function useStagedMount(stages: number, enabled: boolean): number {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    if (!enabled || stage >= stages) return
    let timer = 0
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setStage((current) => current + 1), 0)
    })
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [stage, stages, enabled])

  return stage
}

// Frames drawn through the composer while the intro still covers the canvas. The first
// composer frames link the N8AO, bloom and shadow programs synchronously; doing that
// here keeps those stalls out of the reveal.
const PREROLL_FRAMES = 3

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

function useSceneWarmup(mounted: boolean) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const setFrameloop = useThree((state) => state.setFrameloop)
  const advance = useThree((state) => state.advance)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    if (!mounted) return
    let live = true
    let done = false
    const offscreen = new THREE.WebGLRenderTarget(1, 1)
    gl.setRenderTarget(offscreen)
    const finish = async () => {
      if (done) return
      done = true
      clearTimeout(failsafe)
      gl.setRenderTarget(null)
      offscreen.dispose()
      for (let i = 0; i < PREROLL_FRAMES && live; i++) {
        await nextFrame()
        if (live) advance(performance.now() / 1000)
      }
      if (!live) return
      setFrameloop('always')
      // The loop stops itself while the frameloop is 'never' and setFrameloop does not restart
      // it, so without this the scene only began rendering if some unrelated update happened to
      // invalidate it afterwards, and otherwise sat frozen on the last pre-roll frame.
      invalidate()
      useGalleryStore.getState().setSceneReady()
    }
    // A driver that never reports its shaders as compiled must not leave the scene paused forever.
    const failsafe = window.setTimeout(finish, 8000)
    gl.compileAsync(scene, camera).then(finish, finish)
    return () => {
      live = false
      clearTimeout(failsafe)
    }
  }, [mounted, gl, scene, camera, setFrameloop, advance, invalidate])
}

const NIGHT_AIR = new THREE.Color('#0d1728')
const DUSK_AIR = new THREE.Color('#6b5468')
const DAY_AIR = new THREE.Color('#a9bcc6')
const OVERCAST_AIR = new THREE.Color('#8e959b')

export function Gallery() {
  const { sun } = useSkyClock()
  const weather = useWeather()
  const world = useWorld()
  const stage = useStagedMount(FOREST_STAGES, world !== null)
  const probe = useSkyProbe()
  const scene = useThree((state) => state.scene)

  useSceneWarmup(world !== null && stage >= FOREST_STAGES)

  useEffect(() => {
    scene.environment = probe
    scene.environmentIntensity = 0.26
    return () => {
      scene.environment = null
    }
  }, [scene, probe])

  const air = NIGHT_AIR.clone().lerp(DUSK_AIR, sun.twilightFactor).lerp(DAY_AIR, sun.dayFactor)
  const murk = Math.min(weather.haze + weather.cloudCover * 0.3 + weather.intensity * 0.35, 1)
  air.lerp(OVERCAST_AIR, murk * 0.55 * (0.12 + 0.88 * sun.dayFactor))

  const clarity = 1 - Math.min(weather.haze + weather.intensity * 0.5, 0.9)
  const fogNear = (55 + sun.dayFactor * 30) * (0.25 + clarity * 0.75)
  const fogFar = (260 + sun.dayFactor * 200) * (0.2 + clarity * 0.8)

  return (
    <>
      <color attach="background" args={[air.getHex()]} />
      <fog attach="fog" args={[air.getHex(), fogNear, fogFar]} />
      <Lighting />
      <Forest stage={stage} world={world} />
      {world && rooms.map((room) => <RoomMesh key={room.id} room={room} />)}
      <CameraRig />
    </>
  )
}
