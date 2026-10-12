import { create } from 'zustand'

interface GalleryState {
  hasMoved: boolean
  introHeld: boolean
  sceneReady: boolean
  setHasMoved: () => void
  releaseIntro: () => void
  setSceneReady: () => void
}

export const useGalleryStore = create<GalleryState>((set) => ({
  hasMoved: false,
  introHeld: true,
  sceneReady: false,
  setHasMoved: () => set({ hasMoved: true }),
  releaseIntro: () => set({ introHeld: false }),
  setSceneReady: () => set({ sceneReady: true }),
}))

export const selectIntroVisible = (s: GalleryState) => !s.hasMoved && (s.introHeld || !s.sceneReady)
