# Guhan Venkat — Personal Portfolio

A single-page cinematic portfolio. Vanilla JS, Three.js (custom shaders), GSAP + ScrollTrigger.
Production output is built with Vite.

## Run it

### Option A — local dev server with hot reload

```bash
npm install
npm run dev
```

This opens `http://localhost:5173` with Vite's hot reload.

### Option B — production bundle

```bash
npm run build
npm run preview
```

Builds to `dist/`. Drop the contents into any static host (Vercel, Netlify, S3).

### Option C — open the production build locally

```bash
npm run build
```

Then open `dist/index.html`.

## GitHub Pages

This repo includes a GitHub Actions workflow that builds and deploys `dist/` to GitHub Pages.
After pushing to GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.

## Architecture

```
index.html              # markup, font links, importmap, body containers
css/styles.css          # design tokens, layout, typography, cursor, HUD
js/
  app.js                # boot — registers chapters, starts rAF, wires resize/scroll
  core/
    cursor.js           # custom dot + lagging ring with hover detection
    river.js            # the Rainbow River — two CatmullRom tubes, custom shader,
                        #   UnrealBloomPass, mouse repulsion, supernova trigger
    scenes.js           # SceneRegistry — routes the global tick to active chapters
    ui.js               # top-right chapter marker (01..07)
  chapters/
    base.js             # VisualChapter lifecycle contract
    chapter-01-hero.js
    chapter-02-about.js
    chapter-03-attention.js     # dual-hemisphere brain mesh + ROI bloom
    chapter-04-research.js      # 3D mouse pose skeleton + circuit arc
    chapter-05-trial.js         # token field → SUCCESS convergence
    chapter-06-tone-speech.js   # 468-landmark anatomical face + AU morphs
    chapter-07-contact.js       # contact reveal + river supernova trigger
```

### Lifecycle

Each chapter extends `VisualChapter` and implements at minimum `setupScene()`.
The registry routes the global rAF tick to whichever chapters have `isActive = true`.
ScrollTrigger flips `isActive` on enter/leave, and the chapter's wrapper canvas
crossfades opacity 0↔1.

### The Rainbow River

A single fixed canvas behind everything. Two `TubeGeometry` tubes along
`CatmullRomCurve3` splines anchored to chapter Y positions (one for chapters
1–3, one for 4–7). The river translates up as the page scrolls, so different
sections weave past. Custom `ShaderMaterial` with 3D simplex-noise vertex
displacement, HSL spectrum gradient, fresnel rim, additive blending,
`UnrealBloomPass`.

### Lime accent (#c8f542)

Used exactly three times — once per chapter that earns it:

- **Ch03** — *Real-time*
- **Ch05** — *a reason*
- **Ch06** — *voice*

## Customization

- Email / GitHub / LinkedIn: edit `index.html` (search for `guhan.venkatachalapathi`, `github.com/guhanvenkat`, `linkedin.com/in/guhanvenkat`)
- Chapter copy: each `<section class="chapter">` in `index.html`
- Visual timing / WebGL params: top of each `js/chapters/chapter-NN-*.js`
- River feel: top constants in `js/core/river.js` (FLOW_SPEED, HUE_PER_UNIT, TUBE_RADIUS, bloom strength)
