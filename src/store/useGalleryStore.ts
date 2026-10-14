import { create } from 'zustand'

export interface TouchStick {
  ox: number
  oy: number
  dx: number
  dy: number
}

interface GalleryState {
  stick: TouchStick | null
  setStick: (stick: TouchStick | null) => void
  // true while the scene's post-processing draws the stick's refraction
  lens: boolean
  setLens: (lens: boolean) => void
  hasMoved: boolean
  introHeld: boolean
  sceneReady: boolean
  sceneFailed: boolean
  setHasMoved: () => void
  releaseIntro: () => void
  setSceneReady: () => void
  setSceneFailed: () => void
  paused: boolean
  setPaused: (paused: boolean) => void
  flying: boolean
  toggleFlying: () => void
  enteredRooms: Record<string, true>
  enterRoom: (id: string) => void
}

export const useGalleryStore = create<GalleryState>((set) => ({
  stick: null,
  setStick: (stick) => set({ stick }),
  lens: false,
  setLens: (lens) => set({ lens }),
  hasMoved: false,
  introHeld: true,
  sceneReady: false,
  sceneFailed: false,
  setHasMoved: () => set({ hasMoved: true }),
  releaseIntro: () => set({ introHeld: false }),
  setSceneReady: () => set({ sceneReady: true }),
  setSceneFailed: () => set({ sceneFailed: true }),
  paused: false,
  setPaused: (paused) => set({ paused }),
  flying: false,
  toggleFlying: () => set((s) => ({ flying: !s.flying })),
  enteredRooms: {},
  enterRoom: (id) => set((s) => ({ enteredRooms: { ...s.enteredRooms, [id]: true } })),
}))

// A failed scene shows only the warning, never the intro.
export const selectIntroVisible = (s: GalleryState) =>
  !s.hasMoved && !s.sceneFailed && (s.introHeld || !s.sceneReady)
