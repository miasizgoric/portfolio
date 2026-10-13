import { useGalleryStore } from '@/store/useGalleryStore'

const BASE = 112
const KNOB = 48

export function TouchStick() {
  const stick = useGalleryStore((s) => s.stick)
  if (!stick) return null

  return (
    <div
      className="pointer-events-none fixed z-20 rounded-full border border-white/40 bg-white/10 backdrop-blur-sm"
      style={{ width: BASE, height: BASE, left: stick.ox - BASE / 2, top: stick.oy - BASE / 2 }}
    >
      <div
        className="absolute rounded-full border border-white/70 bg-white/35"
        style={{
          width: KNOB,
          height: KNOB,
          left: BASE / 2 - KNOB / 2 + stick.dx,
          top: BASE / 2 - KNOB / 2 + stick.dy,
        }}
      />
    </div>
  )
}
