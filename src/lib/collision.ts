import type { Rect, Room } from '@/data/rooms'
import { OUTDOOR_ZONES } from '@/data/rooms'
import { ceilingY, getWallInfo, roofTopY } from './roomGeometry'
import { onStackTop, terrainHeightAt, terrainSlopeAt } from './terrain'

const PLAYER_RADIUS = 0.35
const WALL_CLEARANCE = 0.2
const MAX_WALK_SLOPE = 0.7
const ROOF_CLEARANCE = 0.05

function insideRect(rect: Rect, x: number, z: number, grow = 0): boolean {
  return x >= rect.minX - grow && x <= rect.maxX + grow && z >= rect.minZ - grow && z <= rect.maxZ + grow
}

function roomRect(room: Room): Rect {
  const [cx, , cz] = room.center
  return {
    minX: cx - room.width / 2,
    maxX: cx + room.width / 2,
    minZ: cz - room.depth / 2,
    maxZ: cz + room.depth / 2,
  }
}

function insideDoorwayCorridor(room: Room, x: number, z: number, r: number): boolean {
  for (const doorway of room.doorways) {
    const info = getWallInfo(room, doorway.wall)
    const u = info.axis === 'x' ? x : z
    const c = info.axis === 'x' ? z : x
    const uMin = info.centerU + doorway.offset - doorway.width / 2 + r
    const uMax = info.centerU + doorway.offset + doorway.width / 2 - r
    const cMin = info.constant - r - 0.5
    const cMax = info.constant + r + 0.5
    if (u >= uMin && u <= uMax && c >= cMin && c <= cMax) return true
  }
  return false
}

function insideOutdoors(rooms: Room[], x: number, z: number, r: number): boolean {
  if (!OUTDOOR_ZONES.some((zone) => insideRect(zone, x, z, -r))) return false
  if (rooms.some((room) => insideRect(roomRect(room), x, z, r + WALL_CLEARANCE))) return false
  return terrainSlopeAt(x, z) <= MAX_WALK_SLOPE
}

const MAX_STEP = 0.7

// A visitor standing high on one roof must not walk into the mass of a taller neighbour: at that height the next room's wall or roof is in the way, not its floor.
function inRoomMass(room: Room | undefined, feetY: number): boolean {
  if (!room) return false
  return feetY > room.center[1] + MAX_STEP && feetY < ceilingY(room) + ROOF_CLEARANCE
}

function isWalkable(rooms: Room[], x: number, z: number, here?: Room, feetY = 0): boolean {
  const there = findRoomAt(rooms, x, z)
  if (there && there !== here && inRoomMass(there, feetY)) return false
  for (const room of rooms) {
    if (insideRect(roomRect(room), x, z, -PLAYER_RADIUS)) return true
  }
  for (const room of rooms) {
    if (insideDoorwayCorridor(room, x, z, PLAYER_RADIUS)) return true
  }
  if (onStackTop(x, z, PLAYER_RADIUS)) return true
  return insideOutdoors(rooms, x, z, PLAYER_RADIUS)
}

export function isInBounds(rooms: Room[], x: number, z: number): boolean {
  return isIndoors(rooms, x, z) || onStackTop(x, z) || OUTDOOR_ZONES.some((zone) => insideRect(zone, x, z))
}

// The surface under a point: terrain outdoors, the floor inside a room, or the roof when the feet are already above it.
// `feetY` is what lets a visitor who lands on the roof stay there.
export function groundHeightAt(rooms: Room[], x: number, z: number, feetY: number): number {
  const room = findRoomAt(rooms, x, z)
  if (!room) return terrainHeightAt(x, z)
  return feetY > ceilingY(room) + ROOF_CLEARANCE ? roofTopY(room) : room.center[1]
}

export function resolveMove(
  rooms: Room[],
  x: number,
  z: number,
  dx: number,
  dz: number,
  feetY = 0,
): [number, number] {
  let nx = x
  let nz = z
  const here = findRoomAt(rooms, x, z)

  if (isWalkable(rooms, x + dx, z, here, feetY)) nx = x + dx
  if (isWalkable(rooms, nx, z + dz, here, feetY)) nz = z + dz

  return [nx, nz]
}

export function findRoomAt(rooms: Room[], x: number, z: number): Room | undefined {
  return rooms.find((room) => insideRect(roomRect(room), x, z))
}

export function isIndoors(rooms: Room[], x: number, z: number): boolean {
  return findRoomAt(rooms, x, z) !== undefined
}
