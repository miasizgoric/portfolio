import { motion } from 'framer-motion'
import { ScrambleText } from './ScrambleText'

const SOFT_EASE = [0.22, 1, 0.36, 1] as const

export function MyWorkPage({ onBack }: { onBack: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: SOFT_EASE }}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black"
    >
      <motion.button
        type="button"
        onClick={onBack}
        whileHover={{ x: -3 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        className="absolute top-8 left-8 font-mono text-[11px] lowercase tracking-[0.3em] text-white/45 hover:text-white/80"
      >
        back
      </motion.button>

      <ScrambleText
        text="my work"
        delay={180}
        duration={1500}
        className="font-mono text-4xl lowercase tracking-[0.22em] text-white"
      />

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 1.2, ease: SOFT_EASE }}
        className="mt-10 max-w-xl px-8 text-center font-mono text-[12px] lowercase leading-relaxed tracking-[0.12em] text-white/55"
      >
        this site is a walkable 3d gallery built with react, typescript and three.js (react three
        fiber). the terrain, forest, reeds and sea are generated procedurally in code, with custom
        glsl shaders for the sky, sea and artwork screens. the sky, clouds and precipitation follow
        the real weather and time of day in zagreb, using open-meteo and suncalc. the interface
        uses tailwind css and framer motion. the concept, direction and artwork are my own.
      </motion.p>
    </motion.div>
  )
}
