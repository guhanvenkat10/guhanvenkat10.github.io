import * as THREE from 'three';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { VisualChapter } from './base.js';

const NODE_COUNT = 80;
const SUCCESS_IDX = NODE_COUNT - 1;

/* First 20 are domain-named; remaining 60 are short scientific-notation tokens. */
const NAMED_LABELS = [
  'Phase II',  'p-value',   'n=412',     'endpoint',  'dropout',
  'adverse',   'BioBERT',   'MoA',       'cohort',    'Bayesian',
  'efficacy',  'placebo',   'biomarker', 'ITT',       'AUC',
  'survival',  'PFS',       'safety',    'lit-review','SUCCESS — 84% confidence',
];
const TOKEN_LABELS = [
  'β₁', 'β₂', 'σ', 'μ', 'τ', 'H₀', 'H₁', 'χ²', 'KM', 'r²',
  'λ', 'Δt', 'CI', 'HR', 'IC₅₀', 'EC₅₀', 'AE', 'SAE', 'Q1', 'Q3',
  'F₁', 'F₂', 'γ', 'α', 'ρ', 'OR', 'RR', 'PFS-1', 'OS', 'NNT',
  'x₁', 'x₂', 'y₁', 'z₀', 'θ', 'φ', 'ψ', 'ω', 'AUC-PR', 'ROC',
  'BLEU', 'PER', 'TER', 'F1-w', 'PRE', 'REC', 'TPR', 'FPR', 'p̂', 'q̂',
  'TS', 'ES', 'pp', 'bp', 'wk-4', 'wk-12', 'wk-24', 'wk-52', 'd0', 'd1',
];

const LABELS = [];
for (let i = 0; i < NODE_COUNT - 1; i++) {
  LABELS.push(i < NAMED_LABELS.length - 1 ? NAMED_LABELS[i] : TOKEN_LABELS[(i - (NAMED_LABELS.length - 1)) % TOKEN_LABELS.length]);
}
LABELS.push(NAMED_LABELS[NAMED_LABELS.length - 1]); // SUCCESS at last index

/* High-signal nodes (pull toward center on inference) — ~27% of population. */
const HIGH_SIGNAL = new Set([
  2, 6, 9, 10, 14, 16,                 // among named domain nodes
  22, 28, 31, 37, 42, 48, 53, 58, 62, 67, 71, 74, 76, 78,
  SUCCESS_IDX,
]);

