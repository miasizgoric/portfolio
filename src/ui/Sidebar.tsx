import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu } from 'lucide-react'
import { useSkyClock } from '@/lib/sun'
import { selectIntroVisible, useGalleryStore } from '@/store/useGalleryStore'

const BUBBLE = 48
const PILL_WIDTH = 108
const PILL_HEIGHT = 34
const GAP = 14
const PILL_TOP = BUBBLE + GAP
const BUBBLE_CENTER = PILL_WIDTH - BUBBLE / 2
const DROPLET = PILL_HEIGHT / 2

const PILL_CLOSED = `inset(0px ${PILL_WIDTH - BUBBLE_CENTER - DROPLET}px 0px ${BUBBLE_CENTER - DROPLET}px round ${DROPLET}px)`
const PILL_OPEN = `inset(-28px -28px -28px -28px round ${DROPLET}px)`

const spring = { type: 'spring' as const, damping: 20, stiffness: 300, mass: 0.5 }
const pour = { type: 'spring' as const, damping: 15, stiffness: 230, mass: 0.85 }
const snapBack = { bounceStiffness: 220, bounceDamping: 20 }

const BLUR = 'blur(16px) saturate(1.6)'

const DAY_GLASS = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.3), rgba(255,255,255,0.1))',
  border: '1px solid rgba(255,255,255,0.6)',
  shadow:
    '0 10px 26px rgba(20,26,34,0.22), inset 0 1px 1px rgba(255,255,255,0.85), inset 0 -10px 18px rgba(255,255,255,0.18)',
  ink: 'rgba(14,16,20,0.9)',
}

const NIGHT_GLASS = {
  background: 'linear-gradient(145deg, rgba(236,244,255,0.16), rgba(120,140,170,0.07))',
  border: '1px solid rgba(255,255,255,0.34)',
  shadow:
    '0 10px 28px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255,255,255,0.45), inset 0 -10px 18px rgba(160,190,230,0.12)',
  ink: 'rgba(255,255,255,0.92)',
}

export function Sidebar({ onOpenMyWork }: { onOpenMyWork: () => void }) {
  const [open, setOpen] = useState(false)
  const { sun } = useSkyClock()
  const introVisible = useGalleryStore(selectIntroVisible)
  const glass = !introVisible && sun.dayFactor > 0.5 ? DAY_GLASS : NIGHT_GLASS

  const surface = {
    background: glass.background,
    border: glass.border,
    boxShadow: glass.shadow,
    backdropFilter: BLUR,
    WebkitBackdropFilter: BLUR,
  }

  return (
    <div className="fixed right-4 top-4 z-30" style={{ width: BUBBLE, height: BUBBLE }}>
      <motion.div
        drag
        dragSnapToOrigin
        dragElastic={0.55}
        dragMomentum={false}
        dragTransition={snapBack}
        whileDrag={{ cursor: 'grabbing' }}
        style={{ width: BUBBLE, height: BUBBLE, cursor: 'grab' }}
        className="relative"
      >
        <motion.button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={open}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 1.08 }}
          transition={spring}
          className="flex items-center justify-center rounded-full transition-[background,border-color,box-shadow] duration-700"
          style={{ width: BUBBLE, height: BUBBLE, ...surface }}
        >
          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={spring} className="flex">
            <Menu className="h-5 w-5 transition-colors duration-700" style={{ color: glass.ink }} strokeWidth={1.7} />
          </motion.span>
        </motion.button>

        <AnimatePresence>
          {open && (
            <motion.button
              key="pill"
              type="button"
              onClick={() => {
                onOpenMyWork()
                setOpen(false)
              }}
              initial={{ opacity: 0, y: -(GAP + 12), clipPath: PILL_CLOSED }}
              animate={{ opacity: 1, y: 0, clipPath: PILL_OPEN }}
              exit={{
                opacity: 0,
                y: -(GAP + 8),
                clipPath: PILL_CLOSED,
                transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
              }}
              transition={{ ...pour, delay: 0.06 }}
              whileHover={{ scale: 1.03 }}
              className="absolute flex items-center justify-center rounded-full font-mono text-[12px] tracking-wide transition-[background,border-color,box-shadow] duration-700"
              style={{
                top: PILL_TOP,
                right: 0,
                width: PILL_WIDTH,
                height: PILL_HEIGHT,
                color: glass.ink,
                ...surface,
              }}
            >
              My work
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
