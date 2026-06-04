import * as THREE from 'three';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { VisualChapter } from './base.js';

/* Asset URL candidates — tried in order. The first one that responds to
   HEAD with 200 wins. This is robust to:
   - Vite dev (serves files from project root and from public/)
   - Vite production build (assets emitted via new URL pattern below)
   - GitHub Pages or static deploy where the file is at /3dmodels/...
   - User accidentally placing the file in public/ instead of root */
const brainModelUrlVite = new URL('../../3dmodels/brainmodel3d.glb', import.meta.url).href;
const BRAIN_URL_CANDIDATES = [
  brainModelUrlVite,            /* Vite-aware, points at user's 3dmodels/ */
  '/3dmodels/brainmodel3d.glb', /* absolute root path (works if user moves file to public/) */
  './3dmodels/brainmodel3d.glb',/* relative to current page */
];

/* =============================================================
 *  Ch03 — Neural Attention Dashboard
 *  -------------------------------------------------------------
 *  Loads `3dmodels/brainmodel3d.glb` and renders it with its own
 *  shipped materials. Mild idle rotation, soft three-point lighting,
 *  small + pushed to the outer (right) edge of the right-50vw canvas.
 *  No per-lobe pulses, no cursor raycast wave.
 *
 *  Sits beneath the rainbow river (z-index 0 in CSS); the river is
 *  rerouted in river.js so its path never crosses the brain.
 * ============================================================= */

const BRAIN_TARGET_SIZE = 1.85;  /* world units (longest dimension) */
const BRAIN_X           = 0.30;  /* gentle shift toward outer edge */
const BRAIN_Y           = 0.05;
const IDLE_ROT_SPEED    = 0.22;

export class AttentionChapter extends VisualChapter {
  constructor(canvas, container) {
    super(canvas, container);
    this.idleT       = 0;
    this.brainGroup  = null;
    this.brainLoaded = false;
    this.revealT     = { value: 0 };
  }

  setupScene() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(0, 0, 3.4);

