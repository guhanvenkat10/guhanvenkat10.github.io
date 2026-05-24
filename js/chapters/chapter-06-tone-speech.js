import * as THREE from 'three';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { VisualChapter } from './base.js';

/* =============================================================
 *  Ch06 — TONESPEECH
 *  -------------------------------------------------------------
 *  An anatomical face built from parametric contour lines and a
 *  468-point landmark constellation (matching MediaPipe's spec).
 *  AU morphs (brows, cheeks, lips, jaw) translate whole contour
 *  groups in response to scroll beats. The climax drops the jaw
 *  open and ignites a waveform line below the chin.
 * ============================================================= */

const FACE_LANDMARKS = 468;
const WAVEFORM_POINTS = 220;

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

/* ----- Contour builders ----- */
function eyeRing(cx, cy, cz, rx, ry, count = 28) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = (i / count) * Math.PI * 2;
    pts.push(V(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, cz + Math.sin(t) * 0.03));
  }
  return pts;
}
function browArc(cx, cy, cz, rx, ry, count = 20) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const a = (t - 0.5) * Math.PI;
    pts.push(V(cx + Math.sin(a) * rx, cy + Math.cos(a) * ry * 0.35 + 0.02, cz));
  }
  return pts;
}
function noseRidge(count = 18) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const y = 0.42 - t * 0.55;
    const z = 0.96 + Math.sin(t * Math.PI) * 0.06;
    const x = Math.sin(t * Math.PI * 0.5) * 0.015;
    pts.push(V(x, y, z));
  }
  return pts;
}
function nostrilArc(side, count = 12) {
  const pts = [];
  const cx = 0.05 * side;
  for (let i = 0; i <= count; i++) {
    const t = (i / count) * Math.PI;
    pts.push(V(cx + Math.cos(t) * 0.07 * side, -0.16 + Math.sin(t) * 0.04, 0.95));
  }
  return pts;
}
function jawline(count = 60) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = -Math.cos(Math.PI * t) * 0.86;
    const y = -0.30 - Math.sin(Math.PI * t) * 0.72;
    const z = 0.42 + Math.sin(Math.PI * t) * 0.22;
    pts.push(V(x, y, z));
  }
  return pts;
}
function outerLip(count = 36) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const a = (t - 0.5) * Math.PI * 2;
    const x = Math.cos(a) * 0.20;
    const y = -0.36 + Math.sin(a) * 0.08;
    pts.push(V(x, y, 0.95));
  }
  return pts;
}
function innerLip(count = 30) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const a = (t - 0.5) * Math.PI * 2;
    const x = Math.cos(a) * 0.14;
    const y = -0.36 + Math.sin(a) * 0.04;
    pts.push(V(x, y, 0.97));
  }
  return pts;
}
function cheekArc(side, count = 22) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = side * (0.30 + t * 0.42);
    const y = -0.08 - t * 0.18 + Math.sin(t * Math.PI) * 0.05;
    const z = 0.55 - t * 0.35;
    pts.push(V(x, y, z));
  }
  return pts;
}
function faceOutline(count = 80) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const a = t * Math.PI * 2;
    /* Egg-shaped outline; flatter top, taper down */
    const rx = 0.78;
    const ry = 0.95 + (Math.cos(a) > 0 ? 0.05 : 0);
    pts.push(V(Math.cos(a) * rx, Math.sin(a) * ry * 0.95 - 0.08, 0.15));
  }
  return pts;
}

function linePointsGeom(pts, color) {
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.0 });
  return { line: new THREE.Line(geom, mat), geom, mat };
}

export class ToneSpeechChapter extends VisualChapter {
  constructor(canvas, container) {
    super(canvas, container);
    this.idleT = 0;
    this.revealT = 0;
    this.browFurrow = 0;
    this.cheekLift = 0;
    this.lipSmile = 0;
    this.jawDrop = 0;
    this.waveformOn = 0;
    this.targetRotY = -0.05;
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

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0, 0, 3.6);
    this.camera.lookAt(0, -0.05, 0);

    this.faceGroup = new THREE.Group();
    this.scene.add(this.faceGroup);

    /* Build contour lines */
    const lineColor = 0xf0ece4;
    this.contours = [];
    const addContour = (pts, name, color = lineColor) => {
      const c = linePointsGeom(pts, color);
      this.faceGroup.add(c.line);
      this.contours.push({ name, ...c, basePts: pts.map((p) => p.clone()) });
      return c;
    };

    addContour(faceOutline(), 'outline');
    addContour(eyeRing(-0.30, 0.18, 0.85, 0.13, 0.06), 'eyeL');
    addContour(eyeRing( 0.30, 0.18, 0.85, 0.13, 0.06), 'eyeR');
    addContour(browArc(-0.30, 0.36, 0.78, 0.18, 0.10), 'browL');
    addContour(browArc( 0.30, 0.36, 0.78, 0.18, 0.10), 'browR');
    addContour(noseRidge(), 'noseRidge');
    addContour(nostrilArc(-1), 'nostrilL');
    addContour(nostrilArc( 1), 'nostrilR');
    addContour(outerLip(), 'outerLip');
    addContour(innerLip(), 'innerLip');
    addContour(cheekArc(-1), 'cheekL');
    addContour(cheekArc( 1), 'cheekR');
    addContour(jawline(), 'jaw');

