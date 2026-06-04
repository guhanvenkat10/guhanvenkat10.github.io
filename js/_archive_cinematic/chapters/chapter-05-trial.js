import * as THREE from 'three';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { VisualChapter } from './base.js';

/* =============================================================
 *  Ch05 — Clinical Trial Outcome Predictor
 *  -------------------------------------------------------------
 *  A dense graph of ~140 statistical token nodes. Every node is
 *  connected to a handful of nearest neighbours AND has a thin link
 *  back to the central SUCCESS verdict node. As the user scrolls,
 *  high-signal nodes migrate inward and brighten; low-signal nodes
 *  drift outward.
 *
 *  Cursor interaction: any node within ~1.0 world-units of the
 *  cursor's projected position scatters outward with inverse-square
 *  force, and a quick rainbow ripple propagates through that node's
 *  edges before they spring back.
 * ============================================================= */

const NODE_COUNT  = 140;
const SUCCESS_IDX = NODE_COUNT - 1;

const NAMED_LABELS = [
  'Phase II', 'p-value', 'n=412', 'endpoint', 'dropout',
  'adverse',  'BioBERT', 'MoA',   'cohort',   'Bayesian',
  'efficacy', 'placebo', 'biomarker', 'ITT',   'AUC',
  'survival', 'PFS', 'safety', 'lit-review',
  'SUCCESS — 84% confidence',
];
const TOKEN_LABELS = [
  'β₁','β₂','σ','μ','τ','H₀','H₁','χ²','KM','r²',
  'λ','Δt','CI','HR','IC₅₀','EC₅₀','AE','SAE','Q1','Q3',
  'F₁','γ','α','ρ','OR','RR','OS','NNT','θ','φ',
  'ψ','ω','AUC-PR','ROC','BLEU','TPR','FPR','p̂','q̂','TS',
  'ES','pp','bp','wk-4','wk-12','wk-52','d0','d1','x₁','x₂',
];

const LABELS = [];
for (let i = 0; i < NODE_COUNT - 1; i++) {
  if (i < NAMED_LABELS.length - 1) {
    LABELS.push({ text: NAMED_LABELS[i], isNamed: true });
  } else {
    const t = TOKEN_LABELS[(i - (NAMED_LABELS.length - 1)) % TOKEN_LABELS.length];
    LABELS.push({ text: t, isNamed: false });
  }
}
LABELS.push({ text: NAMED_LABELS[NAMED_LABELS.length - 1], isNamed: true, isSuccess: true });

/* About a third are designated high-signal */
const HIGH_SIGNAL = new Set();
for (let i = 0; i < NODE_COUNT; i++) {
  if (i % 3 === 0 || (i < NAMED_LABELS.length && i % 2 === 0)) HIGH_SIGNAL.add(i);
}
HIGH_SIGNAL.add(SUCCESS_IDX);

