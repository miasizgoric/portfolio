import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { OUTSIDE, type Room as RoomData, type Wall } from '@/data/rooms'
import { buildWallSegments, wallPointToWorld, getWallInfo } from '@/lib/roomGeometry'
import { createWoodFloorTextures, getRockTextures } from '@/lib/proceduralTextures'
import { Artwork } from './Artwork'

const SOLID_THICKNESS = 0.2
const GLASS_THICKNESS = 0.04
const FRAME_COLOR = '#e3b3a6'
const WALLS: Wall[] = ['north', 'south', 'east', 'west']
const FLOOR_NORMAL_SCALE = new THREE.Vector2(0.35, 0.35)
const PLASTER_NORMAL_SCALE = new THREE.Vector2(0.14, 0.14)
const ROOF_THICKNESS = 0.12
const ROOF_LIFT = 0.01
const EAVE = 0.15
const MAX_LAMPS = 2
const LAMP_TONE = '#ffeccc'
const LAMP_INTENSITY = 17
const LAMP_REACH = 30
const STEP_RISE = 1.4
const STEP_OVERHANG = 1.15

function WallMesh({ room, wall }: { room: RoomData; wall: Wall }) {
  const info = getWallInfo(room, wall)
  const segments = useMemo(() => buildWallSegments(room, wall), [room, wall])
  const isGlass = room.wallMaterial === 'glass'
  const thickness = isGlass ? GLASS_THICKNESS : SOLID_THICKNESS
  const plaster = getRockTextures()

  return (
    <group>
      {segments.map((seg, i) => {
        const elevation = (seg.bottom + seg.top) / 2
        const position = wallPointToWorld(room, wall, seg.u, elevation)
        const height = seg.top - seg.bottom
        const size: [number, number, number] =
          info.axis === 'x' ? [seg.width, height, thickness] : [thickness, height, seg.width]
        return (
          <mesh key={i} position={position} castShadow={!isGlass} receiveShadow>
            <boxGeometry args={size} />
            {isGlass ? (
              <meshPhysicalMaterial
                color="#dfeee8"
                transmission={0.94}
                roughness={0.06}
                thickness={0.45}
                ior={1.52}
                metalness={0}
                envMapIntensity={1.6}
                attenuationColor="#9ec7bb"
                attenuationDistance={6}
                transparent
              />
            ) : (
              <meshStandardMaterial
                color={room.wallColor}
                normalMap={plaster.normalMap}
                roughnessMap={plaster.roughnessMap}
                normalScale={PLASTER_NORMAL_SCALE}
                roughness={0.95}
                metalness={0}
              />
            )}
          </mesh>
        )
      })}
    </group>
  )
}

function FramePosts({ room }: { room: RoomData }) {
  const [cx, floorY, cz] = room.center
  const corners: [number, number][] = [
    [cx - room.width / 2, cz - room.depth / 2],
    [cx + room.width / 2, cz - room.depth / 2],
    [cx - room.width / 2, cz + room.depth / 2],
    [cx + room.width / 2, cz + room.depth / 2],
  ]

  const mullions: [number, number][] = []
  const BAY = 2.4
  for (const [axis, constant] of [
    ['x', cz - room.depth / 2],
    ['x', cz + room.depth / 2],
  ] as const) {
    const bays = Math.max(1, Math.round(room.width / BAY))
    for (let i = 1; i < bays; i++) {
      const x = cx - room.width / 2 + (room.width / bays) * i
      const blocked = room.doorways.some(
        (d) => d.wall === (constant < cz ? 'north' : 'south') && Math.abs(x - (cx + d.offset)) < d.width / 2 + 0.2,
      )
      if (!blocked && axis === 'x') mullions.push([x, constant])
    }
  }
  for (const constant of [cx - room.width / 2, cx + room.width / 2]) {
    const bays = Math.max(1, Math.round(room.depth / BAY))
    for (let i = 1; i < bays; i++) {
      const z = cz - room.depth / 2 + (room.depth / bays) * i
      const blocked = room.doorways.some(
        (d) => d.wall === (constant < cx ? 'west' : 'east') && Math.abs(z - (cz + d.offset)) < d.width / 2 + 0.2,
      )
      if (!blocked) mullions.push([constant, z])
    }
  }

  return (
    <>
      {corners.map(([x, z], i) => (
        <mesh key={i} position={[x, floorY + room.height / 2, z]} castShadow>
          <boxGeometry args={[0.12, room.height, 0.12]} />
          <meshStandardMaterial color={FRAME_COLOR} roughness={0.4} metalness={0.1} />
        </mesh>
      ))}

      {mullions.map(([x, z], i) => (
        <mesh key={`m${i}`} position={[x, floorY + room.height / 2, z]} castShadow>
          <boxGeometry args={[0.07, room.height, 0.07]} />
          <meshStandardMaterial color={FRAME_COLOR} roughness={0.45} metalness={0.1} />
        </mesh>
      ))}

      <mesh position={[cx, floorY - 0.14, cz]}>
        <boxGeometry args={[room.width + 0.06, 0.26, room.depth + 0.06]} />
        <meshStandardMaterial color={FRAME_COLOR} roughness={0.5} metalness={0.08} />
      </mesh>
    </>
  )
}

