// A glass bubble that drops a pill out of its underside.
//
// The pill hangs off the bubble on a neck that thins, snaps near the end of the fall, then
// overshoots and settles as a separate piece. Closing is the reverse: it rises, the neck
// forms again and it sinks back into the bubble.
//
// The whole thing is one outline (`clip-path: path()`), so a single piece of glass keeps
// its backdrop blur, and the browser runs the morph itself from generated @keyframes:
// the path is only computed once, nothing is driven from JS per frame. When the neck is
// gone the outline keeps a zero-width bridge between the two pieces, which paints nothing.
//
// Timing was read off a reference clip: the width/extension overshoots by ~16% and settles.

export interface DropSpec {
  bubble: number
  pillWidth: number
  pillHeight: number
  gap: number
  neck: number
  rim: number
}

interface Solved {
  cy: number
  r: number
  n: number
  lb: number
  sinR: number
  alpha: number
}

interface Pt {
  x: number
  y: number
}

type Table = ReadonlyArray<readonly [number, number]>

// How far the pill has dropped over time in seconds: 0 = tucked into the bubble,
// 1 = settled, above 1 = overshoot.
const OPEN: Table = [
  [0, 0],
  [0.067, 0.29],
  [0.133, 0.59],
  [0.2, 0.86],
  [0.267, 1.04],
  [0.333, 1.14],
  [0.4, 1.157],
  [0.467, 1.125],
  [0.533, 1.09],
  [0.6, 1.05],
  [0.667, 1.02],
  [0.733, 1.01],
  [0.8, 1],
]
const CLOSE: Table = [
  [0, 1],
  [0.1, 1],
  [0.17, 0.75],
  [0.23, 0.37],
  [0.3, 0],
]

