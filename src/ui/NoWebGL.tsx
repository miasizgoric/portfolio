import { Component, useLayoutEffect, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { FlippingWordSwap } from '@/components/ui/flipping-word-swap'
import { useGalleryStore } from '@/store/useGalleryStore'

export function canRunWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

const WARNING_WORDS = [
  'something went wrong\nin your browser',
  'refresh the page or try\nanother browser for the\nsite to work fully',
]
const WARNING_TEXT =
  'something went wrong in your browser. refresh the page or try another browser for the site to work fully.'

// Shown instead of the scene whenever the browser cannot run it. Only the warning: the intro
// (and its wordmark) is switched off through the store.
export function NoWebGL() {
  useLayoutEffect(() => {
    useGalleryStore.getState().setSceneFailed()
  }, [])

  return (
    <div
      role="alert"
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black px-8 text-center"
    >
      <TriangleAlert className="h-5 w-5 text-white/60" strokeWidth={1.6} aria-hidden />
      <p className="sr-only">{WARNING_TEXT}</p>
      <div aria-hidden>
        <FlippingWordSwap
          words={WARNING_WORDS}
          interval={3200}
          className="font-mono text-xs leading-relaxed lowercase tracking-wide text-white/75"
        />
      </div>
    </div>
  )
}

// A WebGL context can still fail after the feature check passes (GPU blocklist, lost device).
export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <NoWebGL /> : this.props.children
  }
}
