import {
  createMossData,
  createRockData,
  createWoodFloorData,
  surfaceBuffers,
  type SurfaceData,
} from '@/lib/proceduralTextures'
import { getTerrainField } from '@/lib/terrain'
import { makeCloudData } from './cloudData'
import { makePatchData, makeWaveData } from './seaData'
import { buildGroveChunks, type ChunkArrays, type LayerName } from './grove'
import { buildOutcropArrays, type BoulderArrays } from './outcrops'
import { buildTerrainArrays, type TerrainArrays } from './terrainMesh'

// Everything the scene needs that is expensive to generate and never changes: textures, the terrain mesh, boulders and every tree and blade of grass.
// It is plain typed arrays so it can be built in a worker and handed to the main thread without copying.
export interface WorldData {
  moss: SurfaceData
  rock: SurfaceData
  wood: SurfaceData
  terrain: TerrainArrays
  boulders: BoulderArrays[]
  grove: Record<LayerName, ChunkArrays[]>
  clouds: Uint8Array
  seaWaves: Uint8Array
  seaPatches: Uint8Array
}

export function computeWorld(): { world: WorldData; transfer: ArrayBuffer[] } {
  const field = getTerrainField()
  const world: WorldData = {
    moss: createMossData(),
    rock: createRockData(),
    wood: createWoodFloorData(),
    terrain: buildTerrainArrays(field),
    boulders: buildOutcropArrays(field),
    grove: buildGroveChunks(),
    clouds: makeCloudData(),
    seaWaves: makeWaveData(),
    seaPatches: makePatchData(),
  }

  const transfer: ArrayBuffer[] = [
    ...surfaceBuffers(world.moss),
    ...surfaceBuffers(world.rock),
    ...surfaceBuffers(world.wood),
  ]
  transfer.push(world.clouds.buffer as ArrayBuffer, world.seaWaves.buffer as ArrayBuffer, world.seaPatches.buffer as ArrayBuffer)
  const { terrain } = world
  transfer.push(
    terrain.position.buffer as ArrayBuffer,
    terrain.normal.buffer as ArrayBuffer,
    terrain.color.buffer as ArrayBuffer,
    terrain.rockiness.buffer as ArrayBuffer,
    terrain.uv.buffer as ArrayBuffer,
    terrain.index.buffer as ArrayBuffer,
  )
  for (const b of world.boulders) {
    transfer.push(b.position.buffer as ArrayBuffer, b.normal.buffer as ArrayBuffer, b.uv.buffer as ArrayBuffer, b.color.buffer as ArrayBuffer)
  }
  for (const chunks of Object.values(world.grove)) {
    for (const c of chunks) {
      transfer.push(c.matrices.buffer as ArrayBuffer, c.colors.buffer as ArrayBuffer)
    }
  }
  return { world, transfer }
}
