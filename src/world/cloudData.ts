import { tileable } from '@/lib/proceduralTextures'
import { clamp01, fbm2, makeNoise2D, ridged2 } from '@/lib/terrainNoise'

export const CLOUD_TEX = 256

export function makeCloudData(): Uint8Array {
  const soft = makeNoise2D(60617)
  const wisp = makeNoise2D(71723)
  const data = new Uint8Array(CLOUD_TEX * CLOUD_TEX)
  for (let y = 0; y < CLOUD_TEX; y++) {
    for (let x = 0; x < CLOUD_TEX; x++) {
      const u = x / CLOUD_TEX
      const v = y / CLOUD_TEX
      const body = tileable(u, v, (a, b) => fbm2(soft, a * 3.1, b * 3.1, 4) * 0.5 + 0.5)
      const wisps = tileable(u, v, (a, b) => ridged2(wisp, a * 7.3, b * 7.3, 3))
      data[y * CLOUD_TEX + x] = clamp01(body * 0.78 + wisps * 0.3 - 0.06) * 255
    }
  }
  return data
}
