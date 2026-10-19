import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Vendor code changes rarely; keeping it out of the scene chunk lets the browser fetch the pieces in parallel and keep them cached across deploys.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\/](react|react-dom|scheduler)[\/]/, priority: 40 },
            { name: 'state', test: /node_modules[/](zustand|use-sync-external-store)[/]/, priority: 50 },
            { name: 'three', test: /node_modules[\/]three[\/]/, priority: 30 },
            { name: 'postprocessing', test: /node_modules[\/](postprocessing|n8ao)[\/]/, priority: 20 },
            { name: 'r3f', test: /node_modules[\/](@react-three|react-reconciler|its-fine|suspend-react)[\/]/, priority: 10 },
          ],
        },
      },
    },
  },
})
