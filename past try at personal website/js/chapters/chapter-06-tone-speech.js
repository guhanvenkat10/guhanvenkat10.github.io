import * as THREE from 'three';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { VisualChapter } from './base.js';

/* =============================================================
 *  Tone-Speech (Ch 06) — Anatomical Contour Face
 *  Builds the face as a small set of parametric LINES tracing the
 *  major anatomical landmarks (eye sockets, nose ridge, jawline,
 *  lips, brows, cheekbones). AU morphs translate whole contour
 *  groups; the climax drops the jaw and ignites a waveform.
 * ============================================================= */

const WF_COUNT = 200;

function buildEyeRing(cx, cy, cz, rx, ry, count = 32) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = (i / count) * Math.PI * 2;
    pts.push(new THREE.Vector3(
      cx + Math.cos(t) * rx,
      cy + Math.sin(t) * ry,
      cz + Math.sin(t) * 0.04,
    ));
  }
  return pts;
}

function buildNoseRidge(count = 16) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const y = 0.40 - t * 0.50;          // descending from brow to tip
    const z = 0.95 + Math.sin(t * Math.PI) * 0.06;
    const x = Math.sin(t * Math.PI * 0.5) * 0.02; // slight S-curve
    pts.push(new THREE.Vector3(x, y, z));
  }
  return pts;
}

function buildJawline(count = 48) {
  const pts = [];
  // Sweep from left temple → chin → right temple.
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = -Math.cos(Math.PI * t) * 0.85;
    const yBase = -0.30 - Math.sin(Math.PI * t) * 0.70;  // chin at y ≈ -1.0
    const z = 0.40 + Math.sin(Math.PI * t) * 0.20;
    pts.push(new THREE.Vector3(x, yBase, z));
  }
  return pts;
}

function buildLipUpper(count = 24) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = (i / count) * 2 - 1;       // -1..+1
    const x = t * 0.32;
    // Cupid's bow: two little bumps at center.
    const cupid = Math.exp(-(t * t) / 0.04) * 0.025;
    const y = -0.40 + cupid;
    const z = 0.92;
    pts.push(new THREE.Vector3(x, y, z));
  }
  return pts;
}

function buildLipLower(count = 24) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = (i / count) * 2 - 1;
    const x = t * 0.32;
    const y = -0.46 - Math.exp(-(t * t) / 0.12) * 0.025;
    const z = 0.92;
    pts.push(new THREE.Vector3(x, y, z));
  }
  return pts;
}

function buildBrow(side, count = 14) {
  const pts = [];
  const sign = side === 'L' ? -1 : 1;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = sign * (0.10 + t * 0.40);
    const y = 0.58 - Math.sin(t * Math.PI) * 0.025;
    const z = 0.82;
    pts.push(new THREE.Vector3(x, y, z));
  }
  return pts;
}

function buildCheekbone(side, count = 20) {
  const pts = [];
  const sign = side === 'L' ? -1 : 1;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = sign * (0.30 + t * 0.30);
    const y = 0.05 - Math.sin(t * Math.PI) * 0.08;
    const z = 0.70 - Math.sin(t * Math.PI) * 0.08;
    pts.push(new THREE.Vector3(x, y, z));
  }
  return pts;
}

function makeLine(points, color = 0xf0ece4, opacity = 0.85) {
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
  });
  const line = new THREE.Line(geom, mat);
  return { line, geom, mat, basePoints: points.map((p) => p.clone()) };
}

export class ToneSpeechChapter extends VisualChapter {
  constructor(canvas, container) {
    super(canvas, container);
    this.weights = { au4: 0, au6: 0, au12: 0, jaw: 0 };
    this.targetWeights = { au4: 0, au6: 0, au12: 0, jaw: 0 };
  }

  setupScene() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    this.camera.position.set(0, 0, 5);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.lines = {};
    this.lines.eyeL      = makeLine(buildEyeRing(-0.32, 0.20, 0.78, 0.16, 0.09));
    this.lines.eyeR      = makeLine(buildEyeRing( 0.32, 0.20, 0.78, 0.16, 0.09));
    this.lines.noseRidge = makeLine(buildNoseRidge());
    this.lines.jawline   = makeLine(buildJawline());
    this.lines.lipUpper  = makeLine(buildLipUpper());
    this.lines.lipLower  = makeLine(buildLipLower());
    this.lines.browL     = makeLine(buildBrow('L'));
    this.lines.browR     = makeLine(buildBrow('R'));
    this.lines.cheekL    = makeLine(buildCheekbone('L'));
    this.lines.cheekR    = makeLine(buildCheekbone('R'));

    for (const key of Object.keys(this.lines)) {
      this.group.add(this.lines[key].line);
    }

