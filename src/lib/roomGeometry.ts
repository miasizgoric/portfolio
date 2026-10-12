import type { Room, Wall } from '@/data/rooms'

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
