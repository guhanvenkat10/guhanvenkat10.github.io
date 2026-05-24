import * as THREE from 'three';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VisualChapter } from './base.js';

/* =============================================================
 *  Ch03 — Neural Attention Dashboard
 *  An anatomically-grounded brain built as a UNION of separate lobe
 *  ellipsoids (frontal · parietal · temporal × 2 · occipital · cerebellum
 *  · brainstem), unified by per-vertex sulci displacement. Each vertex
 *  carries a `lobeIndex` attribute so the fragment shader can light up a
 *  specific lobe on scroll without affecting the others.
 *
 *  Always-on rainbow rim slowly cycles spectrum colors that match the
 *  global river — visually ties the brain to the rest of the page.
 *  Cursor raycast paints a localized wave on whichever lobe is under
 *  the cursor.
 * ============================================================= */

/* ----- Anatomical layout — local-space lobe definitions ----- */
const LOBES = [
  /* name, position, scale(rx,ry,rz), rot(x,y,z), lobeIndex 0..6 */
  { name: 'frontalL',    p:[-0.30,  0.10,  0.55], s:[0.55, 0.55, 0.55], r:[0, 0, 0],         i:0 },
  { name: 'frontalR',    p:[ 0.30,  0.10,  0.55], s:[0.55, 0.55, 0.55], r:[0, 0, 0],         i:0 },
  { name: 'parietalL',   p:[-0.32,  0.32, -0.10], s:[0.48, 0.45, 0.55], r:[0, 0, 0],         i:1 },
  { name: 'parietalR',   p:[ 0.32,  0.32, -0.10], s:[0.48, 0.45, 0.55], r:[0, 0, 0],         i:1 },
  { name: 'temporalL',   p:[-0.62, -0.12,  0.10], s:[0.34, 0.30, 0.50], r:[0, 0, 0.18],      i:2 },
  { name: 'temporalR',   p:[ 0.62, -0.12,  0.10], s:[0.34, 0.30, 0.50], r:[0, 0,-0.18],      i:2 },
  { name: 'occipitalL',  p:[-0.22,  0.08, -0.55], s:[0.42, 0.40, 0.42], r:[0, 0, 0],         i:3 },
  { name: 'occipitalR',  p:[ 0.22,  0.08, -0.55], s:[0.42, 0.40, 0.42], r:[0, 0, 0],         i:3 },
  { name: 'cerebellumL', p:[-0.18, -0.35, -0.45], s:[0.32, 0.28, 0.30], r:[0, 0, 0],         i:4 },
  { name: 'cerebellumR', p:[ 0.18, -0.35, -0.45], s:[0.32, 0.28, 0.30], r:[0, 0, 0],         i:4 },
  { name: 'brainstem',   p:[ 0.00, -0.55, -0.20], s:[0.12, 0.30, 0.12], r:[0.35, 0, 0],      i:5 },
];

