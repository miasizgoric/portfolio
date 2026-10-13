import { computeWorld } from './compute'

self.onmessage = () => {
  const { world, transfer } = computeWorld()
  self.postMessage(world, { transfer })
}
