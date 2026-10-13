// Fetches and downscales an image off the main thread so a multi-megapixel JPEG never blocks a frame.
self.onmessage = async (e: MessageEvent<{ id: number; url: string; maxEdge: number }>) => {
  const { id, url, maxEdge } = e.data
  try {
    const blob = await (await fetch(url)).blob()
    const full = await createImageBitmap(blob)
    const scale = Math.min(1, maxEdge / Math.max(full.width, full.height))
    const bitmap = await createImageBitmap(full, {
      resizeWidth: Math.round(full.width * scale),
      resizeHeight: Math.round(full.height * scale),
      resizeQuality: 'high',
      imageOrientation: 'flipY',
    })
    full.close()
    ;(self as unknown as Worker).postMessage({ id, bitmap }, [bitmap])
  } catch {
    ;(self as unknown as Worker).postMessage({ id, bitmap: null })
  }
}