function Thresholds({ room }: { room: RoomData }) {
  const floorY = room.center[1]
  const stone = getRockTextures()

  return (
    <>
      {room.doorways
        .filter((d) => d.toRoomId === OUTSIDE)
        .map((d, i) => {
          const info = getWallInfo(room, d.wall)
          const out = -info.normalSign
          const [x, , z] = wallPointToWorld(room, d.wall, d.offset, 0)
          const along = d.width + 0.5
          const shift = out * (STEP_OVERHANG / 2 + SOLID_THICKNESS / 2)
          const size: [number, number, number] =
            info.axis === 'x' ? [along, STEP_RISE, STEP_OVERHANG] : [STEP_OVERHANG, STEP_RISE, along]
          return (
            <mesh
              key={i}
              position={[
                info.axis === 'x' ? x : x + shift,
                floorY - STEP_RISE / 2 + 0.03,
                info.axis === 'x' ? z + shift : z,
              ]}
              receiveShadow
              castShadow
            >
              <boxGeometry args={size} />
              <meshStandardMaterial
                color="#9c9385"
                normalMap={stone.normalMap}
                roughnessMap={stone.roughnessMap}
                normalScale={PLASTER_NORMAL_SCALE}
                roughness={0.94}
                metalness={0}
              />
            </mesh>
          )
        })}
    </>
  )
}

function Roof({ room }: { room: RoomData }) {
  const [cx, floorY, cz] = room.center
  const eave = (wall: Wall) =>
    room.doorways.some((d) => d.wall === wall && d.toRoomId !== OUTSIDE) ? 0 : EAVE
  const north = eave('north')
  const south = eave('south')
  const east = eave('east')
  const west = eave('west')

  return (
    <mesh
      position={[
        cx + (east - west) / 2,
        floorY + room.height + ROOF_LIFT + ROOF_THICKNESS / 2,
        cz + (south - north) / 2,
      ]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[room.width + east + west, ROOF_THICKNESS, room.depth + north + south]} />
      {room.wallMaterial === 'glass' ? (
        <meshStandardMaterial color={FRAME_COLOR} roughness={0.4} metalness={0.1} />
      ) : (
        <meshStandardMaterial color={room.wallColor} roughness={0.9} />
      )}
    </mesh>
  )
}

function CeilingLights({ room }: { room: RoomData }) {
  const [cx, floorY, cz] = room.center
  const cols = Math.max(1, Math.round(room.width / 4.5))
  const rows = Math.max(1, Math.round(room.depth / 4.5))
  const y = floorY + room.height - 0.5

  const fixtures: [number, number][] = []
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      fixtures.push([
        cx - room.width / 2 + (room.width / (cols + 1)) * (c + 1),
        cz - room.depth / 2 + (room.depth / (rows + 1)) * (r + 1),
      ])
    }
  }

  const lamps: [number, number][] = []
  const lampCount = Math.min(MAX_LAMPS, Math.max(1, Math.round((room.width * room.depth) / 170)))
  const spreadX = room.width >= room.depth
  for (let i = 0; i < lampCount; i++) {
    const t = (i + 1) / (lampCount + 1)
    lamps.push(
      spreadX ? [cx - room.width / 2 + room.width * t, cz] : [cx, cz - room.depth / 2 + room.depth * t],
    )
  }

  return (
    <>
      {fixtures.map(([x, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh position={[0, 0.26, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.5, 6]} />
            <meshStandardMaterial color="#b9ae9c" roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.05, 0.05, 1.6, 12]} />
            <meshStandardMaterial
              color="#fdf6e6"
              emissive={LAMP_TONE}
              emissiveIntensity={1.9}
              roughness={0.4}
            />
          </mesh>
        </group>
      ))}

      {lamps.map(([x, z], i) => (
        <pointLight
          key={`lamp-${i}`}
          position={[x, y - 0.4, z]}
          intensity={LAMP_INTENSITY}
          distance={LAMP_REACH}
          decay={2}
          color={LAMP_TONE}
        />
      ))}
    </>
  )
}

export function RoomMesh({ room }: { room: RoomData }) {
  const [cx, floorY, cz] = room.center

  const floor = useMemo(() => createWoodFloorTextures(room.width, room.depth), [room.width, room.depth])
  useEffect(() => () => floor.dispose(), [floor])

  return (
    <group>
      <mesh position={[cx, floorY, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[room.width, room.depth]} />
        <meshStandardMaterial
          color={room.floorColor}
          map={floor.map}
          normalMap={floor.normalMap}
          roughnessMap={floor.roughnessMap}
          normalScale={FLOOR_NORMAL_SCALE}
          roughness={0.88}
          metalness={0}
        />
      </mesh>

      <mesh position={[cx, floorY + room.height, cz]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[room.width, room.depth]} />
        <meshStandardMaterial color={room.ceilingColor} roughness={1} />
      </mesh>

      <Roof room={room} />

      <Thresholds room={room} />

      {room.wallMaterial === 'glass' && <FramePosts room={room} />}

      <CeilingLights room={room} />

      {WALLS.map((wall) => (
        <WallMesh key={wall} room={room} wall={wall} />
      ))}

      {room.artworks.map((artwork) => (
        <Artwork key={artwork.id} room={room} artwork={artwork} />
      ))}
    </group>
  )
}