const OPEN_STEP = 0.04
const CLOSE_STEP = 0.03
const OVERSHOOT = 1.2
const TAU = Math.PI * 2

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (v: number) => {
  const t = clamp01(v)
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const fmt = (v: number) => String(Math.round(v * 10) / 10)

// 1 while the pill still hangs off the bubble, 0 once the neck has snapped
const openAttach = (t: number) => 1 - smooth((t - 0.1) / 0.14)
const closeAttach = (t: number) => smooth((t - 0.1) / 0.1)

function sample(table: Table, t: number) {
  const last = table.length - 1
  if (t <= table[0][0]) return table[0][1]
  if (t >= table[last][0]) return table[last][1]
  let i = 0
  while (table[i + 1][0] < t) i++
  const [t0, v0] = table[i]
  const [t1, v1] = table[i + 1]
  const h = t1 - t0
  const slope = (a: number, b: number) => (table[b][1] - table[a][1]) / (table[b][0] - table[a][0])
  const m0 = i > 0 ? slope(i - 1, i + 1) : slope(i, i + 1)
  const m1 = i + 1 < last ? slope(i, i + 2) : slope(i, i + 1)
  const u = (t - t0) / h
  const u2 = u * u
  const u3 = u2 * u
  const v = (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * h * m1
  return Math.max(0, v)
}

// e: how far down the pill is, d: how attached it still is to the bubble
function solve(spec: DropSpec, e: number, d: number): Solved {
  const R = spec.bubble / 2
  const rf = spec.pillHeight / 2
  const bottom = 2 * R + e * (spec.gap + spec.pillHeight)

  const r = rf * Math.min(1, e / 0.9)
  const settle = smooth((e - 0.25) / 0.75)
  const n = Math.min(0.92 * r, lerp(0.9 * R, spec.neck / 2, settle)) * d
  const alpha = Math.asin(Math.min(0.98, (n + 0.18 * R * smooth(e / 0.25) * d) / R))
  const sinR = r > 0.01 ? Math.min(0.99, n / r + 0.15 * d) : 0
  const lb = (spec.pillWidth - spec.pillHeight) * smooth((e - 0.45) / 0.55)
  return { cy: bottom - r, r, n, lb, sinR, alpha }
}

// One closed outline, bubble on top and pill below it. The pill's right cap sits under the
// bubble and its body runs to the left, because the bubble lives against the right edge of
// the screen. Every call emits the same 14 cubic segments, which is what lets the browser
// interpolate any two of them.
function contour(spec: DropSpec, s: Solved, inset: number, width: number) {
  const R = Math.max(0.01, spec.bubble / 2 - inset)
  const r = Math.max(0, s.r - inset)
  const n = Math.max(0, s.n - inset)
  const xb = width - spec.bubble / 2
  const yb = spec.bubble / 2
  const pl = xb - s.lb
  const cy = s.cy
  const { alpha, sinR } = s
  const psiR = Math.asin(sinR)
  const dx = r * sinR

  const bub = (mu: number): Pt => ({ x: xb + R * Math.sin(mu), y: yb + R * Math.cos(mu) })
  const capR = (psi: number): Pt => ({ x: xb + r * Math.sin(psi), y: cy - r * Math.cos(psi) })
  const capL = (psi: number): Pt => ({ x: pl + r * Math.sin(psi), y: cy - r * Math.cos(psi) })

  const pt = (q: Pt) => `${fmt(q.x)} ${fmt(q.y)}`
  const cubic = (a: Pt, b: Pt, c: Pt) => `C${pt(a)} ${pt(b)} ${pt(c)}`
  const arcBubble = (a: number, b: number) => {
    const k = (4 / 3) * Math.tan((b - a) / 4) * R
    const p0 = bub(a)
    const p3 = bub(b)
    return cubic(
      { x: p0.x + k * Math.cos(a), y: p0.y - k * Math.sin(a) },
      { x: p3.x - k * Math.cos(b), y: p3.y + k * Math.sin(b) },
      p3,
    )
  }
  const arcCap = (at: (psi: number) => Pt, a: number, b: number) => {
    const k = (4 / 3) * Math.tan((b - a) / 4) * r
    const p0 = at(a)
    const p3 = at(b)
    return cubic(
      { x: p0.x + k * Math.cos(a), y: p0.y + k * Math.sin(a) },
      { x: p3.x - k * Math.cos(b), y: p3.y - k * Math.sin(b) },
      p3,
    )
  }
  const line = (a: Pt, b: Pt) =>
    cubic(
      { x: lerp(a.x, b.x, 1 / 3), y: lerp(a.y, b.y, 1 / 3) },
      { x: lerp(a.x, b.x, 2 / 3), y: lerp(a.y, b.y, 2 / 3) },
      b,
    )

  // the neck's left wall lands on the flat top of the pill, or on its left cap while the
  // body is still shorter than the neck is wide
  let psiL = TAU
  let landL: Pt = { x: xb - dx, y: cy - r }
  if (dx > s.lb && r > 1e-6) {
    psiL = TAU + Math.asin(Math.max(-1, (s.lb - dx) / r))
    landL = capL(psiL)
  }

  const j1 = bub(alpha)
  const j1b = bub(-alpha)
  const jR = capR(psiR)
  const nr: Pt = { x: xb + n, y: (j1.y + jR.y) / 2 }
  const nl: Pt = { x: xb - n, y: (j1b.y + landL.y) / 2 }

  const a1x = (j1.x - nr.x) / 2
  const a1y = (nr.y - j1.y) / 2
  const a2x = (jR.x - nr.x) / 2
  const a2y = (jR.y - nr.y) / 2
  const a3x = (nl.x - landL.x) / 2
  const a3y = (landL.y - nl.y) / 2
  const a4x = (nl.x - j1b.x) / 2
  const a4y = (nl.y - j1b.y) / 2

  const midR = (psiR + Math.PI) / 2
  const midL = (Math.PI + psiL) / 2
  const parts = [
    `M${pt(j1)}`,
    cubic({ x: j1.x - a1x * Math.cos(alpha), y: j1.y + a1x * Math.sin(alpha) }, { x: nr.x, y: nr.y - a1y }, nr),
    cubic({ x: nr.x, y: nr.y + a2y }, { x: jR.x - a2x * Math.cos(psiR), y: jR.y - a2x * Math.sin(psiR) }, jR),
    arcCap(capR, psiR, midR),
    arcCap(capR, midR, Math.PI),
    line(capR(Math.PI), capL(Math.PI)),
    arcCap(capL, Math.PI, midL),
    arcCap(capL, midL, psiL),
    line(capL(psiL), landL),
    cubic(
      { x: landL.x + a3x * Math.cos(psiL), y: landL.y + a3x * Math.sin(psiL) },
      { x: nl.x, y: nl.y + a3y },
      nl,
    ),
    cubic({ x: nl.x, y: nl.y - a4y }, { x: j1b.x + a4x * Math.cos(alpha), y: j1b.y + a4x * Math.sin(alpha) }, j1b),
  ]
  const sweep = (-TAU + 2 * alpha) / 4
  for (let i = 0; i < 4; i++) parts.push(arcBubble(-alpha + i * sweep, -alpha + (i + 1) * sweep))
  parts.push('Z')
  return parts.join('')
}

export function buildDrop(spec: DropSpec) {
  const R = spec.bubble / 2
  const rf = spec.pillHeight / 2
  const travel = spec.gap + spec.pillHeight
  const width = Math.ceil(spec.pillWidth + R - rf) + 1
  const height = Math.ceil(2 * R + OVERSHOOT * travel)

  const solidPath = (e: number, d: number) => `path('${contour(spec, solve(spec, e, d), 0, width)}')`
  const ringPath = (e: number, d: number) => {
    const s = solve(spec, e, d)
    return `path(evenodd,'${contour(spec, s, 0, width)}${contour(spec, s, spec.rim, width)}')`
  }
  const solid = (e: number, d: number) => `clip-path:${solidPath(e, d)}`
  const ring = (e: number, d: number) => `clip-path:${ringPath(e, d)}`
  // the pill (and its label and hit area) rides along with the drop
  const slide = (e: number) => `transform:translateY(${fmt((e - 1) * travel)}px)`

  const frames = (
    table: Table,
    step: number,
    attach: (t: number) => number,
    make: (e: number, d: number) => string,
  ) => {
    const total = table[table.length - 1][0]
    const count = Math.round(total / step)
    const out: string[] = []
    for (let i = 0; i <= count; i++) {
      const t = (i / count) * total
      out.push(`${fmt((t / total) * 100)}%{${make(sample(table, t), attach(t))}}`)
    }
    return out.join('')
  }

  const openTime = OPEN[OPEN.length - 1][0]
  const closeTime = CLOSE[CLOSE.length - 1][0]
  // where the text is born: the bubble's centre, relative to where it ends up in the pill
  const shiftX = spec.pillWidth / 2 - rf
  const shiftY = -(R + spec.gap + rf)
  const from = (k: number) => `translate(${fmt(shiftX * k)}px,${fmt(shiftY * k)}px)`

  // The pill's shadow only shows once the pill has cleared the bubble, so it never shows through
  // the glass it is still tucked into. box-shadow is only ever drawn outside the box, so the
  // pill itself stays clean, and it follows the pill's shape instead of a filtered, clipped copy.
  const css = `
.gd{position:absolute;top:0;right:0;width:${width}px;height:${height}px;pointer-events:none}
.gd-clip{position:absolute;inset:0;clip-path:${solidPath(0, 1)}}
.gd-rim{clip-path:${ringPath(0, 1)}}
.gd-bubble-shadow{position:absolute;top:0;right:0;width:${spec.bubble}px;height:${spec.bubble}px;border-radius:50%;pointer-events:none}
.gd-pill-shadow{position:absolute;top:${2 * R + spec.gap}px;left:${width - R + rf - spec.pillWidth}px;width:${spec.pillWidth}px;height:${spec.pillHeight}px;border-radius:9999px;pointer-events:none}
.gd-pill{position:absolute;top:${2 * R + spec.gap}px;left:${width - R + rf - spec.pillWidth}px;width:${spec.pillWidth}px;height:${spec.pillHeight}px;pointer-events:auto;cursor:pointer;display:flex;align-items:center;justify-content:center}
.gd-label{display:block;transform-origin:center}
[data-phase=idle] .gd-pill,[data-phase=idle] .gd-pill-shadow{visibility:hidden}
[data-phase=open] .gd-clip{animation:gd-open ${openTime}s linear both}
[data-phase=open] .gd-rim{animation-name:gd-open-rim}
[data-phase=open] .gd-pill{animation:gd-slide-open ${openTime}s linear both}
[data-phase=open] .gd-pill-shadow{animation:gd-slide-open ${openTime}s linear both,gd-shadow-open ${openTime}s linear both}
[data-phase=open] .gd-label{animation:gd-label-open ${openTime}s ease-out both}
[data-phase=close] .gd-clip{animation:gd-close ${closeTime}s linear both}
[data-phase=close] .gd-rim{animation-name:gd-close-rim}
[data-phase=close] .gd-pill{animation:gd-slide-close ${closeTime}s linear both}
[data-phase=close] .gd-pill-shadow{animation:gd-slide-close ${closeTime}s linear both,gd-shadow-close ${closeTime}s linear both}
[data-phase=close] .gd-label{animation:gd-label-close ${closeTime}s ease-in both}
@keyframes gd-open{${frames(OPEN, OPEN_STEP, openAttach, solid)}}
@keyframes gd-open-rim{${frames(OPEN, OPEN_STEP, openAttach, ring)}}
@keyframes gd-slide-open{${frames(OPEN, OPEN_STEP, openAttach, slide)}}
@keyframes gd-close{${frames(CLOSE, CLOSE_STEP, closeAttach, solid)}}
@keyframes gd-close-rim{${frames(CLOSE, CLOSE_STEP, closeAttach, ring)}}
@keyframes gd-slide-close{${frames(CLOSE, CLOSE_STEP, closeAttach, slide)}}
@keyframes gd-shadow-open{0%,15%{opacity:0}45%,100%{opacity:1}}
@keyframes gd-shadow-close{0%,20%{opacity:1}60%,100%{opacity:0}}
@keyframes gd-label-open{0%,22%{opacity:0;transform:${from(0.3)} scale(.5)}32%{opacity:1;transform:${from(0.06)} scale(.94)}42%{transform:translate(0,0) scale(1.03)}56%,100%{opacity:1;transform:none}}
@keyframes gd-label-close{0%{opacity:1;transform:none}33%{opacity:.25;transform:${from(0.3)} scale(.62)}66%,100%{opacity:0;transform:${from(1)} scale(.35)}}
@media (prefers-reduced-motion:reduce){[data-phase=open] .gd-clip,[data-phase=close] .gd-clip,[data-phase] .gd-label{animation-duration:1ms!important}}
`.trim()

  return { css, width, height, openMs: openTime * 1000, closeMs: closeTime * 1000 }
}
