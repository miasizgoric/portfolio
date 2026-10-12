import type { Rect, Room } from '@/data/rooms'
import { OUTDOOR_ZONES } from '@/data/rooms'
import { getWallInfo } from './roomGeometry'
import { terrainSlopeAt } from './terrain'

const PLAYER_RADIUS = 0.35
const WALL_CLEARANCE = 0.2
const MAX_WALK_SLOPE = 0.7

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

function insideInsetRoom(room: Room, x: number, z: number, r: number): boolean {
  const rect = roomRect(room)
  return x >= rect.minX + r && x <= rect.maxX - r && z >= rect.minZ + r && z <= rect.maxZ - r
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

function isWalkable(rooms: Room[], x: number, z: number): boolean {
  for (const room of rooms) {
    if (insideInsetRoom(room, x, z, PLAYER_RADIUS)) return true
  }
  for (const room of rooms) {
    if (insideDoorwayCorridor(room, x, z, PLAYER_RADIUS)) return true
  }
  return insideOutdoors(rooms, x, z, PLAYER_RADIUS)
}

export function isInBounds(rooms: Room[], x: number, z: number): boolean {
  return isIndoors(rooms, x, z) || OUTDOOR_ZONES.some((zone) => insideRect(zone, x, z))
}

export function resolveMove(
  rooms: Room[],
  x: number,
  z: number,
  dx: number,
  dz: number,
): [number, number] {
  let nx = x
  let nz = z

  if (isWalkable(rooms, x + dx, z)) nx = x + dx
  if (isWalkable(rooms, nx, z + dz)) nz = z + dz

  return [nx, nz]
}

function findRoomAt(rooms: Room[], x: number, z: number): Room | undefined {
  return rooms.find((room) => insideRect(roomRect(room), x, z))
}

export function isIndoors(rooms: Room[], x: number, z: number): boolean {
  return findRoomAt(rooms, x, z) !== undefined
}
