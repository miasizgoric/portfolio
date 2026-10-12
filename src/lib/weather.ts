import { useEffect, useState } from 'react'

const ZAGREB = { lat: 45.815, lon: 15.982 }
const REFRESH_MS = 10 * 60 * 1000

const ENDPOINT =
  `https://api.open-meteo.com/v1/forecast?latitude=${ZAGREB.lat}&longitude=${ZAGREB.lon}` +
  '&current=precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover,visibility' +
  '&wind_speed_unit=ms'

export type Precipitation = 'none' | 'drizzle' | 'rain' | 'sleet' | 'snow'

interface Weather {
  precipitation: Precipitation
  intensity: number
  windSpeed: number
  windDirection: number
  cloudCover: number
  haze: number
}

const CLEAR: Weather = {
  precipitation: 'none',
  intensity: 0,
  windSpeed: 2,
  windDirection: 0,
  cloudCover: 0.2,
  haze: 0,
}

interface CurrentResponse {
  current?: {
    precipitation?: number
    rain?: number
    showers?: number
    snowfall?: number
    weather_code?: number
    wind_speed_10m?: number
    wind_direction_10m?: number
    cloud_cover?: number
    visibility?: number
  }
}

function classify(code: number, snowfall: number, rain: number): Precipitation {
  if (snowfall > 0 || (code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code === 66 || code === 67 || (code >= 56 && code <= 57)) return 'sleet'
  if (code >= 51 && code <= 55) return 'drizzle'
  if (rain > 0 || (code >= 61 && code <= 65) || (code >= 80 && code <= 82) || code >= 95) return 'rain'
  return 'none'
}

function parse(data: CurrentResponse): Weather {
  const c = data.current ?? {}
  const rain = (c.rain ?? 0) + (c.showers ?? 0)
  const snowfall = c.snowfall ?? 0
  const amount = Math.max(c.precipitation ?? 0, rain, snowfall * 10)
  const kind = classify(c.weather_code ?? 0, snowfall, rain)
  const precipitation = amount > 0 ? kind : 'none'

  return {
    precipitation,
    intensity: precipitation === 'none' ? 0 : Math.min(0.12 + amount / 5, 1),
    windSpeed: c.wind_speed_10m ?? CLEAR.windSpeed,
    windDirection: (((c.wind_direction_10m ?? 0) + 180) * Math.PI) / 180,
    cloudCover: (c.cloud_cover ?? 20) / 100,
    haze: c.visibility === undefined ? 0 : 1 - Math.min(c.visibility / 20000, 1),
  }
}

let snapshot: Weather = CLEAR
let inFlight: Promise<void> | null = null
const listeners = new Set<() => void>()

async function refresh() {
  try {
    const res = await fetch(ENDPOINT)
    if (!res.ok) return
    snapshot = parse((await res.json()) as CurrentResponse)
    listeners.forEach((l) => l())
  } catch {
  } finally {
    inFlight = null
  }
}

export function useWeather(): Weather {
  const [weather, setWeather] = useState(snapshot)

  useEffect(() => {
    const update = () => setWeather(snapshot)
    listeners.add(update)

    if (!inFlight) inFlight = refresh()
    const id = setInterval(() => {
      if (!inFlight) inFlight = refresh()
    }, REFRESH_MS)

    return () => {
      listeners.delete(update)
      clearInterval(id)
    }
  }, [])

  return weather
}
