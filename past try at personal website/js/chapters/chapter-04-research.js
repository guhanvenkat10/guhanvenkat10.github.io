import * as THREE from 'three';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { VisualChapter } from './base.js';

/* =============================================================
 *  Ch04 — Research Labs: 3D Mouse Pose-Tracking Skeleton
 *  -------------------------------------------------------------
 *  A keypoint constellation in the style of SLEAP / DeepLabCut.
 *  Anatomical landmarks (nose, ears, eyes, spine, paws, tail) are
 *  rendered as glowing instanced spheres connected by LineSegments
 *  along the skeleton topology. The brain region carries a brighter
 *  cluster halo. On scroll climax, ~30 data-pulse particles fly from
 *  the keypoints into the global Rainbow River.
 * ============================================================= */

// Keypoint table — name, [x, y, z], isBrainRegion.
const KEYPOINTS = [
  ['nose',       [ 1.05,  0.10,  0.00], false],
  ['earL',       [ 0.78,  0.35, -0.12], false],
  ['earR',       [ 0.78,  0.35,  0.12], false],
  ['eyeL',       [ 0.92,  0.18, -0.10], false],
  ['eyeR',       [ 0.92,  0.18,  0.10], false],
  ['neck',       [ 0.55,  0.05,  0.00], false],
  ['brain_apex', [ 0.68,  0.32,  0.00], true],
  ['shoulderL',  [ 0.50, -0.05, -0.18], false],
  ['shoulderR',  [ 0.50, -0.05,  0.18], false],
  ['spine_1',    [ 0.25,  0.00,  0.00], false],
  ['spine_2',    [-0.05, -0.05,  0.00], false],
  ['spine_3',    [-0.35, -0.08,  0.00], false],
  ['hipL',       [-0.35, -0.10, -0.20], false],
  ['hipR',       [-0.35, -0.10,  0.20], false],
  ['tail_base',  [-0.55, -0.05,  0.00], false],
  ['tail_mid',   [-0.95,  0.15,  0.00], false],
  ['tail_tip',   [-1.30,  0.42,  0.00], false],
  ['pawFL',      [ 0.42, -0.55, -0.18], false],
  ['pawFR',      [ 0.42, -0.55,  0.18], false],
  ['pawBL',      [-0.25, -0.55, -0.22], false],
  ['pawBR',      [-0.25, -0.55,  0.22], false],
];
const KP_INDEX = Object.fromEntries(KEYPOINTS.map(([n], i) => [n, i]));

// Edge list — pairs of keypoint names.
const EDGES = [
  ['nose', 'earL'], ['nose', 'earR'],
  ['nose', 'eyeL'], ['nose', 'eyeR'],
  ['eyeL', 'neck'], ['eyeR', 'neck'],
  ['nose', 'neck'],
  ['neck', 'spine_1'], ['spine_1', 'spine_2'], ['spine_2', 'spine_3'], ['spine_3', 'tail_base'],
  ['tail_base', 'tail_mid'], ['tail_mid', 'tail_tip'],
  ['neck', 'shoulderL'], ['neck', 'shoulderR'],
  ['shoulderL', 'pawFL'], ['shoulderR', 'pawFR'],
  ['spine_3', 'hipL'], ['spine_3', 'hipR'],
  ['hipL', 'pawBL'], ['hipR', 'pawBR'],
  ['neck', 'brain_apex'],
];

const NUM_PULSES = 30;

function makeSpriteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(32, 32, 32, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export class ResearchChapter extends VisualChapter {
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
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.camera.position.set(0, 0, 3.6);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // ---- Keypoint base positions (mutable for animation) ----
    this.basePositions = KEYPOINTS.map(([, p]) => new THREE.Vector3(p[0], p[1], p[2]));
    this.workPositions = this.basePositions.map((p) => p.clone());
    this.phases = KEYPOINTS.map((_, i) => i * 0.41);

    // ---- Keypoint dots (InstancedMesh) ----
    this.dotGeom = new THREE.SphereGeometry(0.030, 12, 12);
    this.dotMat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dots = new THREE.InstancedMesh(this.dotGeom, this.dotMat, KEYPOINTS.length);
    this.dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const dummy = new THREE.Object3D();
    const colors = new Float32Array(KEYPOINTS.length * 3);
    for (let i = 0; i < KEYPOINTS.length; i++) {
      const isBrain = KEYPOINTS[i][2];
      const p = this.workPositions[i];
      dummy.position.copy(p);
      dummy.scale.setScalar(isBrain ? 1.6 : 1.0);
      dummy.updateMatrix();
      this.dots.setMatrixAt(i, dummy.matrix);
      // Brain region uses lime tint; everything else cool white.
      if (isBrain) {
        colors[i * 3 + 0] = 0.78; colors[i * 3 + 1] = 0.96; colors[i * 3 + 2] = 0.26;
      } else {
        colors[i * 3 + 0] = 0.94; colors[i * 3 + 1] = 0.92; colors[i * 3 + 2] = 0.88;
      }
    }
    this.dots.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    this.dots.instanceMatrix.needsUpdate = true;
    this.group.add(this.dots);

    // ---- Skeleton edges ----
    this.edgeIndices = EDGES.map(([a, b]) => [KP_INDEX[a], KP_INDEX[b]]);
    this.edgePos = new Float32Array(this.edgeIndices.length * 6);
    this.refreshEdgeBuffer();
    this.edgeGeom = new THREE.BufferGeometry();
    this.edgeGeom.setAttribute('position', new THREE.BufferAttribute(this.edgePos, 3));
    this.edgeMat = new THREE.LineBasicMaterial({
      color: 0xf0ece4,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
    });
    this.edges = new THREE.LineSegments(this.edgeGeom, this.edgeMat);
    this.group.add(this.edges);

    // ---- Brain cluster halo (small additive sprites orbiting brain_apex) ----
    this.spriteTex = makeSpriteTexture();
    const haloCount = 14;
    const haloPos = new Float32Array(haloCount * 3);
    const haloColors = new Float32Array(haloCount * 3);
    this.haloPhases = new Float32Array(haloCount);
    const brainPos = this.basePositions[KP_INDEX['brain_apex']];
    for (let i = 0; i < haloCount; i++) {
      const a = (i / haloCount) * Math.PI * 2;
      const r = 0.04 + Math.random() * 0.05;
      haloPos[i * 3 + 0] = brainPos.x + Math.cos(a) * r;
      haloPos[i * 3 + 1] = brainPos.y + Math.sin(a) * r * 0.7;
      haloPos[i * 3 + 2] = brainPos.z + (Math.random() - 0.5) * 0.05;
      haloColors[i * 3 + 0] = 0.78;
      haloColors[i * 3 + 1] = 0.96;
      haloColors[i * 3 + 2] = 0.26;
      this.haloPhases[i] = Math.random() * Math.PI * 2;
    }
    this.haloGeom = new THREE.BufferGeometry();
    this.haloGeom.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
    this.haloGeom.setAttribute('color', new THREE.BufferAttribute(haloColors, 3));
    this.haloMat = new THREE.PointsMaterial({
      size: 0.10,
      map: this.spriteTex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      opacity: 0.6,
    });
    this.halo = new THREE.Points(this.haloGeom, this.haloMat);
    this.group.add(this.halo);
    this.haloBasePos = haloPos.slice();

    // ---- Climax pulses (toward the global river) ----
    this.pulses = [];
    this.pulseMat = new THREE.PointsMaterial({
      size: 0.18,
      map: this.spriteTex,
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      opacity: 0.95,
    });
    this.pulsePos = new Float32Array(NUM_PULSES * 3);
    this.pulseColors = new Float32Array(NUM_PULSES * 3);
    for (let i = 0; i < NUM_PULSES; i++) {
      this.pulsePos[i * 3 + 0] = 0;
      this.pulsePos[i * 3 + 1] = 0;
      this.pulsePos[i * 3 + 2] = 0;
      const hue = (i / NUM_PULSES + 0.1) % 1;
      const c = new THREE.Color().setHSL(hue, 0.9, 0.6);
      this.pulseColors[i * 3 + 0] = c.r;
      this.pulseColors[i * 3 + 1] = c.g;
      this.pulseColors[i * 3 + 2] = c.b;
    }
    this.pulseGeom = new THREE.BufferGeometry();
    this.pulseGeom.setAttribute('position', new THREE.BufferAttribute(this.pulsePos, 3));
    this.pulseGeom.setAttribute('color', new THREE.BufferAttribute(this.pulseColors, 3));
    this.pulsePoints = new THREE.Points(this.pulseGeom, this.pulseMat);
    this.pulsePoints.frustumCulled = false;
    this.pulsePoints.visible = false;
    this.scene.add(this.pulsePoints);

    // Group starts hidden; per-beat ScrollTriggers fade it in.
    this.group.scale.setScalar(0.85);
    this.dotMat.opacity = 0.0;
    this.edgeMat.opacity = 0.0;
    this.haloMat.opacity = 0.0;

    // Animation state.
    this.gaitActive = false;
    this.brainBoost = 0;

    this.setupScrollTriggers();
  }

  refreshEdgeBuffer() {
    for (let i = 0; i < this.edgeIndices.length; i++) {
      const [a, b] = this.edgeIndices[i];
      const pa = this.workPositions[a];
      const pb = this.workPositions[b];
      this.edgePos[i * 6 + 0] = pa.x; this.edgePos[i * 6 + 1] = pa.y; this.edgePos[i * 6 + 2] = pa.z;
      this.edgePos[i * 6 + 3] = pb.x; this.edgePos[i * 6 + 4] = pb.y; this.edgePos[i * 6 + 5] = pb.z;
    }
    if (this.edgeGeom) this.edgeGeom.attributes.position.needsUpdate = true;
  }

  setupScrollTriggers() {
    const beats = this.container.querySelectorAll('.ch-beat, .ch-beat-block');
    this.beatTriggers = [];

    const onEnter = [
      // beat 0 — intro: skeleton fades in
      () => {
        gsap.to([this.dotMat, this.edgeMat], { opacity: 0.85, duration: 0.7, ease: 'power2.out' });
        gsap.to(this.haloMat, { opacity: 0.65, duration: 0.7, delay: 0.2 });
      },
      // beat 1 — Eisch Lab: gait cycle begins
      () => {
        this.gaitActive = true;
        gsap.to(this.edgeMat, { opacity: 0.85, duration: 0.5 });
      },
      // beat 2 — Mukherjee Lab: brain cluster brightens; release pulses into river
      () => {
        gsap.to(this, { brainBoost: 1, duration: 0.7, ease: 'power2.out' });
        gsap.to(this.haloMat, { opacity: 1.0, duration: 0.5 });
        this.firePulses();
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

    // Slight whole-skeleton rotation as user scrolls the chapter.
    this.rotTl = gsap.timeline({
      scrollTrigger: {
        trigger: this.container,
        start: 'top 80%',
        end: 'bottom 20%',
        scrub: 0.6,
      },
    });
    this.rotTl.fromTo(this.group.rotation, { y: -0.3 }, { y: 0.3, duration: 1 });
  }

  firePulses() {
    if (this.pulsesActive) return;
    this.pulsesActive = true;
    this.pulsePoints.visible = true;

    // Compute river target: pull the global river's curve point at the user's
    // current scroll position so pulses head into the river's visible arc.
    const river = window.__river;
    const target = river && river.getCurvePointAtScroll
      ? river.getCurvePointAtScroll(window.scrollY + window.innerHeight * 0.5)
      : new THREE.Vector3(0, -2, 0);
    // River lives in a different scene; convert its world space to ours via a
    // hand-tuned offset — the visual reads as "pulses fly off-screen toward
    // the river canvas region." We use a target in screen-relative direction.
    const dir = new THREE.Vector3(2.5, -1.0, 0); // toward lower-right edge

    // For each pulse, pick a random keypoint as origin and a small detour
    // curve endpoint just past the canvas edge in that direction.
    this.pulseRecords = [];
    for (let i = 0; i < NUM_PULSES; i++) {
      const kp = Math.floor(Math.random() * KEYPOINTS.length);
      const origin = this.workPositions[kp].clone();
      const end = origin.clone().add(dir).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.4,
      ));
      const mid = origin.clone().lerp(end, 0.45).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        0.5 + Math.random() * 0.4,
        0,
      ));
      this.pulseRecords.push({
        curve: new THREE.QuadraticBezierCurve3(origin, mid, end),
        t: -Math.random() * 0.4,  // staggered start
        speed: 0.4 + Math.random() * 0.4,
        alive: true,
      });
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

    // Gait cycle — bob keypoints in y, sway tail in z.
    if (this.gaitActive) {
      const t = time * 2.4;
      for (let i = 0; i < KEYPOINTS.length; i++) {
        const base = this.basePositions[i];
        const phase = this.phases[i];
        const name = KEYPOINTS[i][0];
        let yOff = Math.sin(t + phase) * 0.015;
        let zOff = 0;
        if (name.startsWith('tail')) {
          const tailIdx = name === 'tail_base' ? 1 : (name === 'tail_mid' ? 2 : 3);
          zOff = Math.sin(t * 1.4 + tailIdx) * 0.06 * tailIdx;
          yOff *= 1.4;
        }
        if (name.startsWith('paw')) yOff *= 1.8;
        this.workPositions[i].set(base.x, base.y + yOff, base.z + zOff);
      }
    } else {
      for (let i = 0; i < KEYPOINTS.length; i++) {
        this.workPositions[i].copy(this.basePositions[i]);
      }
    }

    // Update instance matrices.
    const dummy = new THREE.Object3D();
    for (let i = 0; i < KEYPOINTS.length; i++) {
      const isBrain = KEYPOINTS[i][2];
      dummy.position.copy(this.workPositions[i]);
      const scale = isBrain ? (1.6 + this.brainBoost * 0.7) : 1.0;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      this.dots.setMatrixAt(i, dummy.matrix);
    }
    this.dots.instanceMatrix.needsUpdate = true;
    this.refreshEdgeBuffer();

    // Brain halo orbit + brightness.
    const haloArr = this.haloGeom.attributes.position.array;
    const brainPos = this.workPositions[KP_INDEX['brain_apex']];
    for (let i = 0; i < this.haloPhases.length; i++) {
      const phase = this.haloPhases[i] + time * (0.6 + i * 0.04);
      const r = 0.05 + Math.sin(phase * 1.4) * 0.02 + this.brainBoost * 0.04;
      haloArr[i * 3 + 0] = brainPos.x + Math.cos(phase) * r;
      haloArr[i * 3 + 1] = brainPos.y + Math.sin(phase) * r * 0.7;
      haloArr[i * 3 + 2] = brainPos.z + Math.sin(phase * 0.7) * 0.04;
    }
    this.haloGeom.attributes.position.needsUpdate = true;
    if (this.haloMat) {
      this.haloMat.size = 0.10 + this.brainBoost * 0.08;
    }

    // Pulses — quadratic-bezier flight to target, fade as t→1.
    if (this.pulsesActive && this.pulseRecords) {
      let anyAlive = false;
      const arr = this.pulseGeom.attributes.position.array;
      const cArr = this.pulseGeom.attributes.color.array;
      for (let i = 0; i < NUM_PULSES; i++) {
        const r = this.pulseRecords[i];
        if (!r.alive) continue;
        r.t += delta * r.speed;
        if (r.t >= 1) {
          r.alive = false;
          arr[i * 3 + 0] = 1e6;  // park off-screen
          arr[i * 3 + 1] = 1e6;
          arr[i * 3 + 2] = 1e6;
          continue;
        }
        anyAlive = true;
        const tt = Math.max(0, r.t);
        const p = r.curve.getPoint(tt);
        arr[i * 3 + 0] = p.x;
        arr[i * 3 + 1] = p.y;
        arr[i * 3 + 2] = p.z;
        const fade = 1 - Math.pow(tt, 2);
        cArr[i * 3 + 0] *= 1; cArr[i * 3 + 1] *= 1; cArr[i * 3 + 2] *= 1;
        // (Color kept constant; opacity controlled material-wide.)
      }
      this.pulseGeom.attributes.position.needsUpdate = true;
      if (!anyAlive) {
        this.pulsesActive = false;
        this.pulsePoints.visible = false;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    super.destroy();
    if (this.beatTriggers) { this.beatTriggers.forEach((st) => st.kill()); this.beatTriggers = null; }
    if (this.rotTl) {
      if (this.rotTl.scrollTrigger) this.rotTl.scrollTrigger.kill();
      this.rotTl.kill();
      this.rotTl = null;
    }
    if (this.dotGeom) this.dotGeom.dispose();
    if (this.dotMat) this.dotMat.dispose();
    if (this.edgeGeom) this.edgeGeom.dispose();
    if (this.edgeMat) this.edgeMat.dispose();
    if (this.haloGeom) this.haloGeom.dispose();
    if (this.haloMat) this.haloMat.dispose();
    if (this.pulseGeom) this.pulseGeom.dispose();
    if (this.pulseMat) this.pulseMat.dispose();
    if (this.spriteTex) this.spriteTex.dispose();
    if (this.renderer) this.renderer.dispose();
    this.dots = this.edges = this.halo = this.pulsePoints = null;
    this.renderer = this.scene = this.camera = this.group = null;
  }
}