function makeLabelTexture({ text, isSuccess = false, isNamed = false }) {
  const canvas = document.createElement('canvas');
  const w = isSuccess ? 640 : (isNamed ? 360 : 180);
  const h = 96;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const size = isSuccess ? 28 : (isNamed ? 20 : 18);
  const weight = isSuccess ? 500 : 400;
  ctx.font = `${weight} ${size}px "DM Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isSuccess
    ? 'rgba(200, 245, 66, 1.0)'
    : isNamed ? 'rgba(240, 236, 228, 0.92)' : 'rgba(240, 236, 228, 0.62)';
  if (isSuccess) {
    ctx.shadowColor = 'rgba(200, 245, 66, 0.6)';
    ctx.shadowBlur = 18;
  }
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return { tex, w, h };
}

/* hue→rgb (for the ripple) */
function hsl(h, s, l) {
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return new THREE.Color(f(0), f(8), f(4));
}

export class TrialChapter extends VisualChapter {
  constructor(canvas, container) {
    super(canvas, container);
    this.idleT = 0;
    this.revealT = 0;
    this.inferenceT = 0;
    this.successPulse = 0;
    this.mouseWorld = new THREE.Vector3(9999, 9999, 0);
    this.hoverHueT = 0;
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
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 0, 6.5);

    this.sprites = [];
    this.spriteState = [];

    for (let i = 0; i < NODE_COUNT; i++) {
      const meta = LABELS[i];
      const { tex, w, h } = makeLabelTexture(meta);
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0, depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      const scaleY = meta.isSuccess ? 0.42 : (meta.isNamed ? 0.28 : 0.24);
      sprite.scale.set(scaleY * (w / h), scaleY, 1);

      let pos;
      if (meta.isSuccess) {
        pos = new THREE.Vector3(0, 0, 0);
      } else {
        const phi = Math.random() * Math.PI * 2;
        const cosTheta = Math.random() * 2 - 1;
        const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
        const r = 2.6 + Math.random() * 1.4;
        pos = new THREE.Vector3(
          Math.cos(phi) * sinTheta * r,
          Math.sin(phi) * sinTheta * r * 0.55,
          cosTheta * r * 0.6,
        );
      }
      sprite.position.copy(pos);
      this.spriteState.push({
        meta, idx: i, isHigh: HIGH_SIGNAL.has(i),
        basePos: pos.clone(),
        currentTarget: pos.clone(),
        scatterVel: new THREE.Vector3(),
        wobble: Math.random() * Math.PI * 2,
        revealAt: meta.isSuccess ? 0.05 : 0.05 + Math.random() * 0.45,
        rippleT: 0,
      });
      this.scene.add(sprite);
      this.sprites.push(sprite);
    }

    /* Edge connections: each node → 4 nearest neighbours + center.
       Computed once at init; positions update each frame. */
    this.edges = [];
    const succPos = this.spriteState[SUCCESS_IDX].basePos;
    for (let i = 0; i < NODE_COUNT - 1; i++) {
      const dists = [];
      for (let j = 0; j < NODE_COUNT - 1; j++) {
        if (i === j) continue;
        const d = this.spriteState[i].basePos.distanceToSquared(this.spriteState[j].basePos);
        dists.push({ j, d });
      }
      dists.sort((a, b) => a.d - b.d);
      for (let k = 0; k < 4; k++) {
        const j = dists[k].j;
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!this.edges.find((e) => e.key === key)) {
          this.edges.push({ key, a: i, b: j, type: 'neighbor' });
        }
      }
      /* link to success center */
      this.edges.push({ key: `${i}-S`, a: i, b: SUCCESS_IDX, type: 'center' });
    }

    /* Build line geometry — every edge as 2 verts, vertex color drives appearance */
    const positions = new Float32Array(this.edges.length * 2 * 3);
    const colors    = new Float32Array(this.edges.length * 2 * 3);
    const lineGeo   = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    lineGeo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.0,
    });
    this.lines = new THREE.LineSegments(lineGeo, lineMat);
    this.lines.frustumCulled = false;
    this.lineGeo = lineGeo;
    this.lineMat = lineMat;
    this.scene.add(this.lines);

    /* Central glow halo */
    const glowGeo = new THREE.PlaneGeometry(2.6, 1.0);
    const glowMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
      `,
      fragmentShader: `
        precision highp float; varying vec2 vUv;
        uniform float uTime; uniform float uIntensity;
        void main(){
          vec2 p=vUv-0.5; float d=length(p);
          float pulse=0.5+0.5*sin(uTime*2.2);
          float falloff=exp(-d*d*14.0);
          vec3 c=vec3(0.78,0.96,0.26)*falloff*(0.5+0.5*pulse);
          gl_FragColor=vec4(c,falloff*uIntensity*0.85);
        }
      `,
    });
    this.glow = new THREE.Mesh(glowGeo, glowMat);
    this.glow.position.z = -0.1;
    this.scene.add(this.glow);

    this.raycaster = new THREE.Raycaster();
    this.setupScrollTimeline();
  }

  setupScrollTimeline() {
    const beats = this.container.querySelectorAll('.ch-beat, .ch-beat-block');
    this.beatTriggers = [];
    const onEnterMap = [
      () => { gsap.to(this, { revealT: 1.0, duration: 1.4, ease: 'power2.out' });
              gsap.to(this.lineMat, { opacity: 0.18, duration: 1.2, delay: 0.4 }); },
      () => { gsap.to(this, { inferenceT: 0.4, duration: 1.6, ease: 'power2.inOut' }); },
      () => { gsap.to(this, { inferenceT: 0.75, duration: 1.8, ease: 'power2.inOut' });
              gsap.to(this.lineMat, { opacity: 0.45, duration: 1.4 }); },
      () => { gsap.to(this, { inferenceT: 0.95, duration: 1.4, ease: 'power2.inOut' }); },
      () => { gsap.to(this, { inferenceT: 1.0, successPulse: 1.0, duration: 1.6, ease: 'power3.out' });
              gsap.to(this.lineMat, { opacity: 0.75, duration: 1.0 }); },
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

  addEventListeners() {
    this._onMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      /* Project ray onto the z=0 plane */
      this.raycaster.setFromCamera(ndc, this.camera);
      const t = -this.raycaster.ray.origin.z / this.raycaster.ray.direction.z;
      this.mouseWorld.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, t);
    };
    window.addEventListener('mousemove', this._onMove, { passive: true });
    this._onLeave = () => { this.mouseWorld.set(9999, 9999, 0); };
    this.canvas.addEventListener('mouseleave', this._onLeave);
  }

  removeEventListeners() {
    if (this._onMove) window.removeEventListener('mousemove', this._onMove);
    if (this._onLeave) this.canvas.removeEventListener('mouseleave', this._onLeave);
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
    this.hoverHueT += delta * 0.6;

    /* Update sprites */
    const tmp = new THREE.Vector3();
    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i];
      const st = this.spriteState[i];

      /* Reveal opacity */
      const revealLocal = THREE.MathUtils.clamp((this.revealT - st.revealAt) / 0.4, 0, 1);
      const baseOp = st.meta.isSuccess
        ? this.successPulse
        : st.meta.isNamed ? 0.92 : 0.55;
      s.material.opacity = revealLocal * baseOp * (st.meta.isSuccess ? 1 : (st.isHigh ? 1.0 : 0.75));

      /* Target position: high-signal pulls inward, low-signal drifts outward */
      if (!st.meta.isSuccess) {
        const inwardPull = st.isHigh ? this.inferenceT * 0.78 : -this.inferenceT * 0.15;
        const targetR = (1 - inwardPull);
        st.currentTarget.copy(st.basePos).multiplyScalar(targetR);
      }

      /* Mouse repulsion — inverse square, with rainbow ripple flag */
      const dx = s.position.x - this.mouseWorld.x;
      const dy = s.position.y - this.mouseWorld.y;
      const dz = s.position.z - this.mouseWorld.z;
      const dist2 = dx*dx + dy*dy + dz*dz;
      if (dist2 < 1.4 && !st.meta.isSuccess) {
        const dist = Math.sqrt(dist2);
        const force = (1.0 - dist / 1.18) * 1.2;
        st.scatterVel.x += (dx / (dist + 0.01)) * force * delta * 6;
        st.scatterVel.y += (dy / (dist + 0.01)) * force * delta * 6;
        st.scatterVel.z += (dz / (dist + 0.01)) * force * delta * 6;
        st.rippleT = 1.0;
      }
      /* damping back to target */
      st.scatterVel.multiplyScalar(0.86);

      /* Wobble */
      st.wobble += delta * 0.6;
      const wobX = Math.sin(st.wobble + i * 0.7) * 0.035;
      const wobY = Math.cos(st.wobble * 0.8 + i * 0.5) * 0.035;
      const wobZ = Math.sin(st.wobble * 0.6 + i * 0.3) * 0.035;
      tmp.copy(st.currentTarget)
         .add(new THREE.Vector3(wobX, wobY, wobZ))
         .add(st.scatterVel);
      s.position.lerp(tmp, 0.10);

      /* Ripple decay → tints the sprite */
      if (st.rippleT > 0.01) {
        st.rippleT -= delta * 1.4;
        if (!st.meta.isSuccess) {
          const hue = (this.hoverHueT + i * 0.05) % 1;
          const c = hsl(hue, 1.0, 0.6);
          s.material.color.lerp(c, 0.4);
        }
      } else {
        s.material.color.lerp(new THREE.Color(1, 1, 1), 0.08);
      }
    }

    /* Update edge geometry */
    const posArr = this.lineGeo.attributes.position.array;
    const colArr = this.lineGeo.attributes.color.array;
    for (let e = 0; e < this.edges.length; e++) {
      const edge = this.edges[e];
      const sa = this.sprites[edge.a].position;
      const sb = this.sprites[edge.b].position;
      const base = e * 6;
      posArr[base + 0] = sa.x; posArr[base + 1] = sa.y; posArr[base + 2] = sa.z;
      posArr[base + 3] = sb.x; posArr[base + 4] = sb.y; posArr[base + 5] = sb.z;

      /* color: center edges are limey, neighbour edges are cream;
         if either endpoint has an active ripple, tint that vertex */
      let aColR = edge.type === 'center' ? 0.78 : 0.94;
      let aColG = edge.type === 'center' ? 0.96 : 0.93;
      let aColB = edge.type === 'center' ? 0.26 : 0.89;
      let bColR = aColR, bColG = aColG, bColB = aColB;

      const stA = this.spriteState[edge.a];
      const stB = this.spriteState[edge.b];
      if (stA.rippleT > 0.01) {
        const hue = (this.hoverHueT + edge.a * 0.05) % 1;
        const c = hsl(hue, 1.0, 0.6);
        aColR = c.r; aColG = c.g; aColB = c.b;
      }
      if (stB.rippleT > 0.01) {
        const hue = (this.hoverHueT + edge.b * 0.05) % 1;
        const c = hsl(hue, 1.0, 0.6);
        bColR = c.r; bColG = c.g; bColB = c.b;
      }
      colArr[base + 0] = aColR; colArr[base + 1] = aColG; colArr[base + 2] = aColB;
      colArr[base + 3] = bColR; colArr[base + 4] = bColG; colArr[base + 5] = bColB;
    }
    this.lineGeo.attributes.position.needsUpdate = true;
    this.lineGeo.attributes.color.needsUpdate = true;

    /* Success sprite pulse */
    const succ = this.sprites[SUCCESS_IDX];
    if (succ) {
      const baseW = 0.42 * (640 / 96);
      const pulse = 1 + Math.sin(time * 2.8) * 0.05 * this.successPulse;
      succ.scale.set(baseW * pulse, 0.42 * pulse, 1);
    }
    if (this.glow) {
      this.glow.material.uniforms.uTime.value = time;
      this.glow.material.uniforms.uIntensity.value = this.successPulse;
    }

    /* Camera slow drift */
    this.camera.position.x = Math.sin(this.idleT * 0.2) * 0.18;
    this.camera.position.y = Math.cos(this.idleT * 0.25) * 0.12;
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    super.destroy();
    if (this.beatTriggers) { this.beatTriggers.forEach((st) => st.kill()); this.beatTriggers = null; }
    if (this.sprites) {
      this.sprites.forEach((s) => {
        if (s.material.map) s.material.map.dispose();
        s.material.dispose();
      });
      this.sprites = null;
    }
    if (this.glow) { this.glow.geometry.dispose(); this.glow.material.dispose(); }
    if (this.lineGeo) this.lineGeo.dispose();
    if (this.lineMat) this.lineMat.dispose();
    if (this.renderer) this.renderer.dispose();
    this.renderer = this.scene = this.camera = null;
  }
}
