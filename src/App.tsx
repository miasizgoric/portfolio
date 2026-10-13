import { lazy, Suspense, useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Wordmark } from '@/ui/Wordmark'
import { Sidebar } from '@/ui/Sidebar'
import { TouchStick } from '@/ui/TouchStick'
import { MyWorkPage } from '@/ui/MyWorkPage'
import { NoWebGL, SceneBoundary, canRunWebGL } from '@/ui/NoWebGL'
import { useRoute } from '@/lib/route'
import { DEBUG } from '@/lib/diagnostics'
import { DebugOverlay } from '@/ui/DebugOverlay'
import { useGalleryStore } from '@/store/useGalleryStore'
import { startWorld } from '@/world/useWorld'

const MY_WORK = '/my-work'

startWorld()

const Experience = lazy(() => import('@/scene/Experience').then((m) => ({ default: m.Experience })))

function App() {
  const [path, navigate] = useRoute()
  const [webgl] = useState(canRunWebGL)
  const onMyWork = path === MY_WORK

  useEffect(() => {
    useGalleryStore.getState().setPaused(onMyWork)
  }, [onMyWork])

  return (
    <div className="relative h-dvh w-screen bg-black">
      {webgl ? (
        <SceneBoundary>
          <Suspense fallback={null}>
            <Experience />
          </Suspense>
        </SceneBoundary>
      ) : (
        <NoWebGL />
      )}
      <Wordmark />
      <TouchStick />
      {DEBUG && <DebugOverlay />}
      <Sidebar onOpenMyWork={() => navigate(MY_WORK)} />

      <AnimatePresence>
        {path === MY_WORK && <MyWorkPage key="my-work" onBack={() => navigate('/')} />}
      </AnimatePresence>
    </div>
  )
}

export default App
