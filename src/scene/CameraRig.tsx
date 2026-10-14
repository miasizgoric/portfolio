import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { rooms, PLAYER_START, EYE_HEIGHT } from '@/data/rooms'
import { resolveMove, isInBounds, findRoomAt, groundHeightAt } from '@/lib/collision'
import { DEBUG } from '@/lib/diagnostics'
import { useGalleryStore } from '@/store/useGalleryStore'

const START_POSITION = new THREE.Vector3(...PLAYER_START)
const MOVE_SPEED = 3.4
const FLY_SPEED = 7
const FLY_LIFT = 5.5
const FLY_CLEARANCE = 0.6
const GRAVITY = 24
const MAX_FALL_SPEED = 30
const FALL_DROP = 0.45

const LOOK_SENSITIVITY = 0.0028
const EDGE_ZONE = 0.16
const EDGE_TURN_SPEED = 1.5
const PITCH_LIMIT = 1.1
const KEY_TURN_SPEED = 1.6
const LOOK_DAMPING = 9
const DOUBLE_TAP_MS = 320
const TOUCH_LOOK_SENSITIVITY = 0.0042
const STICK_RADIUS = 56

interface Keys {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  turnLeft: boolean
  turnRight: boolean
  up: boolean
  down: boolean
}

function setKey(keys: Keys, e: KeyboardEvent, value: boolean): boolean {
  switch (e.code || e.key) {
    case 'KeyW':
    case 'ArrowUp':
    case 'w':
    case 'W':
      keys.forward = value
      return true
    case 'KeyS':
    case 'ArrowDown':
    case 's':
    case 'S':
      keys.back = value
      return true
    case 'KeyA':
    case 'a':
    case 'A':
      keys.left = value
      return true
    case 'KeyD':
    case 'd':
    case 'D':
      keys.right = value
      return true
    case 'ArrowLeft':
      keys.turnLeft = value
      return true
    case 'ArrowRight':
      keys.turnRight = value
      return true
    case 'KeyQ':
    case 'q':
    case 'Q':
      keys.turnLeft = value
      return false
    case 'KeyE':
    case 'e':
    case 'E':
      keys.turnRight = value
      return false
    case 'Space':
    case ' ':
      keys.up = value
      return false
    case 'ShiftLeft':
    case 'ShiftRight':
    case 'Shift':
      keys.down = value
      return false
  }
  return false
}

