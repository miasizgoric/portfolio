import { useSyncExternalStore } from 'react'
import { surfaceTextures, type SurfaceData, type SurfaceTextures } from '@/lib/proceduralTextures'
import { computeWorld, type WorldData } from './compute'

export interface World extends WorldData {
  mossTextures: SurfaceTextures
  rockTextures: SurfaceTextures
}

let current: World | null = null
let started = false
const listeners = new Set<() => void>()

function publish(data: WorldData) {
  current = {
    ...data,
    mossTextures: surfaceTextures(data.moss),
    rockTextures: surfaceTextures(data.rock),
  }
  listeners.forEach((notify) => notify())
}

// Generation runs in a worker so the page keeps painting and responding while it loads. If
// workers are unavailable the same code runs on the main thread, just later and in one go.
export function startWorld() {
  if (started) return
  started = true
  try {
    const worker = new Worker(new URL('./world.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorldData>) => {
      worker.terminate()
      publish(e.data)
    }
    worker.onerror = () => {
      worker.terminate()
      setTimeout(() => publish(computeWorld().world), 0)
    }
    worker.postMessage(null)
  } catch {
    setTimeout(() => publish(computeWorld().world), 0)
  }
}

const subscribe = (notify: () => void) => {
  listeners.add(notify)
  return () => listeners.delete(notify)
}

export function useWorld(): World | null {
  return useSyncExternalStore(subscribe, () => current)
}

// For components that only mount once the world exists.
export function loadedWorld(): World {
  if (!current) throw new Error('world data requested before it finished loading')
  return current
}

export function floorTextures(wood: SurfaceData, width: number, depth: number): SurfaceTextures {
  return surfaceTextures(wood, [Math.max(1, width / 2.2), Math.max(1, depth / 2.2)])
}
