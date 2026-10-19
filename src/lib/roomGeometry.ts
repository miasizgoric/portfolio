import { OUTSIDE, type Room, type Wall } from '@/data/rooms'

export const ROOF_THICKNESS = 0.12
export const ROOF_LIFT = 0.01
export const SOLID_THICKNESS = 0.2

const STEP_RISE = 1.4
const STEP_OVERHANG = 1.15
const STEP_TUCK = 0.12
// the slab's top stands a hair above the floor so no seam shows in the doorway
const STEP_TOP_LIFT = 0.03

interface StepSlab {
  center: [number, number, number]
  size: [number, number, number]
  top: number
}

// The stone slab in front of every doorway that opens outside.
// Room draws it, and the visitor's cloud shadow lies on its top, so both read the geometry from here.
export function entranceSteps(room: Room): StepSlab[] {
  const floorY = room.center[1]
  return room.doorways
    .filter((d) => d.toRoomId === OUTSIDE)
    .map((d): StepSlab => {
      const info = getWallInfo(room, d.wall)
      const out = -info.normalSign
      const [x, , z] = wallPointToWorld(room, d.wall, d.offset, 0)
      const along = d.width + 0.5
      // The slab also runs back under the wall so no strip of ground shows in the doorway.
      const outer = STEP_OVERHANG + SOLID_THICKNESS / 2
      const reach = outer + STEP_TUCK
      const shift = out * ((outer - STEP_TUCK) / 2)
      const y = floorY - STEP_RISE / 2 + STEP_TOP_LIFT
      const top = floorY + STEP_TOP_LIFT
      return info.axis === 'x'
        ? { center: [x, y, z + shift], size: [along, STEP_RISE, reach], top }
        : { center: [x + shift, y, z], size: [reach, STEP_RISE, along], top }
    })
}

export function ceilingY(room: Room): number {
  return room.center[1] + room.height
}

// The walkable top of a room's roof slab.
export function roofTopY(room: Room): number {
  return ceilingY(room) + ROOF_LIFT + ROOF_THICKNESS
}

interface WallInfo {
  axis: 'x' | 'z'
  length: number
  constant: number
  normalAxis: 'x' | 'z'
  normalSign: 1 | -1
  centerU: number
}

export function getWallInfo(room: Room, wall: Wall): WallInfo {
  const [cx, , cz] = room.center
  switch (wall) {
    case 'north':
      return { axis: 'x', length: room.width, constant: cz - room.depth / 2, normalAxis: 'z', normalSign: 1, centerU: cx }
    case 'south':
      return { axis: 'x', length: room.width, constant: cz + room.depth / 2, normalAxis: 'z', normalSign: -1, centerU: cx }
    case 'east':
      return { axis: 'z', length: room.depth, constant: cx + room.width / 2, normalAxis: 'x', normalSign: -1, centerU: cz }
    case 'west':
      return { axis: 'z', length: room.depth, constant: cx - room.width / 2, normalAxis: 'x', normalSign: 1, centerU: cz }
  }
}

export function wallRotationY(info: Pick<WallInfo, 'normalAxis' | 'normalSign'>): number {
  if (info.normalAxis === 'z') return info.normalSign === 1 ? 0 : Math.PI
  return info.normalSign === 1 ? Math.PI / 2 : -Math.PI / 2
}

export function wallPointToWorld(room: Room, wall: Wall, offset: number, elevation: number): [number, number, number] {
  const info = getWallInfo(room, wall)
  const u = info.centerU + offset
  const [, floorY] = room.center
  const y = floorY + elevation
  return info.axis === 'x' ? [u, y, info.constant] : [info.constant, y, u]
}

interface WallSegment {
  u: number
  width: number
  bottom: number
  top: number
}

interface Opening {
  offset: number
  width: number
  bottom: number
  top: number
}

function cutSegment(seg: WallSegment, opening: Opening): WallSegment[] {
  const openLeft = opening.offset - opening.width / 2
  const openRight = opening.offset + opening.width / 2
  const segLeft = seg.u - seg.width / 2
  const segRight = seg.u + seg.width / 2

  if (openRight <= segLeft || openLeft >= segRight) return [seg]
  if (opening.top <= seg.bottom || opening.bottom >= seg.top) return [seg]

  const result: WallSegment[] = []
  const clippedLeft = Math.max(openLeft, segLeft)
  const clippedRight = Math.min(openRight, segRight)

  if (clippedLeft - segLeft > 0.01) {
    const width = clippedLeft - segLeft
    result.push({ u: segLeft + width / 2, width, bottom: seg.bottom, top: seg.top })
  }
  if (segRight - clippedRight > 0.01) {
    const width = segRight - clippedRight
    result.push({ u: clippedRight + width / 2, width, bottom: seg.bottom, top: seg.top })
  }
  const midWidth = clippedRight - clippedLeft
  if (midWidth > 0.01) {
    if (opening.bottom - seg.bottom > 0.01) {
      result.push({ u: opening.offset, width: midWidth, bottom: seg.bottom, top: opening.bottom })
    }
    if (seg.top - opening.top > 0.01) {
      result.push({ u: opening.offset, width: midWidth, bottom: opening.top, top: seg.top })
    }
  }
  return result
}

export function buildWallSegments(room: Room, wall: Wall): WallSegment[] {
  const info = getWallInfo(room, wall)
  let segments: WallSegment[] = [{ u: 0, width: info.length, bottom: 0, top: room.height }]

  const doorway = room.doorways.find((d) => d.wall === wall)
  if (doorway) {
    segments = segments.flatMap((seg) =>
      cutSegment(seg, { offset: doorway.offset, width: doorway.width, bottom: 0, top: doorway.height }),
    )
  }

  return segments
}