function makeLabelTexture(text, isSuccess = false) {
  const canvas = document.createElement('canvas');
  const w = isSuccess ? 512 : 360;
  const h = 88;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.font = `${isSuccess ? 500 : 400} ${isSuccess ? 22 : 18}px "DM Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isSuccess ? '#f0ece4' : 'rgba(240, 236, 228, 0.85)';
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 1;
  return { tex, w, h };
}

export class TrialChapter extends VisualChapter {
  constructor(canvas, container) {
    super(canvas, container);
    this.nodes = [];
    this.edgeList = [];
    this.mouseWorld = new THREE.Vector3(1e6, 1e6, 0);
    this.state = { progress: 0, arcDraw: 0, textOpacity: 0 };
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
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 0, 15);

    // Ambient light so MeshStandardMaterial body is visible without hover.
    this.ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(this.ambient);

    // Shared geometry for all spheres (one dispose suffices).
    this.sphereGeom = new THREE.SphereGeometry(0.14, 12, 12);

    // Cursor ring state — set true when hovering a node so the global
    // cursor module fills the ring.
    this.hoveredIdx = -1;

    // Seeded RNG so layout is deterministic across reloads.
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let i = 0; i < NODE_COUNT; i++) {
      const isSuccess = i === SUCCESS_IDX;
      const x = (rand() - 0.5) * 11;
      const y = (rand() - 0.5) * 7;
      const z = (rand() - 0.5) * 2.5;

      const mat = new THREE.MeshStandardMaterial({
        color: 0xf0ece4,
        emissive: 0xf0ece4,
        emissiveIntensity: isSuccess ? 1.2 : 0.6,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        metalness: 0,
        roughness: 0.4,
      });
      const mesh = new THREE.Mesh(this.sphereGeom, mat);
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(isSuccess ? 1.7 : 1);
      mesh.userData.idx = i;
      this.scene.add(mesh);

      const { tex, w: tw, h: th } = makeLabelTexture(LABELS[i], isSuccess);
      const labelMat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: isSuccess ? 0.95 : 0.55,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(labelMat);
      // Sprite scale chosen so 1 unit ≈ camera unit at this distance.
      const aspect = tw / th;
      const labelScale = isSuccess ? 0.42 : 0.30;
      sprite.scale.set(aspect * labelScale, labelScale, 1);
      sprite.position.set(x, y - 0.40, z);
      this.scene.add(sprite);

      this.nodes.push({
        idx: i,
        pos: new THREE.Vector3(x, y, z),
        prevPos: new THREE.Vector3(x, y, z),
        mesh,
        sprite,
        mat,
        labelMat,
        labelTex: tex,
        isHigh: HIGH_SIGNAL.has(i),
        isSuccess,
        baseOpacity: isSuccess ? 1.0 : 0.85,
        baseEmissiveIntensity: isSuccess ? 1.2 : 0.6,
        hoverK: 0,
        cycleT: Math.random() * 10,
      });
    }

    // Edges — sparse graph, SUCCESS connected to several high-signal nodes.
    const edgeSet = new Set();
    const addEdge = (a, b) => {
      if (a === b) return;
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (edgeSet.has(k)) return;
      edgeSet.add(k);
      this.edgeList.push({ a, b });
    };
    for (const hi of HIGH_SIGNAL) {
      if (hi !== SUCCESS_IDX) addEdge(SUCCESS_IDX, hi);
    }
    for (let i = 0; i < NODE_COUNT - 1; i++) {
      const j = (i + 1 + Math.floor(rand() * 3)) % NODE_COUNT;
      addEdge(i, j);
    }
    for (let i = 0; i < 40; i++) {
      addEdge(Math.floor(rand() * (NODE_COUNT - 1)), Math.floor(rand() * (NODE_COUNT - 1)));
    }

    this.edgePos = new Float32Array(this.edgeList.length * 6);
    this.updateEdgeBuffer();
    this.edgeGeom = new THREE.BufferGeometry();
    this.edgeGeom.setAttribute('position', new THREE.BufferAttribute(this.edgePos, 3));
    this.edgeMat = new THREE.LineBasicMaterial({
      color: 0xf0ece4,
      transparent: true,
      depthWrite: false,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
    });
    this.edgeLines = new THREE.LineSegments(this.edgeGeom, this.edgeMat);
    this.scene.add(this.edgeLines);

    // Climax arc (Bezier sweeping to SUCCESS node).
    this.arcCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-6, 4.2, 0),
      new THREE.Vector3(-2, 5.5, 1),
      new THREE.Vector3(0, 0, 0),
    );
    const arcPts = this.arcCurve.getPoints(60);
    this.arcGeom = new THREE.BufferGeometry().setFromPoints(arcPts);
    this.arcMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
    });
    this.arcLine = new THREE.Line(this.arcGeom, this.arcMat);
    this.arcLine.geometry.setDrawRange(0, 0);
    this.scene.add(this.arcLine);

    // Mouse plane for raycasting (z = 0).
    this.rayPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.raycaster = new THREE.Raycaster();

    this.setupScrollTimeline();
  }

  setupScrollTimeline() {
    const beats = this.container.querySelectorAll('.ch-beat');
    this.beatTriggers = [];

    const onEnter = [
      () => {},                                                                       // beat 0 — intro
      () => gsap.to(this.state, { progress: 0.45, duration: 0.9, ease: 'power2.out' }), // beat 1 — token weighting
      () => gsap.to(this.state, { progress: 0.85, duration: 0.9, ease: 'power2.out' }), // beat 2 — Bayesian posterior
      () => gsap.to(this.state, { progress: 1.0, arcDraw: 0.5, duration: 0.8, ease: 'power2.out' }), // beat 3 — BioBERT
      () => gsap.to(this.state, { progress: 1.0, arcDraw: 1.0, duration: 0.8, ease: 'power2.out' }), // climax
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

  addEventListeners() {
    this._onMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(ndc, this.camera);

      // Cache the world-space mouse on z=0 plane for legacy physics repulsion.
      const target = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.rayPlane, target)) {
        this.mouseWorld.copy(target);
      }

      // Raycast against the node meshes for explicit hover detection.
      const meshes = this.nodes.map((n) => n.mesh);
      const hits = this.raycaster.intersectObjects(meshes, false);
      const newHover = hits.length > 0 ? hits[0].object.userData.idx : -1;
      if (newHover !== this.hoveredIdx) {
        this.hoveredIdx = newHover;
        const ring = document.querySelector('.cursor-ring');
        if (ring) ring.classList.toggle('is-hover', newHover !== -1);
      }
    };
    this.canvas.addEventListener('pointermove', this._onMove, { passive: true });
  }

  removeEventListeners() {
    if (this._onMove && this.canvas) {
      this.canvas.removeEventListener('pointermove', this._onMove);
    }
    // Release cursor hover state on chapter exit.
    const ring = document.querySelector('.cursor-ring');
    if (ring) ring.classList.remove('is-hover');
  }

  updateEdgeBuffer() {
    const ep = this.edgePos;
    for (let i = 0; i < this.edgeList.length; i++) {
      const { a, b } = this.edgeList[i];
      const pa = this.nodes[a].pos;
      const pb = this.nodes[b].pos;
      ep[i * 6 + 0] = pa.x; ep[i * 6 + 1] = pa.y; ep[i * 6 + 2] = pa.z;
      ep[i * 6 + 3] = pb.x; ep[i * 6 + 4] = pb.y; ep[i * 6 + 5] = pb.z;
    }
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

    // Verlet physics — fixed effective dt so behaviour matches across framerates.
    // Constants recalibrated for 80 nodes (pair count ~16x denser than 20-node version).
    const dt = 1 / 60;
    const SUBSTEPS = 2;
    const kr = 0.10;   // Coulomb repulsion (scaled down ~5x for density)
    const ka = 0.05;   // Hooke attraction (slightly down)
    const d0 = 1.05;   // rest length (shorter, denser cluster)
    const kc = 0.06;   // center gravity (slightly stronger)
    const drag = 0.06; // more damping for stability
    const progress = this.state.progress;

    for (let step = 0; step < SUBSTEPS; step++) {
      const F = new Array(NODE_COUNT);
      for (let i = 0; i < NODE_COUNT; i++) F[i] = { x: 0, y: 0, z: 0 };

      // Center gravity.
      for (let i = 0; i < NODE_COUNT; i++) {
        const p = this.nodes[i].pos;
        F[i].x += -kc * p.x;
        F[i].y += -kc * p.y;
        F[i].z += -kc * p.z;
      }

      // Pairwise Coulomb repulsion.
      for (let i = 0; i < NODE_COUNT; i++) {
        for (let j = i + 1; j < NODE_COUNT; j++) {
          const a = this.nodes[i].pos;
          const b = this.nodes[j].pos;
          let rx = a.x - b.x, ry = a.y - b.y, rz = a.z - b.z;
          let r2 = rx * rx + ry * ry + rz * rz + 0.02;
          const r = Math.sqrt(r2);
          const mag = kr / r2;
          const ux = rx / r, uy = ry / r, uz = rz / r;
          F[i].x += ux * mag; F[i].y += uy * mag; F[i].z += uz * mag;
          F[j].x -= ux * mag; F[j].y -= uy * mag; F[j].z -= uz * mag;
        }
      }

      // Edge Hooke attraction.
      for (const e of this.edgeList) {
        const a = this.nodes[e.a].pos;
        const b = this.nodes[e.b].pos;
        const rx = b.x - a.x, ry = b.y - a.y, rz = b.z - a.z;
        const r = Math.sqrt(rx * rx + ry * ry + rz * rz) + 1e-4;
        const stretch = r - d0;
        const fmag = ka * stretch;
        const fx = (rx / r) * fmag, fy = (ry / r) * fmag, fz = (rz / r) * fmag;
        F[e.a].x += fx; F[e.a].y += fy; F[e.a].z += fz;
        F[e.b].x -= fx; F[e.b].y -= fy; F[e.b].z -= fz;
      }

      // Mouse inverse-square repulsion (capped) + scroll-driven force.
      for (let i = 0; i < NODE_COUNT; i++) {
        const n = this.nodes[i];
        const dx = n.pos.x - this.mouseWorld.x;
        const dy = n.pos.y - this.mouseWorld.y;
        const d2 = dx * dx + dy * dy + 0.25;
        if (d2 < 30) {
          const m = Math.min(3.0, 2.2 / d2);
          F[i].x += dx * m;
          F[i].y += dy * m;
        }
        if (progress > 0.001) {
          if (n.isHigh) {
            F[i].x += -n.pos.x * progress * 0.35;
            F[i].y += -n.pos.y * progress * 0.35;
            F[i].z += -n.pos.z * progress * 0.35;
          } else {
            const r = Math.hypot(n.pos.x, n.pos.y, n.pos.z) + 1e-3;
            F[i].x += (n.pos.x / r) * progress * 0.5;
            F[i].y += (n.pos.y / r) * progress * 0.5;
          }
        }
      }

      // Verlet integration step.
      for (let i = 0; i < NODE_COUNT; i++) {
        const n = this.nodes[i];
        const a = F[i];
        const px = n.pos.x, py = n.pos.y, pz = n.pos.z;
        const vx = (px - n.prevPos.x) * (1 - drag);
        const vy = (py - n.prevPos.y) * (1 - drag);
        const vz = (pz - n.prevPos.z) * (1 - drag);
        const nx = px + vx + a.x * dt * dt;
        const ny = py + vy + a.y * dt * dt;
        const nz = pz + vz + a.z * dt * dt;
        n.prevPos.set(px, py, pz);
        n.pos.set(nx, ny, nz);
      }
    }

    // Sync visuals — raycaster-driven hover drives cycling rainbow emissive.
    const HOVER_SCALE_MAX = 1.5;
    const EMISSIVE_BASE = 0.6;
    const EMISSIVE_HOVER = 2.8;       // > 1 so bloom punches through threshold
    const tmpColor = this._tmpColor || (this._tmpColor = new THREE.Color());
    const baselineColor = this._baselineColor || (this._baselineColor = new THREE.Color(0xf0ece4));

    for (let i = 0; i < NODE_COUNT; i++) {
      const n = this.nodes[i];
      n.mesh.position.copy(n.pos);
      n.sprite.position.set(n.pos.x, n.pos.y - 0.40, n.pos.z);

      // Hover lerp.
      const hoverTarget = (i === this.hoveredIdx) ? 1 : 0;
      n.hoverK += (hoverTarget - n.hoverK) * 0.18;
      n.cycleT += delta * 0.45;

      // Scale: baseline × hover bloom × (SUCCESS climax boost).
      const baseScale = n.isSuccess ? 1.7 : 1.0;
      const hoverScale = 1 + (HOVER_SCALE_MAX - 1) * n.hoverK;
      const climaxBoost = n.isSuccess ? (1 + this.state.arcDraw * 0.4) : 1;
      const targetScale = baseScale * hoverScale * climaxBoost;
      const cur = n.mesh.scale.x;
      n.mesh.scale.setScalar(cur + (targetScale - cur) * 0.18);

      // Opacity (scroll-driven plus hover lift).
      const isHi = n.isHigh;
      const targetOp = isHi
        ? Math.min(1.0, n.baseOpacity + progress * 0.15 + n.hoverK * 0.15)
        : Math.max(0.18, n.baseOpacity - progress * 0.55) + n.hoverK * 0.15;
      n.mat.opacity += (Math.min(1.0, targetOp) - n.mat.opacity) * 0.12;
      n.labelMat.opacity = Math.min(1.0, n.mat.opacity * 0.95 + n.hoverK * 0.5);

      // Emissive: cycling hsl when hovered, fade to baseline white when idle.
      const hue = n.cycleT % 1;
      tmpColor.setHSL(hue, 1.0, 0.55);
      // Mix between baseline cream and hot rainbow by hoverK.
      n.mat.emissive.copy(baselineColor).lerp(tmpColor, n.hoverK);
      // Color follows similarly so unlit faces (none here, but for completeness) match.
      n.mat.color.copy(baselineColor).lerp(tmpColor, n.hoverK * 0.6);

      // Emissive intensity ramps high on hover — pierces bloom threshold.
      const targetEI = isHi
        ? n.baseEmissiveIntensity + progress * 0.4 + n.hoverK * (EMISSIVE_HOVER - n.baseEmissiveIntensity)
        : n.baseEmissiveIntensity + n.hoverK * (EMISSIVE_HOVER - n.baseEmissiveIntensity);
      n.mat.emissiveIntensity += (targetEI - n.mat.emissiveIntensity) * 0.18;
    }

    this.updateEdgeBuffer();
    this.edgeGeom.attributes.position.needsUpdate = true;

    // Update arc endpoint to SUCCESS node + redraw curve.
    const target = this.nodes[SUCCESS_IDX].pos;
    this.arcCurve.v2.copy(target);
    const arcPts = this.arcCurve.getPoints(60);
    const arr = this.arcGeom.attributes.position.array;
    for (let i = 0; i < arcPts.length; i++) {
      arr[i * 3 + 0] = arcPts[i].x;
      arr[i * 3 + 1] = arcPts[i].y;
      arr[i * 3 + 2] = arcPts[i].z;
    }
    this.arcGeom.attributes.position.needsUpdate = true;

    const drawCount = Math.floor(arcPts.length * this.state.arcDraw);
    this.arcLine.geometry.setDrawRange(0, drawCount);
    this.arcMat.opacity = Math.min(1.0, this.state.arcDraw * 1.5);

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    super.destroy();
    if (this.beatTriggers) { this.beatTriggers.forEach((st) => st.kill()); this.beatTriggers = null; }
    if (this.timeline) {
      if (this.timeline.scrollTrigger) this.timeline.scrollTrigger.kill();
      this.timeline.kill();
      this.timeline = null;
    }
    if (this.sphereGeom) this.sphereGeom.dispose();
    for (const n of this.nodes) {
      n.mat.dispose();
      n.labelMat.dispose();
      n.labelTex.dispose();
    }
    if (this.edgeGeom) this.edgeGeom.dispose();
    if (this.edgeMat) this.edgeMat.dispose();
    if (this.arcGeom) this.arcGeom.dispose();
    if (this.arcMat) this.arcMat.dispose();
    if (this.renderer) this.renderer.dispose();
    this.nodes = [];
    this.edgeList = [];
    this.sphereGeom = null;
    this.edgeGeom = this.edgeMat = null;
    this.arcGeom = this.arcMat = this.arcLine = null;
    this.renderer = this.scene = this.camera = null;
  }
}
