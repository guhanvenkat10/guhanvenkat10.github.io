import * as THREE from 'three';
import gsap from 'gsap';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* =============================================================
 *  Global Rainbow River — Single Strip
 *  ---------------------------------------------------------------
 *  One rainbow ribbon with a deliberate journey:
 *
 *  TUBE A  (top of page through Ch03 brain):
 *    1. Enters from above the page (off-screen top).
 *    2. Sweeps to the RIGHT edge during the Hero section.
 *    3. Returns to the horizontal center.
 *    4. Goes straight down through the About section.
 *    5. Wraps around the brain canvas (counter-clockwise from the left).
 *    6. Exits through the RIGHT edge of the page.
 *
 *  TUBE B  (re-enters left, exits at contact):
 *    7. Re-enters from the LEFT edge, between Ch03 and Ch04.
 *    8. Returns to center.
 *    9. Continues straight down through Ch04–Ch06 with a subtle weave.
 *   10. Exits through the BOTTOM of the page at the Contact chapter.
 *
 *  Two tubes share one ShaderMaterial. Hue derived from local y so the
 *  rainbow palette stays continuous between segments and across the gap.
 *  Pipeline (locked order): RenderPass -> UnrealBloomPass -> OutputPass.
 * ============================================================= */

const TUBULAR_SEGMENTS  = 380;
const RADIAL_SEGMENTS   = 24;
const TUBE_RADIUS       = 0.55;   // a little thicker than before
const FLOW_SPEED        = 0.04;
const HUE_PER_UNIT      = 0.05;
const SCROLL_FACTOR     = 0.00020;
const PX_PER_WORLD      = 110;
const SUPERNOVA_BLOOM   = 1.6;
const OFF_SCREEN_X      = 11;     // x value definitively outside camera frustum

/* ---------- Shaders ---------- */
const RIVER_VERT = /* glsl */ `
  varying vec3 vLocalPos;
  void main() {
    vLocalPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RIVER_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vLocalPos;

  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uHuePerUnit;

  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }

  void main() {
    float hue = fract(-vLocalPos.y * uHuePerUnit - uTime * uFlowSpeed);
    vec3 c = hsl2rgb(vec3(hue, 1.0, 0.55));
    gl_FragColor = vec4(c, 1.0);
  }
`;

const V3 = (x, y, z = 0) => new THREE.Vector3(x, y, z);

/* Build the two tube control-point arrays from the live section Y positions. */
function buildTubePaths(sectionYs, docBottomY) {
  // Map: index 0..6 → Ch01..Ch07
  const heroY    = sectionYs[0] ?? 0;
  const aboutY   = sectionYs[1] ?? (heroY - 9);
  const brainY   = sectionYs[2] ?? (aboutY - 9);
  const ch04Y    = sectionYs[3] ?? (brainY - 9);
  const ch05Y    = sectionYs[4] ?? (ch04Y - 9);
  const ch06Y    = sectionYs[5] ?? (ch05Y - 9);
  const contactY = sectionYs[6] ?? (ch06Y - 9);
  const docEnd   = docBottomY ?? (contactY - 6);

  // ---- TUBE A: top → hero sweep → straight down → wrap brain → exit right ----
  const tubeA = [
    // (1) Enters from above the page
    V3( 0, heroY + 7, 0),
    V3( 0, heroY + 5, 0.1),
    // (2) Sweeps to the right edge during the Hero section
    V3( 4, heroY + 4, 0.3),
    V3( 8, heroY + 2.5, 0.5),
    V3( OFF_SCREEN_X - 1, heroY + 0.8, 0.3),
    // (3) Returns to the horizontal center
    V3( 6, heroY - 0.8, 0),
    V3( 2, heroY - 2.0, -0.2),
    V3( 0, heroY - 3.2, 0),
    // (4) Straight down through the About section
    V3( 0, (heroY + aboutY) * 0.5, 0),
    V3( 0, aboutY, 0),
    V3( 0, aboutY - 3, 0),
    V3( 0, brainY + 3.5, 0),
    // Approach brain from above-center
    V3( 0, brainY + 1.8, 0),
    // (5) WRAP brain — counter-clockwise from the left
    V3(-2.0, brainY + 0.6, 0.4),
    V3(-3.2, brainY - 0.6, 0.6),
    V3(-2.6, brainY - 1.9, 0.4),
    V3(-0.5, brainY - 2.9, 0),
    V3( 2.0, brainY - 2.8, -0.3),
    V3( 4.0, brainY - 2.0, -0.5),
    V3( 5.5, brainY - 1.0, -0.3),
    // (6) Exits through the right edge of the page
    V3( 8.0, brainY - 0.2, 0),
    V3( OFF_SCREEN_X, brainY + 0.3, 0),
  ];

  // ---- TUBE B: re-enter left → center → down through Ch04-06 → exit bottom ----
  const gapMid = (brainY + ch04Y) * 0.5;
  const tubeB = [
    // (7) Re-enters from the left edge between Ch03 and Ch04
    V3(-OFF_SCREEN_X, gapMid + 1.2, 0),
    V3(-7.5, gapMid + 0.4, 0.3),
    V3(-4.0, gapMid - 0.2, 0.2),
    // (8) Returns to center
    V3(-1.5, gapMid - 1.0, 0),
    V3( 0, ch04Y, 0),
    // (9) Straight down through Ch04, Ch05, Ch06 — subtle weave
    V3( 0.5, (ch04Y + ch05Y) * 0.5, 0.2),
    V3( 0, ch05Y, 0),
    V3(-0.5, (ch05Y + ch06Y) * 0.5, -0.2),
    V3( 0, ch06Y, 0),
    V3( 0, (ch06Y + contactY) * 0.5, 0),
    // At Contact
    V3( 0, contactY, 0),
    V3( 0, contactY - 2.5, 0),
    // (10) Exits through the bottom of the page
    V3( 0, docEnd - 4, 0),
  ];

  return [tubeA, tubeB];
}

