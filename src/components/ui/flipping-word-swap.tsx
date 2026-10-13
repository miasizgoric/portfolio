import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface FlippingWordSwapProps {
  /** Phrases shown in turn. A line break starts a new line. */
  words: string[]
  /** How long a phrase rests before the next one flips in, in milliseconds. */
  interval?: number
  /** Duration of each character's flip, in milliseconds. */
  duration?: number
  /** Delay between neighbouring characters starting to flip, in milliseconds. */
  stagger?: number
  /** Extra rest before the very first flip, for content that is still fading in. */
  startDelay?: number
  /** Called each time a flip has finished, with the number of flips completed so far. */
  onSettle?: (flips: number) => void
  className?: string
}

const ROW_OFFSET = 2
const SETTLE_SLACK = 30

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

// Lays every phrase onto the same grid of cells, centred line by line, so the block keeps one
// size and every character has a counterpart to flip into.
function toGrids(words: string[]): { grids: string[][][]; rows: number; cols: number } {
  const phrases = words.map((word) => word.split('\n'))
  const rows = Math.max(1, ...phrases.map((lines) => lines.length))
  const cols = Math.max(1, ...phrases.flatMap((lines) => lines.map((line) => line.length)))
  const grids = phrases.map((lines) =>
    Array.from({ length: rows }, (_, r) => {
      const line = lines[r] ?? ''
      const left = Math.floor((cols - line.length) / 2)
      return [...(' '.repeat(left) + line).padEnd(cols, ' ')]
    }),
  )
  return { grids, rows, cols }
}

const glyph = (char: string) => (char === ' ' ? ' ' : char)

interface CellProps {
  front: string
  back: string
  turns: number
  delay: number
  duration: number
}

// A card with one character on each face. Every flip turns it half a revolution about the
// horizontal axis, so the two faces take turns facing out.
function Cell({ front, back, turns, delay, duration }: CellProps) {
  return (
    <span className="inline-block" style={{ perspective: 420 }}>
      <motion.span
        className="inline-grid"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateX: turns * 180 }}
        transition={{ duration: duration / 1000, delay: delay / 1000, ease: [0.22, 1, 0.36, 1] }}
      >
        <span style={{ gridArea: '1 / 1', backfaceVisibility: 'hidden' }}>{glyph(front)}</span>
        <span style={{ gridArea: '1 / 1', backfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}>
          {glyph(back)}
        </span>
      </motion.span>
    </span>
  )
}

// Cycles through `words`, flipping the text over character by character. The next phrase is
// already waiting on the hidden face of each card, and a face is only rewritten once it is
// facing away again.
export function FlippingWordSwap({
  words,
  interval = 1500,
  duration = 400,
  stagger = 44,
  startDelay = 0,
  onSettle,
  className,
}: FlippingWordSwapProps) {
  const reduced = usePrefersReducedMotion()
  const { grids, rows, cols } = useMemo(() => toGrids(words), [words])
  const count = grids.length
  const [flips, setFlips] = useState(0)
  const [settled, setSettled] = useState(0)
  const finished = useRef(onSettle)

  useEffect(() => {
    finished.current = onSettle
  }, [onSettle])

  const flipMs = duration + (cols - 1 + (rows - 1) * ROW_OFFSET) * stagger

  useEffect(() => {
    if (count < 2) return
    let settleTimer = 0
    const rest = interval + (settled === 0 ? startDelay : 0)
    const startTimer = window.setTimeout(() => {
      setFlips(settled + 1)
      settleTimer = window.setTimeout(() => {
        setSettled(settled + 1)
        finished.current?.(settled + 1)
      }, (reduced ? 0 : flipMs) + SETTLE_SLACK)
    }, rest)
    return () => {
      window.clearTimeout(startTimer)
      window.clearTimeout(settleTimer)
    }
  }, [settled, count, interval, startDelay, flipMs, reduced])

  // The face turned towards the viewer shows phrase `settled`; the other one holds the next phrase.
  const evenFace = settled % 2 === 0 ? settled % count : (settled + 1) % count
  const oddFace = settled % 2 === 0 ? (settled + 1) % count : settled % count
  const current = words[settled % count].replace(/\n/g, ' ')

  return (
    <span className={cn('inline-block text-center', className)} aria-label={current}>
      <span aria-hidden>
        {Array.from({ length: rows }, (_, r) => (
          <span key={r} className="block whitespace-nowrap">
            {Array.from({ length: cols }, (_, c) => (
              <Cell
                key={c}
                front={grids[evenFace][r][c]}
                back={grids[oddFace][r][c]}
                turns={flips}
                delay={reduced ? 0 : (c + r * ROW_OFFSET) * stagger}
                duration={reduced ? 0 : duration}
              />
            ))}
          </span>
        ))}
      </span>
    </span>
  )
}
