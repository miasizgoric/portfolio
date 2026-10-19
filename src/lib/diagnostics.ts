// Renderer health numbers.
// The stall watchdog reads lastFrameAt; the rest, and the error capture below, only feed the ?debug overlay.
export const DEBUG = new URLSearchParams(location.search).has('debug')

export const SCENE_FAILED = 'scene-failed'

export const diag = {
  frames: 0,
  lastFrameAt: 0,
  tier: 0,
  // when and why the quality tier stepped down, for the ?debug overlay
  tierLog: [] as string[],
  contextLost: 0,
  errors: [] as string[],
  info: '',
  gpu: '',
}

function pushError(message: string) {
  diag.errors.push(message.slice(0, 160))
  if (diag.errors.length > 6) diag.errors.shift()
}

if (DEBUG) {
  window.addEventListener('error', (e) => pushError('error: ' + e.message))
  window.addEventListener('unhandledrejection', (e) => pushError('promise: ' + String(e.reason)))
  for (const level of ['error', 'warn'] as const) {
    const original = console[level]
    console[level] = (...args: unknown[]) => {
      pushError(level + ': ' + args.map(String).join(' '))
      original.apply(console, args)
    }
  }
}
