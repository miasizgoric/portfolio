import { lazy, Suspense } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Wordmark } from '@/ui/Wordmark'
import { Sidebar } from '@/ui/Sidebar'
import { MyWorkPage } from '@/ui/MyWorkPage'
import { useRoute } from '@/lib/route'

const MY_WORK = '/my-work'

const Experience = lazy(() => import('@/scene/Experience').then((m) => ({ default: m.Experience })))

function App() {
  const [path, navigate] = useRoute()

  return (
    <div className="relative h-screen w-screen bg-black">
      <Suspense fallback={null}>
        <Experience />
      </Suspense>
      <Wordmark />
      <Sidebar onOpenMyWork={() => navigate(MY_WORK)} />

      <AnimatePresence>
        {path === MY_WORK && <MyWorkPage key="my-work" onBack={() => navigate('/')} />}
      </AnimatePresence>
    </div>
  )
}

export default App
