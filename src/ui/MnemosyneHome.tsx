import { Component, lazy, Suspense, useRef, useState, type ReactNode } from 'react'
import { motion, useInView } from 'framer-motion'
import { accentOf, severityOf, zLabelOf, type BrainRegion } from '@/data/brainRegions'
import { canRunWebGL } from './NoWebGL'

// The 3D view loads on its own, once the page is about to reach it
const BrainCanvas = lazy(() => import('./BrainCanvas'))

const SOFT_EASE = [0.22, 1, 0.36, 1] as const
const NAV = ['New Entry', 'History', 'Settings']
// the app's own palette, so this reads as another application inside the page
const APP = { bg: '#0a0a0a', surface: '#141414', line: '#2a2a2a', dim: '#9a9a9a', mute: '#6a6a6a' }

// If the view cannot start (no WebGL, lost context), the frame still shows the app's chrome.
class ViewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function RegionCard({ region }: { region: BrainRegion }) {
  const severity = severityOf(region.z)
  const accent = accentOf(severity)
  return (
    <div
      className="pointer-events-none absolute bottom-2.5 left-11 right-2.5 rounded-lg border border-l-2 p-2.5 sm:bottom-auto sm:left-auto sm:right-3 sm:top-1/2 sm:w-44 sm:-translate-y-1/2"
      style={{ borderColor: '#1f1f1f', borderLeftColor: accent, backgroundColor: `${APP.surface}f2` }}
    >
      <p className="text-[12px] leading-tight text-white">{region.label}</p>
      <p className="mt-1 text-[8.5px]" style={{ color: APP.mute }}>
        {zLabelOf(region.z)}
      </p>
      <p className="mt-1.5 text-[8px] leading-relaxed" style={{ color: APP.mute }}>
        {region.note}
      </p>
    </div>
  )
}

// The Mnemosyne home screen: the app's own chrome over its 3D brain, which you can turn and point at.
// It shows a synthetic example case (the app's canonical early-Alzheimer's pattern), never a patient, and says so in the address bar.
export function MnemosyneHome() {
  const screen = useRef<HTMLDivElement>(null)
  const near = useInView(screen, { margin: '100% 0px', once: true })
  const visible = useInView(screen)
  const [webgl] = useState(canRunWebGL)
  const [picked, setPicked] = useState<BrainRegion | null>(null)

  return (
    <motion.div
      initial={{ opacity: 0, y: 48 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 1, ease: SOFT_EASE }}
      className="mx-auto w-full max-w-[18rem] sm:max-w-lg"
    >
      <div
        className="overflow-hidden rounded-xl border border-white/15"
        style={{ backgroundColor: APP.bg }}
        role="group"
        aria-label="the mnemosyne home screen, a 3D brain"
      >
        {/* window chrome */}
        <div className="flex items-center gap-2.5 border-b border-white/10 px-3 py-2">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 rounded-full border border-white/25" />
            ))}
          </div>
          <div className="flex h-3.5 flex-1 items-center rounded-full border border-white/10 px-2 font-mono text-[7px] lowercase tracking-[0.14em] text-white/30">
            synthetic example case
          </div>
        </div>

        <div ref={screen} className="brain-canvas relative aspect-square select-none sm:aspect-[16/10]">
          {webgl && near && (
            <ViewBoundary>
              <Suspense fallback={null}>
                <BrainCanvas active={visible} onSelect={setPicked} />
              </Suspense>
            </ViewBoundary>
          )}

          {/* the app's chrome, drawn over the scene */}
          <div
            className="pointer-events-none absolute inset-0 font-mono uppercase"
            style={{ color: APP.dim }}
            aria-hidden
          >
            <div
              className="absolute left-2.5 top-2.5 flex size-6 items-center justify-center rounded-md border text-[12px] font-semibold normal-case text-white"
              style={{ borderColor: APP.line, backgroundColor: APP.surface }}
            >
              M
            </div>
            <div
              className="absolute left-1/2 top-2.5 flex -translate-x-1/2 gap-0.5 rounded-full border p-0.5"
              style={{ borderColor: APP.line, backgroundColor: APP.surface }}
            >
              {NAV.map((label) => (
                <span key={label} className="whitespace-nowrap rounded-full px-2 py-1 text-[7.5px] tracking-[0.14em] sm:px-2.5">
                  {label}
                </span>
              ))}
            </div>
            <div
              className="absolute bottom-2.5 left-2.5 flex size-6 items-center justify-center rounded-md border text-[7.5px] font-bold"
              style={{ borderColor: APP.line, backgroundColor: APP.surface }}
            >
              DR
            </div>
          </div>

          {picked && <RegionCard region={picked} />}
        </div>
      </div>
    </motion.div>
  )
}
