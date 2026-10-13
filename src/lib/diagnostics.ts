// Live health numbers for the ?debug overlay. Nothing here runs unless the overlay is requested.
export const DEBUG = new URLSearchParams(location.search).has('debug')

export const SCENE_FAILED = 'scene-failed'

export const diag = {
  frames: 0,
  lastFrameAt: 0,
  tier: 0,
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
