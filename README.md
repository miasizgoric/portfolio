# Portfolio

I built this project to step outside that comfort zone since most of my experience is in backend development and AI/ML. I wanted to see how I approach frontend and real-time 3D graphics, and to explore how far I can take it by working with AI agents (Claude). 

I came up with the concept and visual direction, made the architectural decisions, and broke the work into tasks for the agents. I then reviewed, debugged and iterated on what they produced until the result matched what I had in mind. The artwork is my own: drawings I make in my free time.

The idea is a slow, quiet walk through a gallery rather than a page you scroll. The environment is inspired by the work of Paul Milinski.

**[Live demo](https://sizgoricportfolio.netlify.app)**

## Features

- **First-person exploration** of a gallery of connected rooms, with collision against walls and doorways
- **Live sky and weather.** Sun position, sky, clouds, haze, rain, drizzle, sleet and snow are driven by real-time data from [Open-Meteo](https://open-meteo.com/) (no API key) and [SunCalc](https://github.com/mourner/suncalc)
- **Procedural environment.** Terrain, forest, reed grove, moss ground and sea are all generated in code, with no imported models
- **Custom GLSL shaders** for the sky, the sea and the artwork screens
- **Post-processing and animated UI:** scramble text, text morphing and page transitions

## Tech stack

**Rendering**
- [Three.js](https://threejs.org/) for 3D graphics, with custom GLSL shaders for the sky, sea and artwork screens
- [React Three Fiber](https://r3f.docs.pmnd.rs/) to build the scene declaratively as React components
- [drei](https://github.com/pmndrs/drei) for scene helpers such as the sky
- [@react-three/postprocessing](https://github.com/pmndrs/react-postprocessing) and [postprocessing](https://github.com/pmndrs/postprocessing) for ambient occlusion, bloom, tone mapping, vignette and film grain

**Application**
- [React 19](https://react.dev/) and [TypeScript](https://www.typescriptlang.org/)
- [Zustand](https://zustand.docs.pmnd.rs/) for shared state (intro and loading)
- [Motion](https://motion.dev/) (`framer-motion`) for UI animation and page transitions
- [Tailwind CSS 4](https://tailwindcss.com/) for styling, [Lucide](https://lucide.dev/) for icons and [Geist Mono](https://vercel.com/font) for typography (via [Fontsource](https://github.com/fontsource/fontsource))

**Data**
- [Open-Meteo](https://open-meteo.com/) for current weather in Zagreb, with no API key needed
- [SunCalc](https://github.com/mourner/suncalc) for sun position and time of day

**Tooling**
- [Vite](https://vite.dev/) for dev server and bundling
- [oxlint](https://oxc.rs/docs/guide/usage/linter) for linting

## Run locally

Not needed to view the site, since it is live at the link above. This is for development only. Requires Node.js 24 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Project structure

```
src/
  scene/    React Three Fiber components (gallery, sky, sea, forest, weather)
  lib/      Terrain, noise, collision, sun and weather logic
  data/     Room and artwork layout
  store/    Zustand store
  ui/       Overlay UI (wordmark, sidebar, pages)
public/
  artwork/  Images shown in the gallery
```
