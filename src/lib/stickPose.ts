import type { TouchStick } from '@/store/useGalleryStore'

// Where the glass stick is this frame, in CSS pixels. The DOM layers (rim, sheen, shadow) and
// the lens shader both read it, so the glass the shader bends and the outline drawn over it
// cannot drift apart. One spring system drives all of it: pop in, follow the finger, spring back.

export const BASE_R = 56
export const BEAD_R = 26
// the base leans toward the finger a little, like a drop of liquid being pulled
export const LEAN = 0.12

export const pose = {
  // 0 hidden .. 1 shown
  amount: 0,
  // where the finger went down
  x: 0,
  y: 0,
  // the bead's offset from there
  bx: 0,
  by: 0,
}

const STIFFNESS = 300
const DAMPING = 20
const MASS = 0.5
const SUBSTEP = 1 / 120

let amountV = 0
let bxV = 0
let byV = 0

const pull = (x: number, v: number, target: number) => (STIFFNESS * (target - x) - DAMPING * v) / MASS

export function stepPose(dt: number, stick: TouchStick | null) {
  const steps = Math.max(1, Math.ceil(dt / SUBSTEP))
  const h = dt / steps
  const target = stick ? 1 : 0
  for (let i = 0; i < steps; i++) {
    amountV += pull(pose.amount, amountV, target) * h
    pose.amount += amountV * h
    if (stick) continue
    bxV += pull(pose.bx, bxV, 0) * h
    byV += pull(pose.by, byV, 0) * h
    pose.bx += bxV * h
    pose.by += byV * h
  }
  if (stick) {
    pose.x = stick.ox
    pose.y = stick.oy
    pose.bx = stick.dx
    pose.by = stick.dy
    bxV = 0
    byV = 0
  }
}

export const poseSettled = () => pose.amount < 0.003 && Math.abs(amountV) < 0.05

export const fadeAmount = () => Math.min(1, Math.max(0, pose.amount))
// the glass grows out of a smaller disc as it appears
export const popScale = () => 0.55 + 0.45 * Math.min(1.05, Math.max(0, pose.amount))
