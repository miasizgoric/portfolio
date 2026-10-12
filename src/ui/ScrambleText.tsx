import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const SCRAMBLE_INTERVAL = 45

interface ScrambleTextProps {
  text: string
  className?: string
  duration?: number
  settleWindow?: number
  delay?: number
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function ScrambleText({
  text,
  className,
  duration = 1600,
  settleWindow = 0.45,
  delay = 0,
}: ScrambleTextProps) {
  const [frame, setFrame] = useState(() => text.split('').map(() => ({ char: '', settled: false })))

  useEffect(() => {
    const chars = text.split('')
    const start = performance.now() + delay
    let raf = 0
    let lastSwap = 0
    const noise = chars.map(() => GLYPHS[Math.floor(Math.random() * GLYPHS.length)])

    const tick = (now: number) => {
      const elapsed = now - start

      if (elapsed < 0) {
        raf = requestAnimationFrame(tick)
        return
      }

      const swap = now - lastSwap >= SCRAMBLE_INTERVAL
      if (swap) lastSwap = now

      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutCubic(progress)
      let allSettled = true

      const next = chars.map((char, i) => {
        if (char === ' ') return { char: ' ', settled: true }

        const startAt = (i / chars.length) * (1 - settleWindow)
        const charProgress = (eased - startAt) / settleWindow

        if (charProgress >= 1) return { char, settled: true }

        allSettled = false
        if (swap) noise[i] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        return { char: noise[i], settled: false }
      })

      setFrame(next)

      if (allSettled) return
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, duration, settleWindow, delay])

  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }} aria-label={text}>
      {frame.map((entry, i) => (
        <motion.span
          key={i}
          aria-hidden
          animate={{ opacity: entry.settled ? 1 : 0.45 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: 'inline-block' }}
        >
          {entry.char === ' ' ? ' ' : entry.char}
        </motion.span>
      ))}
    </span>
  )
}
