import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Menu } from 'lucide-react'
import { buildDrop } from '@/lib/glassDrop'
import { useSkyClock } from '@/lib/sun'
import { selectIntroVisible, useGalleryStore } from '@/store/useGalleryStore'

const BUBBLE = 48
const PILL_WIDTH = 100
const PILL_HEIGHT = 42
const GAP = 14
const NECK = 18
const RIM = 1.25
// toggling mid-morph would restart from the wrong shape, so clicks inside this window are ignored
const LOCK_MS = 250

// one size step up on desktop, two on touch devices: bubble 48 -> 56 -> 64px, label 12 -> 14 -> 16px
const SCALE = 7 / 6
const SCALE_TOUCH = 4 / 3
const BOX = `calc(${BUBBLE}px * var(--gd-s))`

const drop = buildDrop({
  bubble: BUBBLE,
  pillWidth: PILL_WIDTH,
  pillHeight: PILL_HEIGHT,
  gap: GAP,
  neck: NECK,
  rim: RIM,
})

// everything is drawn at base size and scaled as one piece, so shape, rim and text stay in proportion
const SCALE_CSS = `.sb{--gd-s:${SCALE}}@media (pointer:coarse){.sb{--gd-s:${SCALE_TOUCH}}}.gd-scale{position:absolute;top:0;right:0;width:${BUBBLE}px;height:${BUBBLE}px;transform:scale(var(--gd-s));transform-origin:top right}`

const spring = { type: 'spring' as const, damping: 20, stiffness: 300, mass: 0.5 }
const snapBack = { bounceStiffness: 220, bounceDamping: 20 }

const BLUR = 'blur(16px) saturate(1.6)'

const DAY_GLASS = {
  fill: 'linear-gradient(to top, rgba(255,255,255,0.18), transparent 45%), linear-gradient(145deg, rgba(255,255,255,0.3), rgba(255,255,255,0.1))',
  rim: 'linear-gradient(150deg, rgba(255,255,255,0.95), rgba(255,255,255,0.35) 50%, rgba(255,255,255,0.7))',
  shadow: 'rgba(20,26,34,0.5)',
  ink: 'rgba(14,16,20,0.9)',
}

const NIGHT_GLASS = {
  fill: 'linear-gradient(to top, rgba(160,190,230,0.12), transparent 45%), linear-gradient(145deg, rgba(236,244,255,0.16), rgba(120,140,170,0.07))',
  rim: 'linear-gradient(150deg, rgba(255,255,255,0.6), rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.4))',
  shadow: 'rgba(0,0,0,0.8)',
  ink: 'rgba(255,255,255,0.92)',
}

type Phase = 'idle' | 'open' | 'close'

export function Sidebar({ onOpenMyWork }: { onOpenMyWork: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const lastToggle = useRef(0)
  const { sun } = useSkyClock()
  const introVisible = useGalleryStore(selectIntroVisible)
  const glass = !introVisible && sun.dayFactor > 0.5 ? DAY_GLASS : NIGHT_GLASS
  const open = phase === 'open'

  const toggle = () => {
    const now = performance.now()
    if (now - lastToggle.current < LOCK_MS) return
    lastToggle.current = now
    setPhase((p) => (p === 'open' ? 'close' : 'open'))
  }

  return (
    <>
      <style>{drop.css + SCALE_CSS}</style>
      <div className="sb fixed right-4 top-4 z-30" style={{ width: BOX, height: BOX }}>
        <motion.div
          drag
          dragSnapToOrigin
          dragElastic={0.55}
          dragMomentum={false}
          dragTransition={snapBack}
          whileDrag={{ cursor: 'grabbing' }}
          data-phase={phase}
          onAnimationEnd={(e) => {
            if (e.animationName === 'gd-close') setPhase('idle')
          }}
          style={{ width: BOX, height: BOX, cursor: 'grab' }}
          className="relative"
        >
          <div className="gd-scale">
            <div className="gd">
              <div className="gd-shadow" style={{ opacity: 0.45 }}>
                <div className="gd-clip" style={{ background: glass.shadow }} />
              </div>
              <div
                className="gd-clip"
                style={{ background: glass.fill, backdropFilter: BLUR, WebkitBackdropFilter: BLUR }}
              />
              <div className="gd-clip gd-rim" style={{ background: glass.rim }} />
              <div className="gd-clip">
                <button
                  type="button"
                  className="gd-pill"
                  onClick={() => {
                    onOpenMyWork()
                    setPhase('close')
                  }}
                >
                  <span className="gd-label font-mono text-[12px] tracking-wide" style={{ color: glass.ink }}>
                    My work
                  </span>
                </button>
              </div>
            </div>

            <motion.button
              type="button"
              onClick={toggle}
              aria-label="Menu"
              aria-expanded={open}
              whileTap={{ scale: 0.9 }}
              transition={spring}
              className="absolute right-0 top-0 flex items-center justify-center rounded-full"
              style={{ width: BUBBLE, height: BUBBLE }}
            >
              <motion.span animate={{ rotate: open ? 90 : 0 }} transition={spring} className="flex">
                <Menu className="h-5 w-5 transition-colors duration-700" style={{ color: glass.ink }} strokeWidth={1.7} />
              </motion.span>
            </motion.button>
          </div>
        </motion.div>
      </div>
    </>
  )
}
