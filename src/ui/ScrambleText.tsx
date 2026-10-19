import { useEffect, useLayoutEffect, useRef } from 'react'

// ASCII symbols only: they all share the mono font's advance width, so the text keeps its width while it scrambles (block and geometric glyphs fall back to other fonts and shift it).
const SYMBOLS = '{}[]()<>/|_-+=*&^%$#@!?;:,.~`'
// Time between glyph swaps, in milliseconds.
const SWAP_MS = 50

interface ScrambleTextProps {
  text: string
  className?: string
  /** How long every character scrambles before it resolves, in milliseconds. */
  duration?: number
  /** Wait before the first scramble, in milliseconds. */
  delay?: number
  /** While true the text keeps scrambling past `duration`, and only resolves once this turns false. */
  hold?: boolean
  /** Called once, when the real text has landed. */
  onResolve?: () => void
}

// Every character cycles through random glyphs together, re-rolled every SWAP_MS, and the real text lands once `duration` has passed (and `hold` has been released).
// A change of `text` scrambles straight into the new word, at the new word's length.
export function ScrambleText({ text, className, duration = 1000, delay = 0, hold = false, onResolve }: ScrambleTextProps) {
  const display = useRef<HTMLSpanElement>(null)
  const firstRun = useRef(true)
  const holding = useRef(hold)
  const resolved = useRef(onResolve)

  useEffect(() => {
    holding.current = hold
    resolved.current = onResolve
  }, [hold, onResolve])

  // Hidden before the first paint, so the final text never flashes ahead of the scramble.
  useLayoutEffect(() => {
    if (display.current) display.current.style.opacity = '0'
  }, [])

  useEffect(() => {
    const el = display.current
    if (!el) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      el.textContent = text
      el.style.opacity = '1'
      // Nothing to animate, but a held text still resolves only once it is released.
      const poll = window.setInterval(() => {
        if (holding.current) return
        window.clearInterval(poll)
        resolved.current?.()
      }, 100)
      return () => window.clearInterval(poll)
    }

    const glyphs = [...SYMBOLS]
    const letters = [...text]
    const pick = () => glyphs[Math.floor(Math.random() * glyphs.length)]
    const scrambled = () => letters.map((letter) => (letter === ' ' ? letter : pick())).join('')

    const wait = firstRun.current ? delay : 0
    firstRun.current = false
    const start = performance.now() + wait
    let lastSwap = -Infinity
    let previous = start
    let t = 0
    let raf = 0

    const tick = (now: number) => {
      if (now < start) {
        raf = requestAnimationFrame(tick)
        return
      }
      // The clock stops just short of the text resolving while it is held, and carries on from there once it is released.
      const elapsed = now - previous
      previous = now
      t = holding.current ? Math.min(t + elapsed, duration - 1) : t + elapsed
      if (t >= duration) {
        el.textContent = text
        el.style.opacity = '1'
        resolved.current?.()
        return
      }
      if (now - lastSwap >= SWAP_MS) {
        lastSwap = now
        el.textContent = scrambled()
        el.style.opacity = '1'
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, duration, delay])

  return (
    <span className={className} aria-label={text}>
      <span ref={display} aria-hidden />
    </span>
  )
}
