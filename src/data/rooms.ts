export type Wall = 'north' | 'south' | 'east' | 'west'

export interface Artwork {
  id: string
  imageUrl?: string
  wall: Wall
  offset: number
  width: number
  height: number
  elevation: number
}

interface Doorway {
  wall: Wall
  offset: number
  width: number
  height: number
  toRoomId: string
}

type WallMaterial = 'glass' | 'solid'

export interface Room {
  id: string
  center: [number, number, number]
  width: number
  depth: number
  height: number
  floorColor: string
  wallColor: string
  ceilingColor: string
  wallMaterial: WallMaterial
  doorways: Doorway[]
  artworks: Artwork[]
}

export const PLAYER_START: [number, number, number] = [0, 1.65, 15]

export const EYE_HEIGHT = 1.65

export interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export const OUTSIDE = 'outside'

export const OUTDOOR_ZONES: Rect[] = [{ minX: -45, maxX: 45, minZ: -48, maxZ: 52 }]

export const rooms: Room[] = [
  {
    id: 'entrance',
    center: [0, 0, 6],
    width: 6,
    depth: 8,
    height: 4,
    floorColor: '#4a3225',
    wallColor: '#e8e2d6',
    ceilingColor: '#f2ece0',
    wallMaterial: 'solid',
    doorways: [
      { wall: 'north', offset: 0, width: 3, height: 3, toRoomId: 'gallery-1' },
      { wall: 'south', offset: 0, width: 3.2, height: 3, toRoomId: OUTSIDE },
    ],
    artworks: [],
  },
  {
    id: 'gallery-1',
    center: [0, 0, -7],
    width: 18,
    depth: 18,
    height: 6,
    floorColor: '#3f2b20',
    wallColor: '#e6ddd0',
    ceilingColor: '#efe7db',
    wallMaterial: 'glass',
    doorways: [{ wall: 'south', offset: 0, width: 3, height: 3, toRoomId: 'entrance' }],
    artworks: [
      {
        id: 'artwork-1',
        imageUrl: '/artwork/1.jpeg',
        wall: 'north',
        offset: -4,
        width: 2.2,
        height: 1.6,
        elevation: 2.1,
      },
      {
        id: 'artwork-2',
        imageUrl: '/artwork/2.jpeg',
        wall: 'north',
        offset: 4,
        width: 2.2,
        height: 1.6,
        elevation: 2.1,
      },
      {
        id: 'artwork-3',
        imageUrl: '/artwork/3.jpeg',
        wall: 'east',
        offset: -4,
        width: 2.2,
        height: 1.6,
        elevation: 2.1,
      },
      {
        id: 'artwork-4',
        imageUrl: '/artwork/4.jpeg',
        wall: 'east',
        offset: 4,
        width: 2.2,
        height: 1.6,
        elevation: 2.1,
      },
      {
        id: 'artwork-5',
        imageUrl: '/artwork/5.jpeg',
        wall: 'west',
        offset: -4,
        width: 2.2,
        height: 1.6,
        elevation: 2.1,
      },
      {
        id: 'artwork-6',
        imageUrl: '/artwork/6.jpeg',
        wall: 'west',
        offset: 4,
        width: 2.2,
        height: 1.6,
        elevation: 2.1,
      },
    ],
  },
]
