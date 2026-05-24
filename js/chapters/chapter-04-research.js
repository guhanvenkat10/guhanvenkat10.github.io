import * as THREE from 'three';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { VisualChapter } from './base.js';

/* =============================================================
 *  Ch04 — Research Labs
 *  -------------------------------------------------------------
 *  A 3D mouse pose-tracking skeleton in the spirit of SLEAP /
 *  DeepLabCut: anatomical keypoints rendered as glowing instanced
 *  spheres, connected by thin line segments along the topology.
 *  The brain region carries a brighter halo and a tracing arc
 *  from prefrontal → hippocampus that draws on the second beat.
 * ============================================================= */

/* Keypoint table — name, [x, y, z], isBrain, isFace */
const KEYPOINTS = [
  ['nose',       [ 1.05,  0.10,  0.00], false, true ],
  ['snout',      [ 0.95,  0.04,  0.00], false, true ],
  ['whiskerL',   [ 1.02,  0.00, -0.10], false, true ],
  ['whiskerR',   [ 1.02,  0.00,  0.10], false, true ],
  ['eyeL',       [ 0.92,  0.18, -0.10], false, true ],
  ['eyeR',       [ 0.92,  0.18,  0.10], false, true ],
  ['earL',       [ 0.78,  0.35, -0.12], false, false],
  ['earR',       [ 0.78,  0.35,  0.12], false, false],
  ['brain_pfc',  [ 0.70,  0.30,  0.00], true,  false],   /* prefrontal cortex */
  ['brain_hipp', [ 0.50,  0.32,  0.00], true,  false],   /* hippocampus */
  ['neck',       [ 0.40,  0.05,  0.00], false, false],
  ['shoulderL',  [ 0.35, -0.05, -0.18], false, false],
  ['shoulderR',  [ 0.35, -0.05,  0.18], false, false],
  ['spine_1',    [ 0.15, -0.02,  0.00], false, false],
  ['spine_2',    [-0.10, -0.06,  0.00], false, false],
  ['spine_3',    [-0.35, -0.08,  0.00], false, false],
  ['hipL',       [-0.35, -0.10, -0.20], false, false],
  ['hipR',       [-0.35, -0.10,  0.20], false, false],
  ['tail_base',  [-0.55, -0.05,  0.00], false, false],
  ['tail_mid',   [-0.95,  0.15,  0.00], false, false],
  ['tail_tip',   [-1.30,  0.42,  0.00], false, false],
  ['pawFL',      [ 0.32, -0.55, -0.18], false, false],
  ['pawFR',      [ 0.32, -0.55,  0.18], false, false],
  ['pawBL',      [-0.30, -0.55, -0.22], false, false],
  ['pawBR',      [-0.30, -0.55,  0.22], false, false],
];
const KP_INDEX = Object.fromEntries(KEYPOINTS.map(([n], i) => [n, i]));

const EDGES = [
  ['snout', 'nose'], ['snout', 'whiskerL'], ['snout', 'whiskerR'],
  ['nose', 'eyeL'], ['nose', 'eyeR'],
  ['eyeL', 'earL'], ['eyeR', 'earR'],
  ['eyeL', 'neck'], ['eyeR', 'neck'],
  ['earL', 'neck'], ['earR', 'neck'],
  ['neck', 'brain_pfc'], ['brain_pfc', 'brain_hipp'],
  ['neck', 'shoulderL'], ['neck', 'shoulderR'],
  ['shoulderL', 'spine_1'], ['shoulderR', 'spine_1'],
  ['shoulderL', 'pawFL'], ['shoulderR', 'pawFR'],
  ['spine_1', 'spine_2'], ['spine_2', 'spine_3'],
  ['spine_3', 'hipL'], ['spine_3', 'hipR'],
  ['hipL', 'pawBL'], ['hipR', 'pawBR'],
  ['spine_3', 'tail_base'], ['tail_base', 'tail_mid'], ['tail_mid', 'tail_tip'],
];

