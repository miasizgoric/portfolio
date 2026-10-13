let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, (bitmap: ImageBitmap | null) => void>()

function getWorker(): Worker | null {
  if (worker) return worker
  try {
    worker = new Worker(new URL('./bitmap.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; bitmap: ImageBitmap | null }>) => {
      pending.get(e.data.id)?.(e.data.bitmap)
      pending.delete(e.data.id)
    }
    return worker
  } catch {
    return null
  }
}

// Decodes and downscales off the main thread. Resolves null if that is not possible.
export function loadBitmap(url: string, maxEdge: number): Promise<ImageBitmap | null> {
  const w = getWorker()
  if (!w) return Promise.resolve(null)
  return new Promise((resolve) => {
    const id = nextId++
    pending.set(id, resolve)
    w.postMessage({ id, url: new URL(url, location.href).href, maxEdge })
  })
}
