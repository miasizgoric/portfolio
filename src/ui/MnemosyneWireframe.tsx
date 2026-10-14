import { motion } from 'framer-motion'

const SOFT_EASE = [0.22, 1, 0.36, 1] as const

const BAR = 'rounded-full bg-white/[0.12]'
const OUTLINE = 'border border-white/15'

// the classic wireframe image placeholder: a box with both diagonals
function ImageBox({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-md ${OUTLINE} ${className ?? ''}`}>
      <svg
        className="absolute inset-0 h-full w-full text-white/15"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d="M0 0L100 100M100 0L0 100" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

// Low-fidelity layout of the start screen. A placeholder for the real structure: it shows where
// things sit, not what they say. Kept small on purpose, it is a glimpse and not the main event.
export function MnemosyneWireframe() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 48 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 1, ease: SOFT_EASE }}
      className="mx-auto w-full max-w-[18rem] sm:max-w-md"
    >
      <div
        role="img"
        aria-label="wireframe of the mnemosyne start screen"
        className={`overflow-hidden rounded-xl bg-white/[0.02] ${OUTLINE}`}
      >
        {/* window chrome */}
        <div className="flex items-center gap-2.5 border-b border-white/10 px-3 py-2">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 rounded-full border border-white/25" />
            ))}
          </div>
          <div className="h-3.5 flex-1 rounded-full border border-white/10" />
        </div>

        <div className="flex">
          <aside className="hidden w-24 shrink-0 flex-col gap-3.5 border-r border-white/10 p-3 sm:flex">
            <div className={`size-6 rounded-md ${OUTLINE}`} />
            <div className="flex flex-col gap-2.5">
              {['w-4/5', 'w-3/5', 'w-2/3', 'w-1/2'].map((w) => (
                <div key={w} className={`h-1.5 ${w} ${BAR}`} />
              ))}
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col gap-3.5 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className={`h-2.5 w-2/5 ${BAR}`} />
              <div className="h-5 w-14 rounded-full border border-violet-400/50 bg-violet-500/25" />
            </div>

            <div className={`flex h-7 items-center gap-2 rounded-lg px-2.5 ${OUTLINE}`}>
              <div className="size-2.5 rounded-full border border-white/30" />
              <div className={`h-1.5 w-1/3 ${BAR}`} />
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className={`flex flex-col gap-2 rounded-lg p-2 ${OUTLINE} ${i > 3 ? 'hidden sm:flex' : ''}`}>
                  <ImageBox className="aspect-[4/3]" />
                  <div className={`h-1.5 w-4/5 ${BAR}`} />
                  <div className={`h-1.5 w-3/5 ${BAR} opacity-60`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