export function CameraRig() {
  const { camera, gl } = useThree()
  const keys = useRef<Keys>({
    forward: false,
    back: false,
    left: false,
    right: false,
    turnLeft: false,
    turnRight: false,
    up: false,
    down: false,
  })
  const cursor = useRef({ x: 0, y: 0, inside: false })
  const target = useRef({ yaw: 0, pitch: 0 })
  const look = useRef({ yaw: 0, pitch: 0 })
  const stick = useRef({ x: 0, y: 0 })
  const lastSpace = useRef(0)
  const fallSpeed = useRef(0)

  useEffect(() => {
    if (!DEBUG) return
    // Lets a test drive the camera to a spot without walking there.
    ;(window as unknown as { __cam: unknown }).__cam = (x: number, y: number, z: number, yaw: number, pitch: number) => {
      useGalleryStore.setState({ flying: true })
      camera.position.set(x, y, z)
      target.current.yaw = look.current.yaw = yaw
      target.current.pitch = look.current.pitch = pitch
    }
  }, [camera])

  useEffect(() => {
    camera.rotation.order = 'YXZ'
    camera.position.copy(START_POSITION)
    camera.rotation.set(0, 0, 0)
  }, [camera])

  useEffect(() => {
    const el = gl.domElement

    // Touch: the left half of the screen is a floating move stick, the right half drags to look.
    const touches = new Map<number, { role: 'move' | 'look'; x: number; y: number }>()
    const updateStick = (id: number, x: number, y: number) => {
      const t = touches.get(id)
      if (!t) return
      const rawX = x - t.x
      const rawY = y - t.y
      const len = Math.hypot(rawX, rawY)
      const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1
      const dx = rawX * k
      const dy = rawY * k
      stick.current.x = dx / STICK_RADIUS
      stick.current.y = dy / STICK_RADIUS
      useGalleryStore.getState().setStick({ ox: t.x, oy: t.y, dx, dy })
    }
    const handleDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      const role = e.clientX < window.innerWidth / 2 ? 'move' : 'look'
      touches.set(e.pointerId, { role, x: e.clientX, y: e.clientY })
      el.setPointerCapture(e.pointerId)
      useGalleryStore.getState().setHasMoved()
      if (role === 'move') updateStick(e.pointerId, e.clientX, e.clientY)
    }
    const handleTouchMove = (e: PointerEvent) => {
      const t = touches.get(e.pointerId)
      if (!t) return
      if (t.role === 'move') {
        updateStick(e.pointerId, e.clientX, e.clientY)
      } else {
        target.current.yaw -= (e.clientX - t.x) * TOUCH_LOOK_SENSITIVITY
        target.current.pitch = THREE.MathUtils.clamp(
          target.current.pitch - (e.clientY - t.y) * TOUCH_LOOK_SENSITIVITY,
          -PITCH_LIMIT,
          PITCH_LIMIT,
        )
        t.x = e.clientX
        t.y = e.clientY
      }
    }
    const handleUp = (e: PointerEvent) => {
      const t = touches.get(e.pointerId)
      if (!t) return
      touches.delete(e.pointerId)
      if (t.role === 'move') {
        stick.current.x = 0
        stick.current.y = 0
        useGalleryStore.getState().setStick(null)
      }
    }

    const handleMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        handleTouchMove(e)
        return
      }
      const rect = el.getBoundingClientRect()
      cursor.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      cursor.current.y = ((e.clientY - rect.top) / rect.height) * 2 - 1
      cursor.current.inside = true

      target.current.yaw -= (e.movementX ?? 0) * LOOK_SENSITIVITY
      target.current.pitch = THREE.MathUtils.clamp(
        target.current.pitch - (e.movementY ?? 0) * LOOK_SENSITIVITY,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      )
    }
    const handleLeave = () => {
      cursor.current.inside = false
    }

    // Opening the My Work page pauses the scene; a finger or key held at that moment would
    // otherwise still count as pressed when it comes back.
    const unsubscribe = useGalleryStore.subscribe((state, prev) => {
      if (!state.paused || prev.paused) return
      touches.clear()
      stick.current.x = 0
      stick.current.y = 0
      Object.assign(keys.current, { forward: false, back: false, left: false, right: false, turnLeft: false, turnRight: false, up: false, down: false })
      useGalleryStore.getState().setStick(null)
    })

    el.addEventListener('pointerdown', handleDown)
    el.addEventListener('pointerup', handleUp)
    el.addEventListener('pointercancel', handleUp)
    el.addEventListener('pointermove', handleMove)
    el.addEventListener('pointerleave', handleLeave)
    return () => {
      unsubscribe()
      el.removeEventListener('pointerdown', handleDown)
      el.removeEventListener('pointerup', handleUp)
      el.removeEventListener('pointercancel', handleUp)
      el.removeEventListener('pointermove', handleMove)
      el.removeEventListener('pointerleave', handleLeave)
    }
  }, [gl])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // the scene is paused behind the My Work page, which scrolls with the keyboard
      if (useGalleryStore.getState().paused) return
      const isSpace = e.code === 'Space' || e.key === ' '
      if (isSpace) {
        e.preventDefault()
        if (!e.repeat) {
          const now = performance.now()
          if (now - lastSpace.current < DOUBLE_TAP_MS) useGalleryStore.getState().toggleFlying()
          lastSpace.current = now
        }
      }
      if (setKey(keys.current, e, true)) useGalleryStore.getState().setHasMoved()
    }
    const up = (e: KeyboardEvent) => setKey(keys.current, e, false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useFrame((_, delta) => {
    const { turnLeft, turnRight } = keys.current

    if (cursor.current.inside) {
      const overflow = Math.abs(cursor.current.x) - (1 - EDGE_ZONE)
      if (overflow > 0) {
        const strength = Math.min(overflow / EDGE_ZONE, 1)
        target.current.yaw -= Math.sign(cursor.current.x) * strength * EDGE_TURN_SPEED * delta
      }
    }
    if (turnLeft) target.current.yaw += KEY_TURN_SPEED * delta
    if (turnRight) target.current.yaw -= KEY_TURN_SPEED * delta

    look.current.yaw = THREE.MathUtils.damp(look.current.yaw, target.current.yaw, LOOK_DAMPING, delta)
    look.current.pitch = THREE.MathUtils.damp(look.current.pitch, target.current.pitch, LOOK_DAMPING, delta)
    camera.rotation.set(look.current.pitch, look.current.yaw, 0)

    const { forward, back, left, right } = keys.current
    const isFlying = useGalleryStore.getState().flying
    const { up, down } = keys.current

    const { x: stickX, y: stickY } = stick.current
    const stickActive = stickX !== 0 || stickY !== 0

    if (forward || back || left || right || stickActive) {
      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      dir.y = 0
      dir.normalize()
      const rightVec = new THREE.Vector3().crossVectors(dir, camera.up).normalize()

      const move = new THREE.Vector3()
      if (forward) move.add(dir)
      if (back) move.sub(dir)
      if (right) move.add(rightVec)
      if (left) move.sub(rightVec)
      if (stickActive) move.addScaledVector(dir, -stickY).addScaledVector(rightVec, stickX)

      if (move.lengthSq() > 0) {
        if (move.lengthSq() > 1) move.normalize()
        move.multiplyScalar((isFlying ? FLY_SPEED : MOVE_SPEED) * delta)
        if (isFlying) {
          camera.position.x += move.x
          camera.position.z += move.z
        } else {
          const [nx, nz] = resolveMove(rooms, camera.position.x, camera.position.z, move.x, move.z, camera.position.y - EYE_HEIGHT)
          camera.position.x = nx
          camera.position.z = nz
        }
      }
    }

    if (!isFlying && !isInBounds(rooms, camera.position.x, camera.position.z)) {
      camera.position.copy(START_POSITION)
      target.current.yaw = 0
      target.current.pitch = 0
      look.current.yaw = 0
      look.current.pitch = 0
      camera.rotation.set(0, 0, 0)
      return
    }

    // Landing on a roof or a sea stack keeps the visitor standing there instead of dropping to
    // the terrain or the room floor underneath.
    const groundY = groundHeightAt(
      rooms,
      camera.position.x,
      camera.position.z,
      camera.position.y - (isFlying ? FLY_CLEARANCE : EYE_HEIGHT),
    )

    if (isFlying) {
      fallSpeed.current = 0
      if (up) camera.position.y += FLY_LIFT * delta
      if (down) camera.position.y -= FLY_LIFT * delta
      camera.position.y = Math.max(camera.position.y, groundY + FLY_CLEARANCE)
    } else {
      const standY = groundY + EYE_HEIGHT
      const step = Math.min(delta, 0.05)
      if (camera.position.y > standY + FALL_DROP) {
        fallSpeed.current = Math.min(fallSpeed.current + GRAVITY * step, MAX_FALL_SPEED)
        camera.position.y = Math.max(camera.position.y - fallSpeed.current * step, standY)
      } else {
        fallSpeed.current = 0
        camera.position.y = THREE.MathUtils.damp(camera.position.y, standY, 12, delta)
      }
    }

    // The screens in a room only switch on once the visitor walks in.
    const room = findRoomAt(rooms, camera.position.x, camera.position.z)
    if (room && !useGalleryStore.getState().enteredRooms[room.id]) useGalleryStore.getState().enterRoom(room.id)
  })

  return null
}
