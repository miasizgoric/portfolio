import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FlippingWordSwap } from '@/components/ui/flipping-word-swap'
import { selectIntroVisible, useGalleryStore } from '@/store/useGalleryStore'
import { ScrambleText } from './ScrambleText'

const SOFT_EASE = [0.22, 1, 0.36, 1] as const
const KEY_HINTS = ['use wasd to move', 'use arrows to move', 'double-tap space to fly']
// On a phone the instructions morph into the suggestion to switch to a desktop.
const TOUCH_HINTS = ['drag left to move', 'drag right to look', 'for a better experience\nuse a desktop computer']
const TOUCH = window.matchMedia('(pointer: coarse)').matches
const HINT_WORDS = TOUCH ? TOUCH_HINTS : KEY_HINTS
// How long the finished wordmark stays up before the scene is revealed.
const RESOLVED_BEAT_MS = 900

export function Wordmark() {
  const visible = useGalleryStore(selectIntroVisible)
  const releaseIntro = useGalleryStore((s) => s.releaseIntro)
  const failed = useGalleryStore((s) => s.sceneFailed)
  const sceneReady = useGalleryStore((s) => s.sceneReady)
  const [hintsShown, setHintsShown] = useState(false)
  const releaseTimer = useRef(0)

  useEffect(() => () => window.clearTimeout(releaseTimer.current), [])

  // The wordmark keeps scrambling as a loading state: it only lands once the scene is ready and
  // every instruction has had its turn, and the intro lifts a beat after that.
  const landed = () => {
    releaseTimer.current = window.setTimeout(releaseIntro, RESOLVED_BEAT_MS)
  }

  // On a failed scene the intro goes at once, with no fade, so the wordmark is never seen.
  if (failed) return null

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
            duration={1100}
            hold={!(sceneReady && hintsShown)}
            onResolve={landed}
            className="font-mono text-5xl lowercase tracking-[0.22em] text-white"
          />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 1.4 }}
            className="font-mono text-[11px] lowercase tracking-[0.34em] text-white"
          >
            <FlippingWordSwap
              words={HINT_WORDS}
              interval={1200}
              startDelay={1400}
              onSettle={(flips) => flips >= HINT_WORDS.length - 1 && setHintsShown(true)}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
