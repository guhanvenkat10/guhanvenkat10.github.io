import * as THREE from 'three';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { VisualChapter } from './base.js';
import { createVideoTexture } from '../core/video-texture.js';

const faceVideoUrl = new URL('../../assets/face.mp4', import.meta.url).href;

/* =============================================================
 *  Ch06 — TONESPEECH
 *  -------------------------------------------------------------
 *  A small face video clip, contain-fit, pulled to the OUTER edge of the
 *  right-50vw canvas. No 468 landmark dots, no oval/eye/lip overlays —
 *  just the clean video.
 *
 *  An HTML emotion label (.emotion-label__value) inside the canvas-wrap
 *  syncs to video.currentTime:
 *       0.00 – 0.40s  →  neutral
 *       0.40 – 2.10s  →  happy
 *       2.10 – 3.40s  →  confused
 *       3.40 – end    →  worried
 *
 *  Sits beneath the rainbow river layer (z-index 0 in CSS); the river is
 *  rerouted so its path never crosses the visible face.
 * ============================================================= */

const VIDEO_W   = 1.90;
const VIDEO_H   = 2.55;
const VIDEO_X   = 0.00;   /* CENTERED in the right-50vw canvas */
const VIDEO_Y   = 0.00;
const VIDEO_AR_GUESS = 9 / 16; /* portrait — corrected on metadata load */

/* Emotion timeline (seconds → label) */
const EMOTION_TIMELINE = [
  { from: 0.00, to: 0.40, label: 'neutral'  },
  { from: 0.40, to: 2.10, label: 'happy'    },
  { from: 2.10, to: 3.40, label: 'confused' },
  { from: 3.40, to: Infinity, label: 'worried' },
];

function emotionAt(t) {
  for (const slot of EMOTION_TIMELINE) {
    if (t >= slot.from && t < slot.to) return slot.label;
  }
  return 'neutral';
}

export class ToneSpeechChapter extends VisualChapter {
  constructor(canvas, container) {
    super(canvas, container);
    this.revealT = 0;
    this.currentEmotion = null;
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
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0, 0, 2.6);

    const { video, texture } = createVideoTexture(faceVideoUrl);
    this.video = video;
    this.videoTex = texture;

    /* Contain-fit face plane */
    const planeGeo = new THREE.PlaneGeometry(VIDEO_W, VIDEO_H);
    const planeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex:         { value: texture },
        uReveal:      { value: 1 },    /* visible from start */
        uVideoAspect: { value: VIDEO_AR_GUESS },
        uPlaneAspect: { value: VIDEO_W / VIDEO_H },
      },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform float uReveal;
        uniform float uVideoAspect;
        uniform float uPlaneAspect;
        void main() {
          vec2 uv = vUv;
          vec2 t = uv;
          float vAR = uVideoAspect;
          float pAR = uPlaneAspect;
          if (vAR > pAR) {
            float s = pAR / vAR;
            t.y = (uv.y - 0.5) / s + 0.5;
            if (t.y < 0.0 || t.y > 1.0) discard;
          } else {
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

    const fixAspect = () => {
      if (video.videoWidth && video.videoHeight) {
        planeMat.uniforms.uVideoAspect.value = video.videoWidth / video.videoHeight;
      }
    };
    video.addEventListener('loadedmetadata', fixAspect);
    video.addEventListener('canplay', fixAspect);
    fixAspect();

    /* DOM label that updates with currentTime */
    this.emotionEl = document.getElementById('emotion-value');

    this.setupScrollTimeline();
  }

  setupScrollTimeline() {
    /* Video is visible from the start (uReveal=1); triggers here just
       fade in the chapter copy. */
    const beats = this.container.querySelectorAll('.ch-beat');
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
    this.planeMat.uniforms.uPlaneAspect.value = VIDEO_W / VIDEO_H;
  }

  /* Update emotion label from the *current* video frame */
  updateEmotion() {
    if (!this.video || !this.emotionEl) return;
    const e = emotionAt(this.video.currentTime || 0);
    if (e !== this.currentEmotion) {
      this.currentEmotion = e;
      this.emotionEl.textContent = e;
      this.emotionEl.setAttribute('data-emotion', e);
    }
  }

  tick() {
    if (!this.isActive) return;
    this.updateEmotion();
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