export class ResearchChapter extends VisualChapter {
  constructor(canvas, container) {
    super(canvas, container);
    this.idleT = 0;
    this.targetRotY = 0.55;
    this.discoverProgress = 0;     /* 0..1 — beat 1: keypoints appear */
    this.faceHighlight = 0;        /* 0..1 — beat 2: face dots glow */
    this.arcProgress = 0;          /* 0..1 — beat 2: pfc→hipp arc draws */
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
    this.camera.position.set(0.2, 0.4, 3.4);
    this.camera.lookAt(0, -0.05, 0);

    /* Group for rotation */
    this.group = new THREE.Group();
    this.scene.add(this.group);

    /* Keypoint instanced spheres (small) */
    const dotGeo = new THREE.SphereGeometry(0.022, 14, 12);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xf0ece4, transparent: true });
    this.dotMesh = new THREE.InstancedMesh(dotGeo, dotMat, KEYPOINTS.length);
    this.dotMesh.frustumCulled = false;
    this.dotMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(KEYPOINTS.length * 3), 3,
    );

    const tmpMat = new THREE.Matrix4();
    const tmpScale = new THREE.Vector3(1, 1, 1);
    const tmpQuat = new THREE.Quaternion();
    const tmpVec = new THREE.Vector3();
    const baseCol = new THREE.Color(0xf0ece4);
    const brainCol = new THREE.Color(0xffe066);
    const faceCol = new THREE.Color(0xf0ece4);

    for (let i = 0; i < KEYPOINTS.length; i++) {
      const [, p, isBrain] = KEYPOINTS[i];
      tmpVec.set(p[0], p[1], p[2]);
      tmpMat.compose(tmpVec, tmpQuat, isBrain ? tmpScale.setScalar(1.6) : tmpScale.setScalar(1));
      this.dotMesh.setMatrixAt(i, tmpMat);
      const c = isBrain ? brainCol : baseCol;
      this.dotMesh.setColorAt(i, c);
    }
    this.dotMesh.instanceMatrix.needsUpdate = true;
    if (this.dotMesh.instanceColor) this.dotMesh.instanceColor.needsUpdate = true;
    this.group.add(this.dotMesh);

    /* Edges — thin lines, baseline + brighter variant for brain edges */
    const posArr = [];
    const colArr = [];
    const dimCol = [0.94, 0.93, 0.89];
    const brainEdgeCol = [1.0, 0.88, 0.4];
    for (const [a, b] of EDGES) {
      const ia = KP_INDEX[a], ib = KP_INDEX[b];
      const pa = KEYPOINTS[ia][1], pb = KEYPOINTS[ib][1];
      posArr.push(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2]);
      const c = (KEYPOINTS[ia][2] && KEYPOINTS[ib][2]) ? brainEdgeCol : dimCol;
      colArr.push(...c, ...c);
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    lineGeo.setAttribute('color',    new THREE.Float32BufferAttribute(colArr, 3));
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.0,
    });
    this.skeleton = new THREE.LineSegments(lineGeo, lineMat);
    this.group.add(this.skeleton);

    /* Brain halo — a translucent sphere around the brain region */
    const haloGeo = new THREE.SphereGeometry(0.18, 32, 24);
    const haloMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 0.0 } },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        uniform float uTime;
        uniform float uIntensity;
        void main() {
          float fres = pow(1.0 - max(0.0, dot(vNormal, vViewDir)), 2.8);
          float pulse = 0.5 + 0.5 * sin(uTime * 1.8);
          vec3 col = vec3(1.0, 0.86, 0.30) * fres * (0.6 + 0.4 * pulse);
          gl_FragColor = vec4(col, fres * uIntensity);
        }
      `,
    });
    this.halo = new THREE.Mesh(haloGeo, haloMat);
    const pfc = KEYPOINTS[KP_INDEX['brain_pfc']][1];
    const hipp = KEYPOINTS[KP_INDEX['brain_hipp']][1];
    this.halo.position.set((pfc[0] + hipp[0]) / 2, (pfc[1] + hipp[1]) / 2 + 0.03, 0);
    this.group.add(this.halo);

    /* Prefrontal → hippocampus circuit arc (drawn via dasharray-equivalent) */
    const arcPts = [];
    const start = new THREE.Vector3(pfc[0], pfc[1] + 0.05, 0.12);
    const end   = new THREE.Vector3(hipp[0], hipp[1] + 0.05, 0.12);
    const mid   = new THREE.Vector3(
      (start.x + end.x) / 2,
      Math.max(start.y, end.y) + 0.18,
      (start.z + end.z) / 2 + 0.10,
    );
    const arcCurve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const ARC_SEG = 60;
    for (let i = 0; i <= ARC_SEG; i++) {
      arcPts.push(arcCurve.getPoint(i / ARC_SEG));
    }
    const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPts);
    arcGeo.setDrawRange(0, 0);   /* drawn progressively */
    this.arcGeo = arcGeo;
    const arcMat = new THREE.LineBasicMaterial({
      color: 0xffd070,
      transparent: true,
      opacity: 0.0,
    });
    this.arc = new THREE.Line(arcGeo, arcMat);
    this.group.add(this.arc);

    /* Bounding plane labels — small text markers via sprites would be nice,
       but we keep this lean and let the chapter copy carry the words. */

    this.setupScrollTimeline();
  }

  setupScrollTimeline() {
    const beats = this.container.querySelectorAll('.ch-beat, .ch-beat-block');
    this.beatTriggers = [];

    const onEnterMap = [
      /* 0 — "Two labs. Two universities. One semester." */
      () => {
        gsap.to(this, { discoverProgress: 1.0, duration: 1.6, ease: 'power2.out' });
        gsap.to(this.skeleton.material, { opacity: 0.55, duration: 1.4 });
      },
      /* 1 — EISCH (SLEAP GUI) */
      () => {
        gsap.to(this, { targetRotY: 0.85, duration: 1.2, ease: 'power2.inOut' });
        gsap.to(this.halo.material.uniforms.uIntensity, { value: 0.0, duration: 0.5 });
      },
      /* 2 — MUKHERJEE (face landmarks + circuit) */
      () => {
        gsap.to(this, { targetRotY: 0.05, faceHighlight: 1.0, duration: 1.2, ease: 'power2.inOut' });
        gsap.to(this.halo.material.uniforms.uIntensity, { value: 0.85, duration: 1.0, delay: 0.3 });
        gsap.to(this, { arcProgress: 1.0, duration: 1.8, ease: 'power2.inOut', delay: 0.5 });
        gsap.to(this.arc.material, { opacity: 0.95, duration: 0.6, delay: 0.4 });
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

  tick(time, delta) {
    if (!this.isActive) return;
    this.idleT += delta;

    /* Gentle floating idle on group */
    const floatY = Math.sin(this.idleT * 0.8) * 0.02;
    this.group.position.y = floatY;
    this.group.rotation.y += (this.targetRotY - this.group.rotation.y) * 0.05;
    this.group.rotation.x = Math.sin(this.idleT * 0.4) * 0.05;

    /* Per-keypoint discovery — dots scale in over time, brain glows */
    const tmpMat = new THREE.Matrix4();
    const tmpQuat = new THREE.Quaternion();
    const tmpScale = new THREE.Vector3();
    const tmpVec = new THREE.Vector3();
    const tmpCol = new THREE.Color();
    const brainCol = new THREE.Color(0xffe066);
    const baseCol = new THREE.Color(0xf0ece4);
    const faceLit = new THREE.Color(0xffe066);

    for (let i = 0; i < KEYPOINTS.length; i++) {
      const [, p, isBrain, isFace] = KEYPOINTS[i];
      /* Progressive reveal: spread over discoverProgress with per-instance stagger */
      const t = THREE.MathUtils.clamp(
        (this.discoverProgress * (KEYPOINTS.length + 6) - i) / 4, 0, 1
      );
      const ease = 1 - Math.pow(1 - t, 3);
      const baseScale = isBrain ? 1.6 : 1.0;
      const scale = baseScale * ease * (1 + Math.sin(this.idleT * 2 + i) * 0.08 * ease);
      tmpVec.set(p[0], p[1], p[2]);
      tmpScale.setScalar(scale);
      tmpMat.compose(tmpVec, tmpQuat, tmpScale);
      this.dotMesh.setMatrixAt(i, tmpMat);

      if (isBrain) {
        tmpCol.copy(brainCol);
      } else if (isFace) {
        tmpCol.copy(baseCol).lerp(faceLit, this.faceHighlight);
      } else {
        tmpCol.copy(baseCol);
      }
      this.dotMesh.setColorAt(i, tmpCol);
    }
    this.dotMesh.instanceMatrix.needsUpdate = true;
    if (this.dotMesh.instanceColor) this.dotMesh.instanceColor.needsUpdate = true;

    /* Arc progressive draw */
    const drawCount = Math.floor(this.arcProgress * (60 + 1));
    this.arcGeo.setDrawRange(0, drawCount);

    /* Halo time uniform */
    if (this.halo) this.halo.material.uniforms.uTime.value = time;

    /* Skeleton opacity gated by discoverProgress */
    this.skeleton.material.opacity = 0.05 + 0.55 * this.discoverProgress;

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    super.destroy();
    if (this.beatTriggers) { this.beatTriggers.forEach((st) => st.kill()); this.beatTriggers = null; }
    if (this.dotMesh) { this.dotMesh.geometry.dispose(); this.dotMesh.material.dispose(); }
    if (this.skeleton) { this.skeleton.geometry.dispose(); this.skeleton.material.dispose(); }
    if (this.halo) { this.halo.geometry.dispose(); this.halo.material.dispose(); }
    if (this.arc) { this.arc.geometry.dispose(); this.arc.material.dispose(); }
    if (this.renderer) this.renderer.dispose();
    this.renderer = this.scene = this.camera = null;
  }
}
