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
  hasMoved: boolean
  introHeld: boolean
  sceneReady: boolean
  setHasMoved: () => void
  releaseIntro: () => void
  setSceneReady: () => void
}

export const useGalleryStore = create<GalleryState>((set) => ({
  stick: null,
  setStick: (stick) => set({ stick }),
  hasMoved: false,
  introHeld: true,
  sceneReady: false,
  setHasMoved: () => set({ hasMoved: true }),
  releaseIntro: () => set({ introHeld: false }),
  setSceneReady: () => set({ sceneReady: true }),
}))

export const selectIntroVisible = (s: GalleryState) => !s.hasMoved && (s.introHeld || !s.sceneReady)
