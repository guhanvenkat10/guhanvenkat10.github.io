import * as THREE from 'three';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VisualChapter } from './base.js';

const VERT = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vPos = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  uniform float uTime;
  uniform vec3  uHitPoint;     // local-space mouse intersection
  uniform float uHitStrength;
  uniform vec3  uROIPos[5];
  uniform vec3  uROIColor[5];
  uniform float uROIRadius[5];
  uniform float uROIPulse[5];
  uniform float uFullWave;     // climax

  /* Tiny GLSL value noise for fragment-side sulci shading. */
  float hash13(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
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

  /* HSL -> RGB helper. */
  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vViewDir);

    // ---- Time-shifting rainbow gradient: hue varies with position + uTime ----
    float hue = fract(0.50 + 0.30 * vPos.x + 0.20 * vPos.y + uTime * 0.06);
    vec3 rainbow = hsl2rgb(vec3(hue, 0.85, 0.55));

    // XYZ -> RGB blend for additional positional variation.
    rainbow = mix(rainbow, 0.5 + 0.5 * normalize(vPos), 0.30);

    // ---- Hemisphere fissure: dark valley along x = 0 ----
    float fissure = 1.0 - smoothstep(0.0, 0.10, abs(vPos.x));
    rainbow *= (1.0 - 0.75 * fissure);

    // ---- Sulci shading: high-frequency noise darkens grooves ----
    float sulci = vnoise(vPos * 10.0);
    rainbow -= sulci * 0.22;

    // ---- Lambertian shading layered on top of the rainbow ----
    vec3 lightDir = normalize(vec3(0.6, 0.8, 1.0));
    float lambert = max(dot(n, lightDir), 0.0);
    vec3 base = rainbow * (0.35 + 0.85 * lambert);

    // ---- Rim light along the silhouette edge ----
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.5);
    base += rim * 0.35 * vec3(1.0, 1.0, 1.0);

    // ---- Raycast hit wave: W = sin(d*12 - t*5) * exp(-d*2.5) ----
    float d = length(vPos - uHitPoint);
    float wave = sin(d * 12.0 - uTime * 5.0) * exp(-d * 2.5);
    vec3 hitColor = vec3(0.78, 0.96, 0.26);
    vec3 col = base + wave * uHitStrength * 0.55 * hitColor;

    // ---- ROI gaussian bloom — five regions ----
    for (int i = 0; i < 5; i++) {
      vec3 ro = uROIPos[i];
      float rr = uROIRadius[i];
      float dist = length(vPos - ro);
      float g = exp(-(dist * dist) / (2.0 * rr * rr));
      col += uROIColor[i] * g * uROIPulse[i] * 1.55;
    }

    // ---- Climax: full-mesh activation wave ----
    float allWave = 0.5 + 0.5 * sin(length(vPos) * 5.5 - uTime * 4.0);
    col += allWave * uFullWave * 0.42 * hitColor;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* --- Lightweight value noise (deterministic) for one-time vertex displacement. --- */
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 0, 4.2);

    // Dual-hemisphere brain: two SphereGeometry ellipsoids merged + per-vertex
    // sulci displacement. Renders as a solid mesh (not points, not wireframe).
    const SEG_W = 96, SEG_H = 64;
    const hemiL = new THREE.SphereGeometry(0.78, SEG_W, SEG_H);
    hemiL.scale(1.0, 0.92, 1.10);                   // ellipsoid: shorter top, longer front-back
    hemiL.translate(-0.32, 0, 0);
    const hemiR = new THREE.SphereGeometry(0.78, SEG_W, SEG_H);
    hemiR.scale(1.0, 0.92, 1.10);
    hemiR.translate( 0.32, 0, 0);
    this.geometry = mergeGeometries([hemiL, hemiR], false);
    hemiL.dispose();
    hemiR.dispose();

    // Per-vertex displacement: outward fBM + directional sulci grooves.
    {
      const pos = this.geometry.attributes.position;
      const arr = pos.array;
      const count = pos.count;
      const tmp = new THREE.Vector3();
      const tmpN = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        tmp.set(arr[i * 3 + 0], arr[i * 3 + 1], arr[i * 3 + 2]);
        tmpN.copy(tmp).normalize();
        // Outward fBM bulges.
        const outward = fbm(tmpN.x * 3.0, tmpN.y * 3.0, tmpN.z * 3.0) * 0.045;
        // Inward sulci grooves — directional high-frequency.
        const sulci = (fbm(tmpN.x * 7.0, tmpN.y * 7.0, tmpN.z * 7.0)
                      - 0.30 * fbm(tmpN.x * 14.0, tmpN.y * 14.0, tmpN.z * 14.0)) * 0.030;
        const disp = outward - sulci;
        tmp.addScaledVector(tmpN, disp);
        arr[i * 3 + 0] = tmp.x;
        arr[i * 3 + 1] = tmp.y;
        arr[i * 3 + 2] = tmp.z;
      }
      pos.needsUpdate = true;
      this.geometry.computeVertexNormals();
    }

    // ROIs on unit sphere (local space).
    const rois = [
      { pos: new THREE.Vector3( 0.00,  0.50,  0.85), color: new THREE.Color(0xffe066), r: 0.36 }, // frontal — yellow
      { pos: new THREE.Vector3( 0.00, -0.20, -0.95), color: new THREE.Color(0x3ad6ff), r: 0.32 }, // visual — cyan
      { pos: new THREE.Vector3( 0.00,  0.90,  0.00), color: new THREE.Color(0xff3a86), r: 0.30 }, // parietal — magenta
      { pos: new THREE.Vector3( 0.95,  0.00,  0.10), color: new THREE.Color(0xff9c47), r: 0.32 }, // temporal — orange
      { pos: new THREE.Vector3(-0.95,  0.00,  0.10), color: new THREE.Color(0x9aff8c), r: 0.30 }, // motor — green (5th ROI)
    ];

    this.uniforms = {
      uTime: { value: 0 },
      uHitPoint: { value: this.hitPoint },
      uHitStrength: { value: 0 },
      uROIPos:    { value: rois.map((r) => r.pos) },
      uROIColor:  { value: rois.map((r) => r.color) },
      uROIRadius: { value: rois.map((r) => r.r) },
      uROIPulse:  { value: [0, 0, 0, 0, 0] },
      uFullWave:  { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.rotation.y = 0.6;
    this.scene.add(this.mesh);

    this.raycaster = new THREE.Raycaster();

    this.setupScrollTimeline();
  }

  setupScrollTimeline() {
    const beats = this.container.querySelectorAll('.ch-beat');
    const u = this.uniforms;
    this.beatTriggers = [];

    // Each beat is its own ScrollTrigger — fades the text in and flips an
    // ROI uniform / climax state when it enters the viewport.
    const onEnterMap = [
      () => {},                                               // beat 0: intro
      () => gsap.to(u.uROIPulse.value, { 1: 1.0, duration: 0.6 }),  // V-JEPA2 occipital
      () => {                                                  // encoder unload — widespread
        gsap.to(u.uROIPulse.value, { 0: 0.55, 2: 0.55, 3: 0.55, 4: 0.55, duration: 0.4 });
        gsap.to(u.uROIPulse.value, { 0: 0.0, 2: 0.0, 3: 0.0, 4: 0.0, 1: 0.5, duration: 0.5, delay: 0.5 });
      },
      () => {},                                                // 20,484 vertices
      () => {                                                  // 5 ROIs in sequence
        gsap.to(u.uROIPulse.value, { 0: 1.0, duration: 0.25 });
        gsap.to(u.uROIPulse.value, { 1: 1.0, duration: 0.25, delay: 0.15 });
        gsap.to(u.uROIPulse.value, { 2: 1.0, duration: 0.25, delay: 0.30 });
        gsap.to(u.uROIPulse.value, { 3: 1.0, duration: 0.25, delay: 0.45 });
        gsap.to(u.uROIPulse.value, { 4: 1.0, duration: 0.25, delay: 0.60 });
      },
      () => {},                                                // live heatmap
      () => {                                                  // climax — full wave + face-on
        gsap.to(this, { targetRotY: 0, duration: 1.0 });
        gsap.to(u.uFullWave, { value: 1, duration: 0.9 });
      },
    ];

    beats.forEach((beat, idx) => {
      const st = ScrollTrigger.create({
        trigger: beat,
        start: 'top 75%',
        once: false,
        onEnter: () => {
          gsap.to(beat, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' });
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
        // Convert world hit to local space.
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

    this.uniforms.uTime.value = time;
    this.hitPoint.lerp(this.hitTarget, 0.18);
    this.hitStrength += (this.hitStrengthTarget - this.hitStrength) * 0.15;
    this.uniforms.uHitStrength.value = this.hitStrength;

    // Idle rotation, slowed and overridden as climax tweens targetRotY.
    if (this.uniforms.uFullWave.value < 0.05) {
      this.idleRotY += delta * 0.22;
      this.mesh.rotation.y = 0.6 + Math.sin(this.idleRotY) * 0.6;
      this.mesh.rotation.x = Math.sin(this.idleRotY * 0.7) * 0.18;
    } else {
      this.mesh.rotation.y += (this.targetRotY - this.mesh.rotation.y) * 0.06;
      this.mesh.rotation.x += (0 - this.mesh.rotation.x) * 0.06;
    }

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
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.renderer) this.renderer.dispose();
    this.geometry = this.material = this.mesh = null;
    this.renderer = this.scene = this.camera = null;
  }
}