const VERT = /* glsl */`
  attribute float aLobeIndex;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vLobe;
  void main() {
    vPos = position;
    vLobe = aLobeIndex;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vLobe;

  uniform float uTime;
  uniform vec3  uHitPoint;
  uniform float uHitStrength;
  uniform float uLobePulse[6];   /* per-lobe activation 0..1 (frontal,parietal,temporal,occipital,cerebellum,stem) */
  uniform float uFullWave;       /* climax all-lobe shimmer */
  uniform float uRiverHue;       /* synced with river spectrum cycle */

  /* tiny value noise for sulci */
  float hash13(vec3 p){return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);}
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash13(i + vec3(0,0,0));
    float n100 = hash13(i + vec3(1,0,0));
    float n010 = hash13(i + vec3(0,1,0));
    float n110 = hash13(i + vec3(1,1,0));
    float n001 = hash13(i + vec3(0,0,1));
    float n101 = hash13(i + vec3(1,0,1));
    float n011 = hash13(i + vec3(0,1,1));
    float n111 = hash13(i + vec3(1,1,1));
    float x00 = mix(n000, n100, u.x);
    float x10 = mix(n010, n110, u.x);
    float x01 = mix(n001, n101, u.x);
    float x11 = mix(n011, n111, u.x);
    return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
  }

  vec3 hsl2rgb(vec3 c){
    vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
    return c.z + c.y * (rgb-0.5) * (1.0 - abs(2.0*c.z-1.0));
  }

  /* Per-lobe accent color */
  vec3 lobeColor(int idx){
    if (idx == 0) return vec3(1.0, 0.86, 0.30);     // frontal — yellow
    if (idx == 1) return vec3(0.95, 0.30, 0.85);    // parietal — magenta
    if (idx == 2) return vec3(0.95, 0.55, 0.20);    // temporal — orange
    if (idx == 3) return vec3(0.25, 0.85, 0.95);    // occipital — cyan
    if (idx == 4) return vec3(0.60, 1.00, 0.50);    // cerebellum — green
    return vec3(0.85, 0.65, 1.00);                  // brainstem — violet
  }

  float lobePulse(int idx){
    if (idx == 0) return uLobePulse[0];
    if (idx == 1) return uLobePulse[1];
    if (idx == 2) return uLobePulse[2];
    if (idx == 3) return uLobePulse[3];
    if (idx == 4) return uLobePulse[4];
    return uLobePulse[5];
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vViewDir);
    int idx = int(vLobe + 0.5);

    /* Base grey cortex */
    vec3 base = vec3(0.20, 0.20, 0.22);

    /* Hemisphere fissure (midline groove) */
    float fissure = 1.0 - smoothstep(0.0, 0.10, abs(vPos.x));
    base *= (1.0 - 0.5 * fissure);

    /* Sulci shading — soft inward grooves */
    float sulci = vnoise(vPos * 9.0);
    base -= vec3(0.05, 0.05, 0.06) * sulci;

    /* Lambertian */
    vec3 lightDir = normalize(vec3(0.6, 0.8, 1.0));
    float lambert = max(dot(n, lightDir), 0.0);
    vec3 col = base * (0.55 + 0.85 * lambert);

    /* RIVER-SYNCED rainbow rim — always on, gives the brain a sense of
       belonging to the same world as the global river. */
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.4);
    vec3 spectrum = hsl2rgb(vec3(fract(uRiverHue + 0.5 * vPos.y), 0.9, 0.55));
    col += spectrum * rim * 0.55;

    /* Cursor radial wave */
    float d = length(vPos - uHitPoint);
    float wave = sin(d * 11.0 - uTime * 4.5) * exp(-d * 2.8);
    col += wave * uHitStrength * 0.4 * spectrum;

    /* Lobe-specific glow (driven by scroll beats) */
    vec3 lc = lobeColor(idx);
    float pulse = lobePulse(idx);
    /* gentle internal sparkle so the lobe isn't a flat tint */
    float sparkle = 0.5 + 0.5 * sin(uTime * 3.0 + vPos.x * 11.0 + vPos.y * 9.0);
    col += lc * pulse * (0.6 + 0.4 * sparkle) * 0.85;

    /* Full-mesh climax wave */
    float allWave = 0.5 + 0.5 * sin(length(vPos) * 5.5 - uTime * 4.0);
    col += allWave * uFullWave * 0.5 * spectrum;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* CPU-side value noise for one-time vertex displacement (sulci bumps). */
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const lerp = (a, b, t) => a + (b - a) * t;
  const n000 = hash3(xi,     yi,     zi);
  const n100 = hash3(xi + 1, yi,     zi);
  const n010 = hash3(xi,     yi + 1, zi);
  const n110 = hash3(xi + 1, yi + 1, zi);
  const n001 = hash3(xi,     yi,     zi + 1);
  const n101 = hash3(xi + 1, yi,     zi + 1);
  const n011 = hash3(xi,     yi + 1, zi + 1);
  const n111 = hash3(xi + 1, yi + 1, zi + 1);
  const x00 = lerp(n000, n100, u);
  const x10 = lerp(n010, n110, u);
  const x01 = lerp(n001, n101, u);
  const x11 = lerp(n011, n111, u);
  const y0 = lerp(x00, x10, v);
  const y1 = lerp(x01, x11, v);
  return lerp(y0, y1, w);
}
function fbm(x, y, z) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let o = 0; o < 3; o++) {
    sum += amp * (valueNoise(x * freq, y * freq, z * freq) * 2 - 1);
    amp *= 0.5;
    freq *= 2.0;
  }
  return sum;
}

export class AttentionChapter extends VisualChapter {
  constructor(canvas, container) {
    super(canvas, container);
    this.hitPoint = new THREE.Vector3(99, 99, 99);
    this.hitTarget = new THREE.Vector3(99, 99, 99);
    this.hitStrength = 0;
    this.hitStrengthTarget = 0;
    this.idleRotY = 0;
    this.targetRotY = 0;
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
    /* Wider FOV + further camera so brain never clips at 50vw aspect */
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 0, 3.4);

    /* Build each lobe as a SphereGeometry, scale + rotate + translate it,
       then merge into one geometry with a per-vertex aLobeIndex attribute. */
    const SEG_W = 48, SEG_H = 32;
    const geos = [];
    for (const lobe of LOBES) {
      const g = new THREE.SphereGeometry(0.78, SEG_W, SEG_H);
      g.scale(lobe.s[0], lobe.s[1], lobe.s[2]);
      const m = new THREE.Matrix4();
      m.makeRotationFromEuler(new THREE.Euler(lobe.r[0], lobe.r[1], lobe.r[2]));
      g.applyMatrix4(m);
      g.translate(lobe.p[0], lobe.p[1], lobe.p[2]);
      const count = g.attributes.position.count;
      const idxArr = new Float32Array(count);
      for (let i = 0; i < count; i++) idxArr[i] = lobe.i;
      g.setAttribute('aLobeIndex', new THREE.BufferAttribute(idxArr, 1));
      geos.push(g);
    }
    this.geometry = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());

    /* Sulci displacement on the merged geometry */
    {
      const pos = this.geometry.attributes.position;
      const arr = pos.array;
      const count = pos.count;
      const tmp = new THREE.Vector3();
      const tmpN = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        tmp.set(arr[i * 3 + 0], arr[i * 3 + 1], arr[i * 3 + 2]);
        tmpN.copy(tmp).normalize();
        const outward = fbm(tmpN.x * 3.0, tmpN.y * 3.0, tmpN.z * 3.0) * 0.035;
        const sulci   = (fbm(tmpN.x * 7.0, tmpN.y * 7.0, tmpN.z * 7.0)
                       - 0.30 * fbm(tmpN.x * 14.0, tmpN.y * 14.0, tmpN.z * 14.0)) * 0.025;
        const disp = outward - sulci;
        tmp.addScaledVector(tmpN, disp);
        arr[i * 3 + 0] = tmp.x;
        arr[i * 3 + 1] = tmp.y;
        arr[i * 3 + 2] = tmp.z;
      }
      pos.needsUpdate = true;
      this.geometry.computeVertexNormals();
    }

    this.uniforms = {
      uTime:        { value: 0 },
      uHitPoint:    { value: this.hitPoint },
      uHitStrength: { value: 0 },
      uLobePulse:   { value: [0, 0, 0, 0, 0, 0] },
      uFullWave:    { value: 0 },
      uRiverHue:    { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.rotation.y = 0.55;
    this.scene.add(this.mesh);

    this.raycaster = new THREE.Raycaster();
    this.setupScrollTimeline();
  }

  setupScrollTimeline() {
    const beats = this.container.querySelectorAll('.ch-beat');
    const u = this.uniforms;
    this.beatTriggers = [];

    const onEnterMap = [
      /* 0 — "Short-form video in." */
      () => {},
      /* 1 — V-JEPA2 → occipital (idx 3) */
      () => gsap.to(u.uLobePulse.value, { 3: 1.0, duration: 0.7, ease: 'power2.out' }),
      /* 2 — TRIBE v2 → parietal + temporal flare */
      () => {
        gsap.to(u.uLobePulse.value, { 1: 0.9, 2: 0.9, duration: 0.6 });
        gsap.to(u.uLobePulse.value, { 3: 0.5, duration: 0.6 });
      },
      /* 3 — five ROIs cascade */
      () => {
        gsap.to(u.uLobePulse.value, { 0: 1.0, duration: 0.25 });
        gsap.to(u.uLobePulse.value, { 1: 1.0, duration: 0.25, delay: 0.15 });
        gsap.to(u.uLobePulse.value, { 2: 1.0, duration: 0.25, delay: 0.30 });
        gsap.to(u.uLobePulse.value, { 3: 1.0, duration: 0.25, delay: 0.45 });
        gsap.to(u.uLobePulse.value, { 4: 1.0, duration: 0.25, delay: 0.60 });
      },
      /* 4 — heatmap full */
      () => gsap.to(u.uLobePulse.value, { 5: 0.7, duration: 0.8 }),
      /* 5 — climax */
      () => {
        gsap.to(this, { targetRotY: 0, duration: 1.0 });
        gsap.to(u.uFullWave, { value: 1, duration: 0.9 });
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

  addEventListeners() {
    this._onMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width === 0) return;
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(ndc, this.camera);
      const hits = this.raycaster.intersectObject(this.mesh, false);
      if (hits.length > 0) {
        const local = hits[0].point.clone();
        this.mesh.worldToLocal(local);
        this.hitTarget.copy(local);
        this.hitStrengthTarget = 1.0;
      } else {
        this.hitStrengthTarget = 0;
      }
    };
    window.addEventListener('mousemove', this._onMove, { passive: true });
  }

  removeEventListeners() {
    if (this._onMove) window.removeEventListener('mousemove', this._onMove);
  }

  resize() {
    if (!this.renderer) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  tick(time, delta) {
    if (!this.isActive) return;
    this.uniforms.uTime.value = time;
    /* Spectrum hue cycles in sync with the river's flow speed */
    this.uniforms.uRiverHue.value = (time * 0.04) % 1.0;
    this.hitPoint.lerp(this.hitTarget, 0.18);
    this.hitStrength += (this.hitStrengthTarget - this.hitStrength) * 0.15;
    this.uniforms.uHitStrength.value = this.hitStrength;

    if (this.uniforms.uFullWave.value < 0.05) {
      this.idleRotY += delta * 0.22;
      this.mesh.rotation.y = 0.55 + Math.sin(this.idleRotY) * 0.55;
      this.mesh.rotation.x = Math.sin(this.idleRotY * 0.7) * 0.15;
    } else {
      this.mesh.rotation.y += (this.targetRotY - this.mesh.rotation.y) * 0.06;
      this.mesh.rotation.x += (0 - this.mesh.rotation.x) * 0.06;
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    super.destroy();
    if (this.beatTriggers) { this.beatTriggers.forEach((st) => st.kill()); this.beatTriggers = null; }
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.renderer) this.renderer.dispose();
    this.geometry = this.material = this.mesh = null;
    this.renderer = this.scene = this.camera = null;
  }
}
