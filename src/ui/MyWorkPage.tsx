import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { FlippingWordSwap } from '@/components/ui/flipping-word-swap'
import { MnemosyneHome } from './MnemosyneHome'
import { ScrambleText } from './ScrambleText'

const SOFT_EASE = [0.22, 1, 0.36, 1] as const
const TITLE_WORDS = ['my work', 'mnemosyne']
// the title flips once the next panel has risen above this share of the window height
const FLIP_LINE = 0.55
// where the pinned title sits; clear of the back button, and of a phone's notch
const TITLE_TOP = 'calc(env(safe-area-inset-top, 0px) + 4.5rem)'

// The word scrambles in on arrival.
// Once it has landed, the same word is handed over to the flipping one, which swaps it for the project's name as the page scrolls.
function Title({ flipped }: { flipped: boolean }) {
  const [landed, setLanded] = useState(false)
  return (
    <h1 className="grid justify-items-start font-mono text-4xl lowercase tracking-[0.22em] text-white *:col-start-1 *:row-start-1">
      {!landed && (
        <ScrambleText text="my work" delay={180} duration={1100} onResolve={() => setLanded(true)} />
      )}
      <span className={landed ? undefined : 'invisible'}>
        <FlippingWordSwap words={TITLE_WORDS} index={flipped ? 1 : 0} align="start" duration={520} stagger={55} />
      </span>
    </h1>
  )
}

// One scrolling column:
//  - the description is a fixed block in the middle that stays in place;
//  - the title sits in the top corner from the start and stays pinned there;
//  - the mnemosyne panel rises from the bottom over the description, and the title flips to its name.
export function MyWorkPage({ onBack }: { onBack: () => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const [flipped, setFlipped] = useState(false)

  useEffect(() => {
    const root = scroller.current
    const target = panel.current
    if (!root || !target) return
    // so the keyboard scrolls the page straight away
    root.focus({ preventScroll: true })
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        setFlipped(entry.isIntersecting || entry.boundingClientRect.top < 0)
      },
      { root, rootMargin: `0px 0px -${(1 - FLIP_LINE) * 100}% 0px` },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: SOFT_EASE }}
      className="absolute inset-0 z-40 bg-black"
    >
      <motion.button
        type="button"
        onClick={onBack}
        whileHover={{ x: -3 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        className="absolute left-8 top-[calc(env(safe-area-inset-top,0px)+2rem)] z-50 font-mono text-[11px] lowercase tracking-[0.3em] text-white/45 hover:text-white/80"
      >
        back
      </motion.button>

      {/* `isolate` makes the scroller its own stacking context.
          Without it the panel and the title bar (z-10, z-20) join the page's stacking context and paint over the scroller's overlay scrollbar on touch screens, cutting the thumb into pieces. */}
      <div
        ref={scroller}
        tabIndex={-1}
        className="purple-scroll absolute inset-0 isolate overflow-y-auto overscroll-contain outline-none"
      >
        <div className="relative" style={{ '--title-top': TITLE_TOP } as CSSProperties}>
          <section className="sticky top-0 z-0 h-dvh" style={{ marginBottom: '-100dvh' }}>
            <div className="mw-lift relative h-full">
              <div className="flex h-full items-center justify-center">
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.9, delay: 1.2, ease: SOFT_EASE }}
                  className="max-w-md px-8 text-center font-mono text-[11px] lowercase leading-relaxed tracking-[0.1em] text-white/55"
                >
                  a walkable 3d gallery built with react, typescript and three.js. the terrain, forest,
                  reeds and sea are generated in code, and the sky follows the real weather in zagreb.
                  the concept, direction and artwork are my own.
                </motion.p>
              </div>
            </div>
          </section>

          {/* a zero-height sticky anchor, so the title bar takes no room in the flow; the fade under it lets the page slide beneath the title instead of colliding with it */}
          <div className="sticky top-0 z-20 h-0">
            <div
              className="flex justify-start bg-linear-to-b from-black from-75% to-transparent px-8 pb-8"
              style={{ paddingTop: 'var(--title-top)' }}
            >
              <Title flipped={flipped} />
            </div>
          </div>

          {/* one screen of the first block, plus the veil above the panel, before the panel starts */}
          <div style={{ height: 'calc(100dvh + 6rem)' }} />
          <section
            ref={panel}
            className="relative z-10 min-h-dvh bg-black px-6 pb-32 before:pointer-events-none before:absolute before:inset-x-0 before:-top-24 before:h-24 before:bg-linear-to-t before:from-black before:to-transparent"
            style={{ paddingTop: 'calc(var(--title-top) + 5.5rem)' }}
          >
            <MnemosyneHome />
          </section>
        </div>
      </div>
    </motion.div>
  )
}