    /* Lighting — soft three-point so the GLB's PBR materials read */
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xfff2dc, 1.4);
    keyLight.position.set(2.5, 3.0, 2.5);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x88aaff, 0.7);
    rimLight.position.set(-3.0, 1.0, -2.0);
    this.scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xffaa88, 0.35);
    fillLight.position.set(-1.0, -2.0, 1.5);
    this.scene.add(fillLight);

    /* Container that we'll rotate / position; child = the loaded GLB.
       Starts at full scale so the brain is visible immediately on init
       — no scroll-trigger dependency. */
    this.brainGroup = new THREE.Group();
    this.brainGroup.position.set(BRAIN_X, BRAIN_Y, 0);
    this.scene.add(this.brainGroup);

    /* Show a placeholder while the GLB loads (and forever if it fails —
       so the preview doesn't crash in environments without the asset).
       Visible from the start so the user sees SOMETHING in the slot
       until the real model arrives. */
    const placeholderGeo = new THREE.SphereGeometry(0.7, 48, 32);
    const placeholderMat = new THREE.MeshStandardMaterial({
      color: 0x9a8a7a, roughness: 0.6, metalness: 0.05,
    });
    this.placeholder = new THREE.Mesh(placeholderGeo, placeholderMat);
    this.brainGroup.add(this.placeholder);

    /* Kick off the brain load asynchronously. */
    this.loadBrain();

    this.setupScrollTimeline();
  }

  /* Resolve the brain GLB through a list of candidate URLs. Probes each
     with HEAD first so we get a clean error log when one 404s, then
     attempts a full load. Supports DRACO + Meshopt compressed GLBs. */
  async loadBrain() {
    const loader = new GLTFLoader();

    /* DRACO compressed mesh support */
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
    loader.setDRACOLoader(draco);

    /* Meshopt compressed mesh support — many recent GLBs use this. */
    loader.setMeshoptDecoder(MeshoptDecoder);

    let lastErr = null;
    for (const url of BRAIN_URL_CANDIDATES) {
      try {
        /* Probe — HEAD request to see if the URL is reachable. */
        const probe = await fetch(url, { method: 'HEAD' });
        if (!probe.ok) {
          console.warn(`[ch03] probe ${url} → HTTP ${probe.status}`);
          continue;
        }
        const size = probe.headers.get('content-length');
        console.log(`[ch03] probe ${url} → ok (${size || '?'} bytes), loading…`);

        /* Full load with progress reporting */
        const gltf = await new Promise((resolve, reject) => {
          loader.load(
            url,
            resolve,
            (p) => {
              if (p.lengthComputable) {
                const pct = (p.loaded / p.total * 100).toFixed(0);
                console.log(`[ch03] loading… ${pct}%`);
              }
            },
            reject,
          );
        });

        /* Success — swap placeholder for the real model. */
        const model = gltf.scene;
        this.fitModel(model, BRAIN_TARGET_SIZE);
        if (this.placeholder) {
          this.brainGroup.remove(this.placeholder);
          this.placeholder.geometry.dispose();
          this.placeholder.material.dispose();
          this.placeholder = null;
        }
        this.brainGroup.add(model);
        this.brainModel = model;
        this.brainLoaded = true;
        console.log(`[ch03] brain GLB loaded ✓ from ${url}`);
        return;
      } catch (e) {
        console.warn(`[ch03] candidate ${url} failed:`, e?.message || e);
        lastErr = e;
      }
    }

    /* No candidate worked — keep the placeholder visible. */
    console.error(
      '[ch03] brain GLB failed to load from any candidate URL.\n' +
      '       Verify the file exists at one of:\n' +
      '         ' + BRAIN_URL_CANDIDATES.join('\n         ') + '\n' +
      '       Tip: moving the file to `public/3dmodels/brainmodel3d.glb`\n' +
      '       makes it reliably reachable at `/3dmodels/brainmodel3d.glb`.',
      lastErr,
    );
    this.brainLoaded = true;
  }

  /* Center the model on origin and uniformly scale so its longest
     dimension is `targetSize` world units. */
  fitModel(model, targetSize) {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    model.position.sub(center);
    const longest = Math.max(size.x, size.y, size.z) || 1;
    model.scale.multiplyScalar(targetSize / longest);
  }

  setupScrollTimeline() {
    /* The brain is visible from the start; the scroll triggers here exist
       only to fade in the chapter copy as the user scrolls into view. */
    const beats = this.container.querySelectorAll('.ch-beat');
    this.beatTriggers = [];
    beats.forEach((beat) => {
      const st = ScrollTrigger.create({
        trigger: beat,
        start: 'top 75%',
        onEnter: () => {
          gsap.to(beat, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' });
        },
      });
      this.beatTriggers.push(st);
    });
  }

  resize() {
    if (!this.renderer) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
  }

  tick(time, delta) {
    if (!this.isActive) return;
    if (this.brainGroup) {
      this.idleT += delta;
      /* Slow continuous yaw + tiny breathing pitch */
      this.brainGroup.rotation.y = this.idleT * IDLE_ROT_SPEED;
      this.brainGroup.rotation.x = Math.sin(this.idleT * 0.5) * 0.08;
    }
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    super.destroy();
    if (this.beatTriggers) { this.beatTriggers.forEach((st) => st.kill()); this.beatTriggers = null; }
    if (this.brainModel) {
      this.brainModel.traverse((node) => {
        if (node.isMesh) {
          node.geometry?.dispose();
          if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose());
          else node.material?.dispose();
        }
      });
    }
    if (this.placeholder) {
      this.placeholder.geometry?.dispose();
      this.placeholder.material?.dispose();
    }
    if (this.renderer) this.renderer.dispose();
    this.renderer = this.scene = this.camera = this.brainGroup = this.brainModel = null;
  }
}