    // Climax waveform — 200-pt sine line beneath jaw, hidden until jaw drops.
    const wfPos = new Float32Array(WF_COUNT * 3);
    for (let i = 0; i < WF_COUNT; i++) {
      wfPos[i * 3 + 0] = (i / (WF_COUNT - 1) - 0.5) * 2.4;
      wfPos[i * 3 + 1] = -1.55;
      wfPos[i * 3 + 2] = 0.4;
    }
    this.wfPos = wfPos;
    this.wfGeom = new THREE.BufferGeometry();
    this.wfGeom.setAttribute('position', new THREE.BufferAttribute(wfPos, 3));
    this.wfMat = new THREE.LineBasicMaterial({
      color: 0xc8f542,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    this.waveform = new THREE.Line(this.wfGeom, this.wfMat);
    this.scene.add(this.waveform);

    this.setupScrollTimeline();
  }

  setupScrollTimeline() {
    const beats = this.container.querySelectorAll('.ch-beat');
    this.beatTriggers = [];

    const onEnter = [
      // beat 0 — MediaPipe reads 468 landmarks → AU4 (brow lowerer)
      () => gsap.to(this.targetWeights, { au4: 1, duration: 0.7, ease: 'power2.out' }),
      // beat 1 — geometric ratios → AU6 (cheek raiser)
      () => gsap.to(this.targetWeights, { au6: 1, duration: 0.7, ease: 'power2.out' }),
      // beat 2 — AU vector feeds LLM → AU12 (smile)
      () => gsap.to(this.targetWeights, { au12: 1, duration: 0.7, ease: 'power2.out' }),
      // climax — jaw drops, waveform ignites
      () => {
        gsap.to(this.targetWeights, { jaw: 1, duration: 0.9, ease: 'power2.out' });
        gsap.to(this.wfMat, { opacity: 0.95, duration: 0.7, delay: 0.3 });
      },
    ];

    beats.forEach((beat, idx) => {
      const st = ScrollTrigger.create({
        trigger: beat,
        start: 'top 75%',
        onEnter: () => {
          gsap.to(beat, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' });
          if (onEnter[idx]) onEnter[idx]();
        },
      });
      this.beatTriggers.push(st);
    });
  }

  /* Per-vertex displacement per contour line under AU/jaw weight. */
  applyMorphsToLine(key, w) {
    const entry = this.lines[key];
    const arr = entry.geom.attributes.position.array;
    const base = entry.basePoints;
    for (let i = 0; i < base.length; i++) {
      let x = base[i].x;
      let y = base[i].y;
      let z = base[i].z;

      if (key === 'browL' || key === 'browR') {
        y -= 0.18 * w.au4;
        const tNorm = i / (base.length - 1);
        const innerWeight = key === 'browL' ? tNorm : (1 - tNorm);
        y -= 0.05 * w.au4 * innerWeight;
      }
      if (key === 'cheekL' || key === 'cheekR') {
        y += 0.10 * w.au6;
        z += 0.04 * w.au6;
      }
      if (key === 'eyeL' || key === 'eyeR') {
        if (base[i].y < 0.20) y += 0.04 * w.au6;
      }
      if (key === 'lipUpper' || key === 'lipLower') {
        const cornerWeight = Math.pow(Math.min(1, Math.abs(base[i].x) / 0.32), 1.5);
        x += Math.sign(base[i].x) * 0.10 * w.au12 * cornerWeight;
        y += 0.06 * w.au12 * cornerWeight;
      }
      if (key === 'jawline') {
        y -= 0.35 * w.jaw;
      }
      if (key === 'lipLower') {
        y -= 0.18 * w.jaw;
      }
      if (key === 'lipUpper') {
        y -= 0.04 * w.jaw;
      }

      arr[i * 3 + 0] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    entry.geom.attributes.position.needsUpdate = true;
  }

  resize(width, height) {
    if (!this.renderer) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || width;
    const h = rect.height || height;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  tick(time, delta) {
    if (!this.isActive) return;

    for (const k of Object.keys(this.weights)) {
      this.weights[k] += (this.targetWeights[k] - this.weights[k]) * 0.10;
    }

    for (const key of Object.keys(this.lines)) {
      this.applyMorphsToLine(key, this.weights);
    }

    if (this.weights.jaw > 0.02) {
      const amp = 0.22 * this.weights.jaw;
      for (let i = 0; i < WF_COUNT; i++) {
        const x = (i / (WF_COUNT - 1) - 0.5) * 2.4;
        const carrier = Math.sin(i * 0.45 + time * 6.0);
        const envelope = 0.5 + 0.5 * Math.sin(time * 2.4 + i * 0.13);
        this.wfPos[i * 3 + 0] = x;
        this.wfPos[i * 3 + 1] = -1.55 + carrier * amp * envelope;
      }
      this.wfGeom.attributes.position.needsUpdate = true;
    }

    const rotY = Math.sin(time * 0.18) * 0.18;
    this.group.rotation.y = rotY;
    this.waveform.rotation.y = rotY * 0.4;

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    super.destroy();
    if (this.beatTriggers) { this.beatTriggers.forEach((st) => st.kill()); this.beatTriggers = null; }
    for (const key of Object.keys(this.lines || {})) {
      this.lines[key].geom.dispose();
      this.lines[key].mat.dispose();
    }
    this.lines = null;
    if (this.wfGeom) this.wfGeom.dispose();
    if (this.wfMat) this.wfMat.dispose();
    if (this.renderer) this.renderer.dispose();
    this.wfGeom = this.wfMat = this.waveform = null;
    this.renderer = this.scene = this.camera = this.group = null;
  }
}
