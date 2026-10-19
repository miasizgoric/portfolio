import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface FlippingWordSwapProps {
  /** Phrases shown in turn. A line break starts a new line. */
  words: string[]
  /** Takes over the cycle: stays on `words[index]` and flips to a new one only when this changes. */
  index?: number
  /** Where a phrase sits in the grid when it is shorter than the longest one. */
  align?: 'center' | 'start'
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

// Lays every phrase onto the same grid of cells, centred line by line (or flush left), so the block keeps one size and every character has a counterpart to flip into.
function toGrids(words: string[], align: 'center' | 'start'): { grids: string[][][]; rows: number; cols: number } {
  const phrases = words.map((word) => word.split('\n'))
  const rows = Math.max(1, ...phrases.map((lines) => lines.length))
  const cols = Math.max(1, ...phrases.flatMap((lines) => lines.map((line) => line.length)))
  const grids = phrases.map((lines) =>
    Array.from({ length: rows }, (_, r) => {
      const line = lines[r] ?? ''
      const left = align === 'start' ? 0 : Math.floor((cols - line.length) / 2)
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

// A card with one character on each face.
// Every flip turns it half a revolution about the horizontal axis, so the two faces take turns facing out.
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

// Cycles through `words`, flipping the text over character by character.
// The next phrase is already waiting on the hidden face of each card, and a face is only rewritten once it is facing away again.
// With `index` the cycle is driven from outside instead: the phrase to flip to is written onto the hidden face as the flip starts.
export function FlippingWordSwap({
  words,
  index,
  align = 'center',
  interval = 1500,
  duration = 400,
  stagger = 44,
  startDelay = 0,
  onSettle,
  className,
}: FlippingWordSwapProps) {
  const reduced = usePrefersReducedMotion()
  const { grids, rows, cols } = useMemo(() => toGrids(words, align), [words, align])
  const count = grids.length
  const controlled = index !== undefined
  const [flips, setFlips] = useState(0)
  const [settled, setSettled] = useState(0)
  const [flipping, setFlipping] = useState(false)
  // `shown` faces the viewer once a flip has settled; `waiting` is on the hidden face.
  const [faces, setFaces] = useState({ shown: 0, waiting: 1 % count })
  const finished = useRef(onSettle)

  useEffect(() => {
    finished.current = onSettle
  }, [onSettle])

  const flipMs = duration + (cols - 1 + (rows - 1) * ROW_OFFSET) * stagger

  useEffect(() => {
    if (controlled || count < 2) return
    let settleTimer = 0
    const rest = interval + (settled === 0 ? startDelay : 0)
    const startTimer = window.setTimeout(() => {
      setFlips(settled + 1)
      settleTimer = window.setTimeout(() => {
        setSettled(settled + 1)
        setFaces((f) => ({ shown: f.waiting, waiting: (f.waiting + 1) % count }))
        finished.current?.(settled + 1)
      }, (reduced ? 0 : flipMs) + SETTLE_SLACK)
    }, rest)
    return () => {
      window.clearTimeout(startTimer)
      window.clearTimeout(settleTimer)
    }
  }, [controlled, settled, count, interval, startDelay, flipMs, reduced])

  // Driven from outside: start a flip towards `index` as soon as the previous one has settled.
  // Adjusted while rendering rather than in an effect, so the hidden face is already rewritten in the very render that starts the turn.
  if (index !== undefined && !flipping && index !== faces.shown) {
    setFaces({ shown: faces.shown, waiting: index })
    setFlips(settled + 1)
    setFlipping(true)
  }

  useEffect(() => {
    if (!flipping) return
    const timer = window.setTimeout(() => {
      setSettled(settled + 1)
      setFaces((f) => ({ shown: f.waiting, waiting: f.waiting }))
      setFlipping(false)
      finished.current?.(settled + 1)
    }, (reduced ? 0 : flipMs) + SETTLE_SLACK)
    return () => window.clearTimeout(timer)
  }, [flipping, settled, flipMs, reduced])

  // The face turned towards the viewer shows phrase `shown`; the other one holds `waiting`.
  const shown = faces.shown % count
  const waiting = faces.waiting % count
  const evenFace = settled % 2 === 0 ? shown : waiting
  const oddFace = settled % 2 === 0 ? waiting : shown
  const current = words[shown].replace(/\n/g, ' ')

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