export class GlobalRiver {
  constructor(canvas) {
    this.canvas = canvas;
    this.scrollY = 0;
    this.scrollImpulse = 0;
    this.mouseScreen = new THREE.Vector2(-9999, -9999);
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

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      55, window.innerWidth / window.innerHeight, 0.1, 400,
    );
    this.camera.position.set(0, 0, 8);

    this.uniforms = {
      uTime:       { value: 0 },
      uFlowSpeed:  { value: FLOW_SPEED },
      uHuePerUnit: { value: HUE_PER_UNIT },
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

    this.resizeObserver = new ResizeObserver(() => this.rebuildAll());
    this.resizeObserver.observe(document.body);

    // ---- EffectComposer: RenderPass -> UnrealBloomPass -> OutputPass ----
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.3, 0.5, 0.0,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  rebuildAll() {
    this.rebuildCurves();
    this.rebuildTubes();
  }

  rebuildCurves() {
    this.curves = [];
    const sections = Array.from(document.querySelectorAll('section[data-chapter]'));
    if (sections.length === 0) return;

    const sectionYs = sections.map((sec) => -sec.offsetTop / PX_PER_WORLD);
    const last = sections[sections.length - 1];
    const docBottomY = -(last.offsetTop + last.offsetHeight) / PX_PER_WORLD;

    for (const pts of buildTubePaths(sectionYs, docBottomY)) {
      if (pts.length < 4) continue;
      this.curves.push(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5));
    }
  }

  rebuildTubes() {
    for (const t of this.tubes) this.group.remove(t);
    for (const g of this.tubeGeoms) g.dispose();
    this.tubes = [];
    this.tubeGeoms = [];

    if (!this.material) return;

    for (const curve of this.curves) {
      const geom = new THREE.TubeGeometry(
        curve, TUBULAR_SEGMENTS, TUBE_RADIUS, RADIAL_SEGMENTS, false,
      );
      const mesh = new THREE.Mesh(geom, this.material);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.tubes.push(mesh);
      this.tubeGeoms.push(geom);
    }
  }

  onScroll(scrollY, deltaY) {
    this.scrollY = scrollY;
    this.scrollImpulse += deltaY * SCROLL_FACTOR;
  }

  onMouseMove(clientX, clientY) {
    this.mouseScreen.set(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1,
    );
  }

  getCurvePointAtScroll(scrollPx) {
    if (this.curves.length === 0) return new THREE.Vector3();
    // Pick whichever tube covers the requested y; fall back to last.
    const worldY = -scrollPx / PX_PER_WORLD;
    for (const c of this.curves) {
      const startY = c.getPoint(0).y;
      const endY   = c.getPoint(1).y;
      const hi = Math.max(startY, endY);
      const lo = Math.min(startY, endY);
      if (worldY <= hi && worldY >= lo) {
        const t = (startY - worldY) / (startY - endY || 1);
        return c.getPointAt(Math.max(0, Math.min(1, t))).clone();
      }
    }
    return this.curves[this.curves.length - 1].getPointAt(1).clone();
  }

  triggerSupernova() {
    if (this.supernovaActive) return;
    this.supernovaActive = true;
    gsap.to(this.bloomPass, { strength: SUPERNOVA_BLOOM, radius: 1.0, duration: 1.2, ease: 'power2.out' });
    gsap.to(this.uniforms.uFlowSpeed, { value: FLOW_SPEED * 6, duration: 1.2, ease: 'power2.out' });
  }

  tick(time, delta) {
    if (!this.composer) return;
    this.uniforms.uTime.value = time;

    if (!this.supernovaActive) {
      this.uniforms.uFlowSpeed.value = FLOW_SPEED + this.scrollImpulse;
      this.scrollImpulse *= 0.92;
    }

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

  destroy() {
    if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
    for (const g of this.tubeGeoms) g.dispose();
    this.tubeGeoms = [];
    this.tubes = [];
    if (this.material) this.material.dispose();
    if (this.bloomPass) this.bloomPass.dispose();
    if (this.composer) this.composer.dispose?.();
    if (this.renderer) this.renderer.dispose();
    this.material = null;
    this.composer = this.bloomPass = null;
    this.renderer = this.scene = this.camera = null;
  }
}
