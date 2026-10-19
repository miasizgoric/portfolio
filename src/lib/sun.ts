import { useSyncExternalStore } from 'react'
import { getMoonIllumination, getMoonPosition, getPosition } from 'suncalc'
import { clamp01, smoothstep } from './terrainNoise'

export const ZAGREB = { lat: 45.815, lon: 15.982 }

const REFRESH_MS = 60000

export const SUN_DISTANCE = 40

export interface SunState {
  position: [number, number, number]
  dayFactor: number
  nightFactor: number
  twilightFactor: number
  goldenFactor: number
}

export interface MoonState {
  position: [number, number, number]
  light: number
}

interface SkyClock {
  sun: SunState
  moon: MoonState
}

const DEG = Math.PI / 180

function directionFrom(altitudeDeg: number, azimuthDeg: number): [number, number, number] {
  const alt = altitudeDeg * DEG
  const az = azimuthDeg * DEG
  const horizontal = Math.cos(alt)
  return [Math.sin(az) * horizontal, Math.sin(alt), -Math.cos(az) * horizontal]
}

function computeSun(date: Date): SunState {
  const raw = getPosition(date, ZAGREB.lat, ZAGREB.lon)
  const altitude = raw.altitude * DEG

  const dayFactor = smoothstep(-0.1, 0.14, altitude)
  const nightFactor = 1 - smoothstep(-0.3, -0.08, altitude)
  const twilightFactor = clamp01(1 - dayFactor - nightFactor)
  const goldenFactor = smoothstep(-0.08, 0.01, altitude) * (1 - smoothstep(0.05, 0.2, altitude))

  return {
    position: directionFrom(raw.altitude, raw.azimuth),
    dayFactor,
    nightFactor,
    twilightFactor,
    goldenFactor,
  }
}

function computeMoon(date: Date): MoonState {
  const raw = getMoonPosition(date, ZAGREB.lat, ZAGREB.lon)
  const altitude = raw.altitude * DEG
  const { fraction } = getMoonIllumination(date)
  const risen = smoothstep(-0.05, 0.28, altitude)

  return {
    position: directionFrom(raw.altitude, raw.azimuth),
    light: risen * (0.18 + 0.82 * fraction),
  }
}

// The single directional light is the sun by day and the moon by night; the player's shadow follows the same direction and strength.
export function keyLightOf(sun: SunState, moon: MoonState) {
  const night = sun.nightFactor > 0.5
  const moonlit = (0.04 + moon.light * 0.96) * sun.nightFactor
  return {
    night,
    direction: night ? moon.position : sun.position,
    intensity: sun.dayFactor * 3.2 + sun.goldenFactor * 0.9 + moonlit * 1.56,
  }
}

function computeClock(): SkyClock {
  const date = new Date()
  return { sun: computeSun(date), moon: computeMoon(date) }
}

let snapshot = computeClock()
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

function tick() {
  snapshot = computeClock()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (timer === null) timer = setInterval(tick, REFRESH_MS)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

const getClock = () => snapshot

export function useSkyClock(): SkyClock {
  return useSyncExternalStore(subscribe, getClock, getClock)
}
