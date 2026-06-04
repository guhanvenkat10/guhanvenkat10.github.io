import * as THREE from 'three';
import gsap from 'gsap';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* =============================================================
 *  Rainbow River — SPINE EDITION
 *  -------------------------------------------------------------
 *  Redesigned from a full-bleed weaving ribbon into a single slim
 *  vertical "spine" that runs down the left lane of the page and
 *  ties the sections together. Calmer bloom, slimmer tube, gentle
 *  meander. The signature stays; the drama is dialed back so the
 *  content reads first.
 * ============================================================= */

const RADIAL_SEGMENTS = 16;
const TUBE_RADIUS     = 0.34;    /* slim — a thread, not a river */
const FLOW_SPEED      = 0.06;
const HUE_PER_UNIT    = 0.030;   /* hue gradient down the spine */
const PX_PER_WORLD    = 110;     /* scroll px → world units */

const SPINE_FRAC      = 0.085;   /* spine sits ~7.5% from the left edge */
const SPINE_AMP       = 0.62;    /* horizontal meander (world units) */
const SPINE_Z_AMP     = 0.45;    /* depth meander */
const TOP_OVERSHOOT   = 7;       /* world units of spine above the hero */
const BOTTOM_OVERSHOOT= 5;       /* and below the footer */

/* ----- Shaders (unchanged spectrum tube — reads as a rounded cylinder) ----- */
const RIVER_VERT = /* glsl */`
  varying vec3 vLocalPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  uniform float uTime;
  uniform vec2  uMouse;

  vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vLocalPos = position;
    /* very gentle noise — keep the tube shape clean */
    float n  = snoise(vec3(position.xy * 0.4, uTime * 0.25 + position.y * 0.4));
    float disp = n * 0.035;
    vec3 displaced = position + normal * disp;

    /* Subtle mouse repulsion */
    vec3 mouseWorld = vec3(uMouse.x * 5.0, uMouse.y * 3.5, 0.0);
    float md = distance(displaced.xy, mouseWorld.xy);
    float repulse = 0.22 / (md * md + 1.0);
    vec3 dir = normalize(vec3(displaced.xy - mouseWorld.xy, 0.0001));
    displaced += dir * repulse * 0.18;

    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const RIVER_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vLocalPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uHuePerUnit;

  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }

  void main() {
    float hue = fract(-vLocalPos.y * uHuePerUnit - uTime * uFlowSpeed);
    vec3 spectrum = hsl2rgb(vec3(hue, 0.92, 0.52));

    float ndv = max(0.0, dot(vNormal, vViewDir));
    float shading = pow(ndv, 0.85);
    vec3 col = spectrum * (0.28 + 0.72 * shading);

    float rim = pow(1.0 - ndv, 3.0);
    col += spectrum * rim * 0.30;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const V3 = (x, y, z = 0) => new THREE.Vector3(x, y, z);

export class GlobalRiver {
  constructor(canvas) {
    this.canvas = canvas;
    this.scrollY = 0;
    this.mouse = new THREE.Vector2(0, 0);
    this.mouseTarget = new THREE.Vector2(0, 0);
    this.supernovaActive = false;
    this.sceneScrollK = 1 / PX_PER_WORLD;
    this.curves = [];
    this.tubes = [];
    this.tubeGeoms = [];
  }

  init() {
    if (!this.canvas) return;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      55, window.innerWidth / window.innerHeight, 0.1, 400,
    );
    this.camera.position.set(0, 0, 8);

    this.uniforms = {
      uTime:       { value: 0 },
      uFlowSpeed:  { value: FLOW_SPEED },
      uHuePerUnit: { value: HUE_PER_UNIT },
      uMouse:      { value: this.mouse },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: RIVER_VERT,
      fragmentShader: RIVER_FRAG,
      uniforms: this.uniforms,
      transparent: false,
      depthWrite: true,
      side: THREE.DoubleSide,
    });

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.rebuildAll();
    requestAnimationFrame(() => this.rebuildAll());

    /* Debounced rebuild on layout shifts (font load, resize). */
    let rebuildTimer = null;
    this.resizeObserver = new ResizeObserver(() => {
      if (rebuildTimer) clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(() => this.rebuildAll(), 300);
    });
    this.resizeObserver.observe(document.body);

    /* Composer — soft bloom so the spine glows gently without washing
       out nearby text. HDR target so the spectrum + bloom compose
       cleanly under ACES tone mapping. */
    const hdrTarget = new THREE.WebGLRenderTarget(
      window.innerWidth, window.innerHeight,
      { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace, samples: 2 },
    );
    this.composer = new EffectComposer(this.renderer, hdrTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.55,   /* strength — bold, alive */
      0.6,    /* radius */
      0.5,    /* threshold */
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  /* World-space X for a given fraction of the viewport width, at the
     tube's depth plane (z≈0). Keeps the spine pinned to the same screen
     lane regardless of window size. */
  worldXAtFraction(frac) {
    const vFOV = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = this.camera.position.z;
    const worldH = 2 * Math.tan(vFOV / 2) * dist;
    const pxPerWorld = window.innerHeight / worldH;
    return (frac - 0.5) * window.innerWidth / pxPerWorld;
  }

  rebuildAll() {
    if (!this.camera) return;
    this.rebuildCurves();
    this.rebuildTubes();
  }

  rebuildCurves() {
    this.curves = [];
    const sections = Array.from(document.querySelectorAll('main > *'));
    if (sections.length === 0) return;

    const last = sections[sections.length - 1];
    const topY = TOP_OVERSHOOT;
    const bottomY = -(last.offsetTop + last.offsetHeight) / PX_PER_WORLD - BOTTOM_OVERSHOOT;

    const spineX = this.worldXAtFraction(SPINE_FRAC);

    /* Build a gently meandering vertical spine from above the hero to
       below the footer. One point every ~2.6 world units. */
    const span = topY - bottomY;
    const step = 2.6;
    const n = Math.max(6, Math.ceil(span / step));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const y = topY - (span * i) / n;
      const x = spineX + SPINE_AMP * Math.sin(y * 0.16 + 0.6) + SPINE_AMP * 0.4 * Math.sin(y * 0.41);
      const z = SPINE_Z_AMP * Math.sin(y * 0.23 + 1.2);
      pts.push(V3(x, y, z));
    }

    if (pts.length >= 4) {
      this.curves.push(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5));
    }
    this._lastSpan = span;
  }

  rebuildTubes() {
    for (const t of this.tubes) this.group.remove(t);
    for (const g of this.tubeGeoms) g.dispose();
    this.tubes = [];
    this.tubeGeoms = [];
    if (!this.material) return;
    for (const curve of this.curves) {
      const segs = Math.min(1400, Math.max(240, Math.floor((this._lastSpan || 40) * 9)));
      const geom = new THREE.TubeGeometry(curve, segs, TUBE_RADIUS, RADIAL_SEGMENTS, false);
      const mesh = new THREE.Mesh(geom, this.material);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.tubes.push(mesh);
      this.tubeGeoms.push(geom);
    }
  }

  onScroll(scrollY) {
    this.scrollY = scrollY;
  }

  onMouseMove(clientX, clientY) {
    this.mouseTarget.set(
      (clientX / window.innerWidth) * 2 - 1,
      -((clientY / window.innerHeight) * 2 - 1),
    );
  }

  /* Kept for API symmetry; the contact section can pulse the spine. */
  triggerSupernova() {
    if (this.supernovaActive) return;
    this.supernovaActive = true;
    gsap.to(this.bloomPass, { strength: 0.30, radius: 0.4, duration: 1.4, ease: 'power2.out' });
    gsap.to(this.uniforms.uFlowSpeed, { value: FLOW_SPEED * 2.4, duration: 1.4, ease: 'power2.out' });
  }

  tick(time) {
    if (!this.composer) return;
    this.uniforms.uTime.value = time;
    if (!this.supernovaActive) this.uniforms.uFlowSpeed.value = FLOW_SPEED;
    this.mouse.x += (this.mouseTarget.x - this.mouse.x) * 0.06;
    this.mouse.y += (this.mouseTarget.y - this.mouse.y) * 0.06;
    this.group.position.y = this.scrollY * this.sceneScrollK;
    this.composer.render();
  }

  resize(w, h) {
    if (!this.renderer) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
  }
}
