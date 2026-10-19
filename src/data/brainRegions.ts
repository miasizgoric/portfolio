// The six regions the Mnemosyne home screen lets you point at, as the thesis app has them: the positions and radii are those of its brain_regions.json, in the brain model's own space.
//
// `z` is how far each region sits below the normal range, in standard deviations.
// The values are the app's own canonical early-Alzheimer's atrophy pattern, shown as a synthetic example case: no patient and no model output is behind them.
export interface BrainRegion {
  id: string
  label: string
  note: string
  position: [number, number, number]
  radius: number
  z: number
}

export const BRAIN_REGIONS: BrainRegion[] = [
  {
    id: 'entorhinal',
    label: 'Entorhinal Cortex',
    note: 'Critical for memory consolidation; earliest atrophy site',
    position: [0.32, -0.38, 0.25],
    radius: 0.11,
    z: -1.8,
  },
  {
    id: 'hippocampus',
    label: 'Hippocampus',
    note: "First structure affected in Alzheimer's disease",
    position: [0.28, -0.26, -0.06],
    radius: 0.13,
    z: -1.6,
  },
  {
    id: 'amygdala',
    label: 'Amygdala',
    note: 'Co-atrophies with hippocampus in early AD',
    position: [0.24, -0.12, 0.28],
    radius: 0.11,
    z: -1.2,
  },
  {
    id: 'temporal_lobe',
    label: 'Temporal Cortex',
    note: 'Cortical thinning across temporal parcels',
    position: [0.7, -0.08, 0.04],
    radius: 0.14,
    z: -1.3,
  },
  {
    id: 'frontal_lobe',
    label: 'Frontal Cortex',
    note: 'Frontal cortical thickness reduction in late AD',
    position: [0.14, 0.34, 0.55],
    radius: 0.14,
    z: -0.8,
  },
  {
    id: 'white_matter',
    label: 'White Matter',
    note: 'Reduced cerebral white matter volume in late-stage AD',
    position: [-0.08, 0.08, 0.02],
    radius: 0.16,
    z: -0.5,
  },
]

// The app scales a region's severity so that 2.3 SD below normal reads as the strongest colour.
export const severityOf = (z: number) => Math.abs(z) / 2.3

// grey while it is within reach of normal, then a soft red, then the full one
export const accentOf = (severity: number) => (severity < 0.2 ? '#9a9a9a' : severity < 0.6 ? '#d98a83' : '#c4362b')

export const zLabelOf = (z: number) => (z === 0 ? '0 SD, within normal range' : `${z > 0 ? '+' : ''}${z.toFixed(1)} SD from normal`)