    /* 468 MediaPipe landmark dots — distribute across all contours plus
       fill the interior with a parametric scatter so the count matches. */
    const allPts = [];
    for (const c of this.contours) {
      for (const p of c.basePts) allPts.push(p.clone());
    }
    /* Fill remainder with interior face-grid samples */
    while (allPts.length < FACE_LANDMARKS) {
      /* Random point on an ellipsoid surface, inside the face outline */
      const phi = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.7;
      const x = Math.cos(phi) * r * 0.72;
      const y = Math.sin(phi) * r * 0.88 - 0.05;
      /* Depth from a soft inflated-sphere */
      const denom = (x / 0.72) ** 2 + ((y + 0.05) / 0.88) ** 2;
      const z = Math.sqrt(Math.max(0, 1 - denom)) * 0.55 + 0.30;
      allPts.push(V(x, y, z));
    }
    /* Cap at FACE_LANDMARKS */
    while (allPts.length > FACE_LANDMARKS) allPts.pop();

    /* Build InstancedMesh of small dots */
    const dotGeo = new THREE.SphereGeometry(0.008, 8, 6);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xf0ece4,
      transparent: true,
      opacity: 0.0,
    });
    this.dotMesh = new THREE.InstancedMesh(dotGeo, dotMat, FACE_LANDMARKS);
    this.dotMesh.frustumCulled = false;
    const tmpMat = new THREE.Matrix4();
    const tmpScale = new THREE.Vector3(1, 1, 1);
    const tmpQuat = new THREE.Quaternion();
    for (let i = 0; i < FACE_LANDMARKS; i++) {
      const p = allPts[i];
      tmpMat.compose(p, tmpQuat, tmpScale);
      this.dotMesh.setMatrixAt(i, tmpMat);
    }
    this.dotMesh.instanceMatrix.needsUpdate = true;
    this.dotPositions = allPts;
    this.faceGroup.add(this.dotMesh);

    /* Waveform line below the chin (hidden initially) */
    const wfPts = [];
    for (let i = 0; i < WAVEFORM_POINTS; i++) {
      const x = (i / (WAVEFORM_POINTS - 1) - 0.5) * 1.4;
      wfPts.push(V(x, -1.2, 0.2));
    }
    const wfGeom = new THREE.BufferGeometry().setFromPoints(wfPts);
    const wfMat = new THREE.LineBasicMaterial({
      color: 0xc8f542,
      transparent: true,
      opacity: 0.0,
    });
    this.waveform = new THREE.Line(wfGeom, wfMat);
    this.waveformGeom = wfGeom;
    this.scene.add(this.waveform);

    this.setupScrollTimeline();
  }

  setupScrollTimeline() {
    const beats = this.container.querySelectorAll('.ch-beat');
    this.beatTriggers = [];

    const onEnterMap = [
      /* 0 — 468 landmarks appear */
      () => {
        gsap.to(this, { revealT: 1.0, duration: 1.8, ease: 'power2.out' });
      },
      /* 1 — brow furrow */
      () => {
        gsap.to(this, { browFurrow: 1.0, duration: 0.9, ease: 'power2.inOut' });
      },
      /* 2 — cheeks lift + smile */
      () => {
        gsap.to(this, { cheekLift: 1.0, lipSmile: 1.0, duration: 1.1, ease: 'power2.inOut' });
      },
      /* 3 — jaw drops + waveform ignites */
      () => {
        gsap.to(this, { browFurrow: 0.0, cheekLift: 0.6, lipSmile: 0.3, duration: 0.6 });
        gsap.to(this, { jawDrop: 1.0, duration: 1.2, ease: 'power2.out', delay: 0.2 });
        gsap.to(this, { waveformOn: 1.0, duration: 0.8, delay: 0.6 });
        gsap.to(this.waveform.material, { opacity: 0.95, duration: 0.8, delay: 0.6 });
      },
    ];

    beats.forEach((beat, idx) => {
      const st = ScrollTrigger.create({
        trigger: beat,
        start: 'top 75%',
        onEnter: () => {
          gsap.to(beat, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' });
          if (onEnterMap[idx]) onEnterMap[idx]();
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

  /* Apply AU morphs to a base point — used for both contours & dots. */
  morphPoint(basePt, name) {
    const out = basePt.clone();

    /* Subtle perlin-like drift */
    const drift = (k) => Math.sin(this.idleT * k + basePt.x * 4 + basePt.y * 3) * 0.004;
    out.x += drift(1.1);
    out.y += drift(0.9);

    /* Brow furrow — browL/browR move down + inward */
    if (name === 'browL' || name === 'browR') {
      const dir = name === 'browL' ? 1 : -1;
      out.y -= 0.06 * this.browFurrow;
      out.x += 0.025 * dir * this.browFurrow;
    }
    /* Cheek lift — cheek arcs move up */
    if (name === 'cheekL' || name === 'cheekR') {
      out.y += 0.05 * this.cheekLift;
    }
    /* Lip smile — outer lip corners pull up & out */
    if (name === 'outerLip' || name === 'innerLip') {
      const dist = Math.abs(basePt.x);
      const factor = Math.pow(Math.min(dist / 0.20, 1), 1.6);
      out.y += 0.06 * factor * this.lipSmile;
      out.x += 0.03 * Math.sign(basePt.x) * factor * this.lipSmile;
    }
    /* Jaw drop — anything below ~ y=-0.30 displaces downward, more at chin */
    const jawDistance = Math.max(0, -basePt.y - 0.30);
    if (jawDistance > 0) {
      const factor = Math.pow(Math.min(jawDistance / 0.7, 1), 1.3);
      out.y -= 0.18 * factor * this.jawDrop;
    }
    /* Inner lip parts open with jaw too */
    if (name === 'innerLip') {
      out.y -= 0.04 * this.jawDrop;
    }
    return out;
  }

  tick(time, delta) {
    if (!this.isActive) return;
    this.idleT += delta;

    /* Group rotation gentle yaw */
    this.faceGroup.rotation.y += (this.targetRotY - this.faceGroup.rotation.y) * 0.04;
    this.faceGroup.rotation.x = Math.sin(this.idleT * 0.4) * 0.04;

    /* Update contour line geometries */
    let totalDotIdx = 0;
    for (const c of this.contours) {
      const arr = c.geom.attributes.position.array;
      for (let i = 0; i < c.basePts.length; i++) {
        const p = this.morphPoint(c.basePts[i], c.name);
        arr[i * 3 + 0] = p.x;
        arr[i * 3 + 1] = p.y;
        arr[i * 3 + 2] = p.z;
      }
      c.geom.attributes.position.needsUpdate = true;

      /* Contour color signal — pick warmth per AU active */
      let col = new THREE.Color(0xf0ece4);
      if ((c.name === 'browL' || c.name === 'browR') && this.browFurrow > 0.05)
        col = new THREE.Color(0xf5b042);
      else if ((c.name === 'cheekL' || c.name === 'cheekR') && this.cheekLift > 0.05)
        col = new THREE.Color(0xf5d442);
      else if ((c.name === 'outerLip' || c.name === 'innerLip') && this.lipSmile > 0.05)
        col = new THREE.Color(0x86d77e);
      c.mat.color.copy(col);

      /* Reveal opacity progressively */
      c.mat.opacity = THREE.MathUtils.clamp(this.revealT * 1.3, 0, 0.85);
    }

    /* Update dot instances (468 landmarks) */
    const tmpMat = new THREE.Matrix4();
    const tmpQuat = new THREE.Quaternion();
    const tmpScale = new THREE.Vector3();
    for (let i = 0; i < FACE_LANDMARKS; i++) {
      const base = this.dotPositions[i];
      const p = this.morphPoint(base, null);
      const t = THREE.MathUtils.clamp(
        (this.revealT * (FACE_LANDMARKS + 60) - i) / 60, 0, 1
      );
      tmpScale.setScalar(t);
      tmpMat.compose(p, tmpQuat, tmpScale);
      this.dotMesh.setMatrixAt(i, tmpMat);
    }
    this.dotMesh.instanceMatrix.needsUpdate = true;
    this.dotMesh.material.opacity = 0.4 + 0.5 * this.revealT;

    /* Waveform animate when on */
    if (this.waveformOn > 0.02) {
      const arr = this.waveformGeom.attributes.position.array;
      for (let i = 0; i < WAVEFORM_POINTS; i++) {
        const x = arr[i * 3 + 0];
        const phase = (i / WAVEFORM_POINTS) * Math.PI * 12;
        const envelope = Math.sin((i / WAVEFORM_POINTS) * Math.PI);
        const amp = 0.10 * envelope * this.waveformOn;
        arr[i * 3 + 1] = -1.18 + Math.sin(phase + time * 5.0) * amp
                                + Math.sin(phase * 1.7 + time * 2.5) * amp * 0.4;
      }
      this.waveformGeom.attributes.position.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    super.destroy();
    if (this.beatTriggers) { this.beatTriggers.forEach((st) => st.kill()); this.beatTriggers = null; }
    for (const c of this.contours || []) { c.geom.dispose(); c.mat.dispose(); }
    if (this.dotMesh) { this.dotMesh.geometry.dispose(); this.dotMesh.material.dispose(); }
    if (this.waveformGeom) this.waveformGeom.dispose();
    if (this.waveform) this.waveform.material.dispose();
    if (this.renderer) this.renderer.dispose();
    this.renderer = this.scene = this.camera = null;
  }
}
