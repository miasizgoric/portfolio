import { useSkyClock } from '@/lib/sun'
import { selectIntroVisible, useGalleryStore } from '@/store/useGalleryStore'

export const GLASS_BLUR = 'blur(16px) saturate(1.6)'

// fill/rim/shadow/ink dress the sidebar; the touch stick is clearer glass, so it has its own thin
// tint (lens, sheen, depth, bead, lensFill)
const DAY_GLASS = {
  fill: 'linear-gradient(to top, rgba(255,255,255,0.18), transparent 45%), linear-gradient(145deg, rgba(255,255,255,0.3), rgba(255,255,255,0.1))',
  rim: 'linear-gradient(150deg, rgba(255,255,255,0.95), rgba(255,255,255,0.35) 50%, rgba(255,255,255,0.7))',
  shadow: 'rgba(20,26,34,0.5)',
  ink: 'rgba(14,16,20,0.9)',
  lens: 'linear-gradient(to top, rgba(255,255,255,0.1), transparent 45%), linear-gradient(145deg, rgba(255,255,255,0.14), rgba(255,255,255,0.03))',
  sheen: 'radial-gradient(80% 55% at 32% 6%, rgba(255,255,255,0.45), transparent 70%)',
  depth: 'inset 0 -10px 16px -6px rgba(255,255,255,0.4), inset 0 6px 10px -4px rgba(255,255,255,0.4)',
  bead: 'radial-gradient(circle at 34% 24%, rgba(255,255,255,0.9), rgba(255,255,255,0.3) 24%, rgba(255,255,255,0.06) 62%, rgba(255,255,255,0.22))',
  beadDepth: 'inset 0 -6px 10px -3px rgba(255,255,255,0.5), 0 6px 14px rgba(20,26,34,0.22)',
  beadShadow: '0 6px 14px rgba(20,26,34,0.22)',
  lensFill: 'radial-gradient(circle at 64% 64%, transparent 60%, rgba(255,255,255,0.26) 78%, transparent 94%), radial-gradient(circle at 36% 36%, transparent 66%, rgba(255,255,255,0.12) 82%, transparent 96%), radial-gradient(circle at 34% 24%, rgba(255,255,255,0.45), transparent 40%), linear-gradient(160deg, rgba(255,255,255,0.03), rgba(255,255,255,0.08))',
}

const NIGHT_GLASS = {
  fill: 'linear-gradient(to top, rgba(160,190,230,0.12), transparent 45%), linear-gradient(145deg, rgba(236,244,255,0.16), rgba(120,140,170,0.07))',
  rim: 'linear-gradient(150deg, rgba(255,255,255,0.6), rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.4))',
  shadow: 'rgba(0,0,0,0.8)',
  ink: 'rgba(255,255,255,0.92)',
  lens: 'linear-gradient(to top, rgba(160,190,230,0.08), transparent 45%), linear-gradient(145deg, rgba(236,244,255,0.09), rgba(120,140,170,0.02))',
  sheen: 'radial-gradient(80% 55% at 32% 6%, rgba(255,255,255,0.26), transparent 70%)',
  depth: 'inset 0 -10px 16px -6px rgba(190,215,255,0.2), inset 0 6px 10px -4px rgba(255,255,255,0.22)',
  bead: 'radial-gradient(circle at 34% 24%, rgba(255,255,255,0.65), rgba(236,244,255,0.2) 24%, rgba(160,190,230,0.03) 62%, rgba(255,255,255,0.14))',
  beadDepth: 'inset 0 -6px 10px -3px rgba(190,215,255,0.32), 0 6px 14px rgba(0,0,0,0.4)',
  beadShadow: '0 6px 14px rgba(0,0,0,0.4)',
  lensFill: 'radial-gradient(circle at 64% 64%, transparent 60%, rgba(255,255,255,0.2) 78%, transparent 94%), radial-gradient(circle at 36% 36%, transparent 66%, rgba(255,255,255,0.09) 82%, transparent 96%), radial-gradient(circle at 34% 24%, rgba(255,255,255,0.34), transparent 40%), linear-gradient(160deg, rgba(255,255,255,0.03), rgba(255,255,255,0.07))',
}

// the light glass reads against a bright sky, so it only switches on once the intro is gone and the sun is up
export function useGlass() {
  const { sun } = useSkyClock()
  const introVisible = useGalleryStore(selectIntroVisible)
  return !introVisible && sun.dayFactor > 0.5 ? DAY_GLASS : NIGHT_GLASS
}
