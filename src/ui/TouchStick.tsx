import { useEffect, useRef } from 'react'
import { BASE_R, BEAD_R, LEAN, fadeAmount, popScale, pose, poseSettled, stepPose } from '@/lib/stickPose'
import { useGalleryStore } from '@/store/useGalleryStore'
import { useGlass } from '@/ui/glass'

const BASE = BASE_R * 2
const BEAD = BEAD_R * 2
// Without the scene's refraction pass (safe mode) the glass falls back to a lightly blurred disc: the scene stays readable through the base and the bead only tints and brightens it.
const BASE_BLUR = 'blur(2px) saturate(1.4)'
const BEAD_LENS = 'saturate(1.6) brightness(1.1)'
// the shadow only shows outside the disc; under clear glass it would read as a grey stain
const OUTSIDE_DISC = `radial-gradient(circle ${BASE_R}px at center, transparent ${BASE_R - 1}px, #000 ${BASE_R}px)`

// The pose is driven imperatively from one rAF loop instead of by React renders, because the lens shader reads the same numbers every frame and the two have to stay in step.
export function TouchStick() {
  const active = useGalleryStore((s) => s.stick !== null)
  const lens = useGalleryStore((s) => s.lens)
  const glass = useGlass()
  const root = useRef<HTMLDivElement>(null)
  const base = useRef<HTMLDivElement>(null)
  const bead = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active && poseSettled()) return
    let raf = 0
    let last = performance.now()

    const frame = (now: number) => {
      const stick = useGalleryStore.getState().stick
      stepPose(Math.min((now - last) / 1000, 1 / 30), stick)
      last = now

      const a = fadeAmount()
      const s = popScale()
      const r = root.current
      const b = base.current
      const k = bead.current
      if (r && b && k) {
        r.style.setProperty('--a', String(a))
        r.style.visibility = a > 0.002 ? 'visible' : 'hidden'
        b.style.transform = `translate(${pose.x + pose.bx * LEAN - BASE_R}px, ${pose.y + pose.by * LEAN - BASE_R}px) scale(${s})`
        k.style.transform = `translate(${pose.x + pose.bx - BEAD_R}px, ${pose.y + pose.by - BEAD_R}px) scale(${s})`
      }
      if (!stick && poseSettled()) {
        if (r) r.style.visibility = 'hidden'
        return
      }
      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [active])

  const baseStyle = {
    background: `${glass.sheen}, ${glass.lens}`,
    backdropFilter: BASE_BLUR,
    WebkitBackdropFilter: BASE_BLUR,
    boxShadow: glass.depth,
  }
  // With the lens, neither circle has an outline of its own: the ring is drawn by the scene pass as soft frosted glass, and the bead is defined by what it bends plus a milky tint and broad reflections, as in the reference.
  const beadStyle = lens
    ? { background: glass.lensFill, boxShadow: glass.beadShadow }
    : {
        background: glass.bead,
        backdropFilter: BEAD_LENS,
        WebkitBackdropFilter: BEAD_LENS,
        boxShadow: glass.beadDepth,
      }

  return (
    <div ref={root} className="pointer-events-none invisible fixed inset-0 z-20">
      <div ref={base} className="absolute left-0 top-0" style={{ width: BASE, height: BASE }}>
        <div className="absolute -inset-6" style={{ opacity: 'var(--a)', maskImage: OUTSIDE_DISC, WebkitMaskImage: OUTSIDE_DISC }}>
          {/* the blurred element is bigger than the disc it blurs: Safari cuts a filter off at its own box */}
          <div className={`absolute inset-0 translate-y-[7px] blur-[9px] ${lens ? 'opacity-25' : 'opacity-45'}`}>
            <div className="absolute inset-6 rounded-full" style={{ background: glass.shadow }} />
          </div>
        </div>
        {!lens && (
          <>
            <div className="absolute inset-0 rounded-full" style={{ opacity: 'var(--a)', ...baseStyle }} />
            <div
              className="glass-ring absolute inset-0 rounded-full"
              style={{ opacity: 'var(--a)', background: glass.rim }}
            />
          </>
        )}
      </div>

      <div
        ref={bead}
        className="absolute left-0 top-0 rounded-full"
        style={{ width: BEAD, height: BEAD, opacity: 'var(--a)', ...beadStyle }}
      />
    </div>
  )
}
