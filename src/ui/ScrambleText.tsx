import { useEffect, useLayoutEffect, useRef } from 'react'

// ASCII symbols only: they all share the mono font's advance width, so the text keeps its width while it scrambles (block and geometric glyphs fall back to other fonts and shift it).
const SYMBOLS = '{}[]()<>/|_-+=*&^%$#@!?;:,.~`'

type Origin = 'start' | 'center' | 'end'

interface ScrambleTextProps {
  text: string
  className?: string
  /** How long every character scrambles before it resolves, in milliseconds. */
  duration?: number
  /** Wait before the first scramble, in milliseconds. */
  delay?: number
  /** Gap between one character resolving and the next, in milliseconds. 0 resolves them all together. */
  stagger?: number
  /** Where a staggered reveal begins. */
  from?: Origin
  chars?: string
  /** Time between glyph swaps, in milliseconds. */
  interval?: number
  /** While true the text keeps scrambling past `duration`, and only resolves once this turns false. */
  hold?: boolean
  /** Called once, when the real text has landed. */
  onResolve?: () => void
}

function revealRank(index: number, count: number, from: Origin): number {
  if (from === 'end') return count - 1 - index
  if (from === 'center') return Math.abs(index - (count - 1) / 2)
  return index
}

// Every character cycles through random glyphs together, re-rolled every `interval`, and the real text lands once `duration` has passed (and `hold` has been released).
// A change of `text` scrambles straight into the new word, at the new word's length.
export function ScrambleText({
  text,
  className,
  duration = 1000,
  delay = 0,
  stagger = 0,
  from = 'start',
  chars = SYMBOLS,
  interval = 50,
  hold = false,
  onResolve,
}: ScrambleTextProps) {
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

    const glyphs = [...chars]
    const letters = [...text]
    const resolveAt = letters.map((_, i) => duration + revealRank(i, letters.length, from) * stagger)
    const total = Math.max(0, ...resolveAt)
    const firstResolve = Math.min(...resolveAt)
    const pick = () => glyphs[Math.floor(Math.random() * glyphs.length)]
    const scrambled = (t: number) =>
      letters.map((letter, i) => (letter === ' ' || t >= resolveAt[i] ? letter : pick())).join('')

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
      // The clock stops just short of the first character resolving while the text is held, and carries on from there, stagger included, once it is released.
      const elapsed = now - previous
      previous = now
      t = holding.current ? Math.min(t + elapsed, firstResolve - 1) : t + elapsed
      if (t >= total) {
        el.textContent = text
        el.style.opacity = '1'
        resolved.current?.()
        return
      }
      if (now - lastSwap >= interval) {
        lastSwap = now
        el.textContent = scrambled(t)
        el.style.opacity = '1'
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, duration, delay, stagger, from, chars, interval])

  return (
    <span className={className} aria-label={text}>
      <span ref={display} aria-hidden />
    </span>
  )
}
