# Guhan Venkat — Personal Site

A static, multi-page personal site. The rainbow-river spine and 3D brain are
built with Three.js and **pre-bundled** into `js/app.bundle.js` (committed to
the repo), so **no build step is required to view the site**.

## View it
- **Easiest:** double-click `index.html`. The rainbow river, your photo, and all
  page content render. (The 3D brain needs a local server — see below — because
  browsers block large local file loads over `file://`.)
- **Full experience (incl. brain):** serve this folder over http, then open the
  printed `localhost` URL:
  - `npm run serve`  — or, with Python: `python -m http.server`

## Pages
`index.html` (Me) · `projects.html` · `experience.html` · `contact.html`

## Editing the 3D code
Source lives in `js/app.js`, `js/core/river.js`, `js/core/hero-brain.js`.
After changing any of them, regenerate the bundle:
```
npm install      # first time only
npm run build    # minified  (npm run bundle = readable)
```

## Deploy (GitHub Pages)
Push to `main`; `.github/workflows/deploy.yml` publishes the repo root.
Enable once under repo **Settings → Pages → Source → GitHub Actions**.
Live URL: https://guhanvenkat10.github.io/personal-website/

## Credits
3D brain in the hero is based on "Brain Point Cloud"
(https://sketchfab.com/3d-models/brain-point-cloud-c427ea0aee214141a78eba37bf9b76bb)
by Terrie (https://sketchfab.com/terrielsimmons), licensed under CC-BY-4.0.
The cloud is downsampled and embedded as `js/brain-points.js`.
