import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TextMorph } from '@/components/ui/text-morph'
import { selectIntroVisible, useGalleryStore } from '@/store/useGalleryStore'
import { ScrambleText } from './ScrambleText'

const SOFT_EASE = [0.22, 1, 0.36, 1] as const
const HINT_WORDS = ['use wasd to move', 'use arrows to move', 'double-tap space to fly']
const HOLD_MS = 4200

export function Wordmark() {
  const visible = useGalleryStore(selectIntroVisible)
  const releaseIntro = useGalleryStore((s) => s.releaseIntro)

  useEffect(() => {
    const timeout = setTimeout(releaseIntro, HOLD_MS)
    return () => clearTimeout(timeout)
  }, [releaseIntro])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="intro"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: SOFT_EASE }}
          className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-8 bg-black"
        >
          <ScrambleText
            text="mia"
            delay={260}
            duration={1500}
            className="font-mono text-5xl lowercase tracking-[0.22em] text-white"
          />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 1.4 }}
            className="font-mono text-[11px] lowercase tracking-[0.34em] text-white"
          >
            <TextMorph words={HINT_WORDS} interval={1500} morphDuration={600} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
