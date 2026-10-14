import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// iOS tells a home-screen app apart through navigator.standalone (see the standalone rules in index.css)
if ((navigator as Navigator & { standalone?: boolean }).standalone) {
  document.documentElement.classList.add('standalone')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
