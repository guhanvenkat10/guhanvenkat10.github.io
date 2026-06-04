import * as THREE from 'three';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { VisualChapter } from './base.js';
import { createVideoTexture } from '../core/video-texture.js';

const mouseVideoUrl = new URL('../../assets/mouse.mp4', import.meta.url).href;

/* =============================================================
 *  Ch04 — Research Labs
 *  -------------------------------------------------------------
 *  A small mouse video clip, contain-fit (no clipping — tail intact),
 *  positioned toward the OUTER (right) edge of the right-50vw canvas.
 *  No keypoint dots / skeleton overlays / arc — just the clean video.
 *  Sits beneath the rainbow river layer; the river is rerouted in
 *  river.js so its path never crosses the visible mouse.
 * ============================================================= */

/* --- Layout knobs (in scene units; camera at z=2.6, fov=40) --- */
const VIDEO_W   = 2.40;   /* world units — cinematic */
const VIDEO_H   = 1.35;   /* 16:9 */
const VIDEO_X   = 0.10;   /* gentle outer-right offset within the wider wrap */
const VIDEO_Y   = 0.05;
const VIDEO_AR  = 16 / 9; /* assumed mouse video aspect; corrected on metadata load */

export class ResearchChapter extends VisualChapter {
  constructor(canvas, container) {
    super(canvas, container);
    this.revealT = 0;
  }

  setupScene() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(0, 0, 2.6);

    /* Video texture */
    const { video, texture } = createVideoTexture(mouseVideoUrl);
    this.video = video;
    this.videoTex = texture;

    /* Mouse video plane — contain-fit (entire frame visible, including tail).
       Aspect-correction sampling so the actual video is letterboxed inside
       the plane rather than cover-cropped. Edges fully transparent so the
       black page bg (#0c0c0c) shows through. */
    const planeGeo = new THREE.PlaneGeometry(VIDEO_W, VIDEO_H);
    const planeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex:         { value: texture },
        uReveal:      { value: 1 },    /* visible from start — no scroll-trigger dependency */
        uVideoAspect: { value: VIDEO_AR },
        uPlaneAspect: { value: VIDEO_W / VIDEO_H },
      },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform float uReveal;
        uniform float uVideoAspect;
        uniform float uPlaneAspect;

        void main() {
          /* CONTAIN-fit: never crop — letterbox/pillarbox instead.
             We compute the UV the video maps to inside the plane, and
             discard pixels outside that region so the black bg matches
             the page. */
          vec2 uv = vUv;
          vec2 t = uv;
          float vAR = uVideoAspect;
          float pAR = uPlaneAspect;
          if (vAR > pAR) {
            /* video wider than plane → bars top/bottom */
            float s = pAR / vAR;
            t.y = (uv.y - 0.5) / s + 0.5;
            if (t.y < 0.0 || t.y > 1.0) discard;
          } else {
            /* video taller than plane → bars left/right */
            float s = vAR / pAR;
            t.x = (uv.x - 0.5) / s + 0.5;
            if (t.x < 0.0 || t.x > 1.0) discard;
          }
          vec4 col = texture2D(uTex, t);
          gl_FragColor = vec4(col.rgb, uReveal);
        }
      `,
    });
    this.plane = new THREE.Mesh(planeGeo, planeMat);
    this.plane.position.set(VIDEO_X, VIDEO_Y, 0);
    this.scene.add(this.plane);
    this.planeMat = planeMat;

    /* Correct aspect once the video reports its true dimensions */
    const fixAspect = () => {
      if (video.videoWidth && video.videoHeight) {
        planeMat.uniforms.uVideoAspect.value = video.videoWidth / video.videoHeight;
      }
    };
    video.addEventListener('loadedmetadata', fixAspect);
    video.addEventListener('canplay', fixAspect);
    fixAspect();

    this.setupScrollTimeline();
  }

  setupScrollTimeline() {
    /* Video is visible from the start (uReveal=1). Scroll triggers here
       just fade the chapter copy in as the user scrolls into view. */
    const beats = this.container.querySelectorAll('.ch-beat, .ch-beat-block');
    this.beatTriggers = [];
    beats.forEach((beat) => {
      const st = ScrollTrigger.create({
        trigger: beat, start: 'top 75%',
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
    /* Keep plane aspect uniform in sync if we later resize the plane */
    this.planeMat.uniforms.uPlaneAspect.value = VIDEO_W / VIDEO_H;
  }

  tick() {
    if (!this.isActive) return;
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    super.destroy();
    if (this.beatTriggers) { this.beatTriggers.forEach((st) => st.kill()); this.beatTriggers = null; }
    if (this.video) { this.video.pause(); this.video.remove(); }
    if (this.videoTex) this.videoTex.dispose();
    if (this.plane) { this.plane.geometry.dispose(); this.planeMat.dispose(); }
    if (this.renderer) this.renderer.dispose();
    this.renderer = this.scene = this.camera = null;
  }
}
