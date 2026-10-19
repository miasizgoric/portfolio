// The six regions the Mnemosyne home screen lets you point at.
//
// The brain model's own axes, read off its geometry (it is mirror-symmetric about z = 0, and its brainstem hangs behind the middle):
// +x runs towards the front of the brain, +y is up, and z runs from one hemisphere to the other, +z being the side the default camera sees.
//
// Each region is marked where it shows on that near hemisphere's outer surface, so the colour and the pointing target sit on the part they belong to.
// Hippocampus, entorhinal cortex and amygdala lie on the inner face of the temporal lobe, out of sight, so they are marked on the temporal lobe's outer surface straight above them, as a glass-brain projection.
// `position` is the point inside the brain a ray starts from, and `surface` the direction it travels to reach the outer surface.
//
// `z` is how far each region sits below the normal range, in standard deviations.
// The values are the app's own canonical early-Alzheimer's atrophy pattern, shown as a synthetic example case: no patient and no model output is behind them.
export interface BrainRegion {
  id: string
  label: string
  note: string
  position: [number, number, number]
  radius: number
  surface: [number, number, number]
  z: number
}

export const BRAIN_REGIONS: BrainRegion[] = [
  {
    id: 'entorhinal',
    label: 'Entorhinal Cortex',
    note: 'Critical for memory consolidation; earliest atrophy site',
    position: [0.46, -0.31, 0.2],
    radius: 0.09,
    surface: [0, 0, 1],
    z: -1.8,
  },
  {
    id: 'hippocampus',
    label: 'Hippocampus',
    note: "First structure affected in Alzheimer's disease",
    position: [0.1, -0.3, 0.2],
    radius: 0.11,
    surface: [0, 0, 1],
    z: -1.6,
  },
  {
    id: 'amygdala',
    label: 'Amygdala',
    note: 'Co-atrophies with hippocampus in early AD',
    position: [0.3, -0.07, 0.2],
    radius: 0.09,
    surface: [0, 0, 1],
    z: -1.2,
  },
  {
    id: 'temporal_lobe',
    label: 'Temporal Cortex',
    note: 'Cortical thinning across temporal parcels',
    position: [-0.22, -0.14, 0.2],
    radius: 0.12,
    surface: [0, 0, 1],
    z: -1.3,
  },
  {
    id: 'frontal_lobe',
    label: 'Frontal Cortex',
    note: 'Frontal cortical thickness reduction in late AD',
    position: [0.62, 0.3, 0.2],
    radius: 0.14,
    surface: [0, 0.15, 1],
    z: -0.8,
  },
  {
    id: 'white_matter',
    label: 'White Matter',
    note: 'Reduced cerebral white matter volume in late-stage AD',
    position: [0, 0.22, 0.2],
    radius: 0.12,
    surface: [0, 0.5, 1],
    z: -0.5,
  },
]

// The app scales a region's severity so that 2.3 SD below normal reads as the strongest colour.
export const severityOf = (z: number) => Math.abs(z) / 2.3

// grey while it is within reach of normal, then a soft red, then the full one
export const accentOf = (severity: number) => (severity < 0.2 ? '#9a9a9a' : severity < 0.6 ? '#d98a83' : '#c4362b')

export const zLabelOf = (z: number) => (z === 0 ? '0 SD, within normal range' : `${z > 0 ? '+' : ''}${z.toFixed(1)} SD from normal`)
