import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import type { PerspectiveCamera } from 'three'

const BASE_FOV = 62
// How wide the picture should look sideways at least, and how far the vertical angle may open to get there before the top and bottom start to stretch.
const MIN_HORIZONTAL_FOV = 70
const MAX_VERTICAL_FOV = 90

const rad = Math.PI / 180

// A perspective camera's angle is vertical, so a tall phone screen gets a narrow slice of the scene (62 vertical is only ~31 across at 0.46 aspect, against ~94 on a desktop monitor).
// Widening it until the sideways view holds up keeps the picture from feeling cropped.
function fovFor(aspect: number): number {
  const needed = (2 * Math.atan(Math.tan((MIN_HORIZONTAL_FOV * rad) / 2) / aspect)) / rad
  return Math.min(MAX_VERTICAL_FOV, Math.max(BASE_FOV, needed))
}

export function ResponsiveFov() {
  const get = useThree((s) => s.get)
  const aspect = useThree((s) => s.size.width / s.size.height)

  useEffect(() => {
    const camera = get().camera as PerspectiveCamera
    camera.fov = fovFor(aspect)
    camera.updateProjectionMatrix()
  }, [get, aspect])

  return null
}
