import * as THREE from 'three';
import gsap from 'gsap';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* =============================================================
 *  Global Rainbow River — tube ribbon
 *  Lower bloom + heavier shading so the tube reads as a 3D cylinder
 *  rather than a flat glowing ribbon. Two CatmullRom paths weave through
 *  the whole document, with the second extended past contact so the
 *  river never straightens out at the end.
 * ============================================================= */

const TUBULAR_SEGMENTS = 480;
const RADIAL_SEGMENTS  = 14;     /* fewer radials = subtle facets = reads as tube */
const TUBE_RADIUS      = 0.42;   /* slightly slimmer so it doesn't bully the type */
const FLOW_SPEED       = 0.05;
const HUE_PER_UNIT     = 0.045;
const SCROLL_FACTOR    = 0.00022;
const PX_PER_WORLD     = 110;
const OFF_SCREEN_X     = 11;

/* ----- Shaders ----- */
const RIVER_VERT = /* glsl */`
  varying vec3 vLocalPos;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying float vDisp;
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
    /* very gentle noise — keep the tube shape recognisable */
    float n  = snoise(vec3(position.xy * 0.4, uTime * 0.28 + position.y * 0.4));
    float disp = n * 0.06;
    vDisp = disp;

    vec3 displaced = position + normal * disp;

    /* Mouse repulsion */
    vec3 mouseWorld = vec3(uMouse.x * 5.0, uMouse.y * 3.5, 0.0);
    float md = distance(displaced.xy, mouseWorld.xy);
    float repulse = 0.30 / (md * md + 1.0);
    vec3 dir = normalize(vec3(displaced.xy - mouseWorld.xy, 0.0001));
    displaced += dir * repulse * 0.25;

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
  varying float vDisp;
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uHuePerUnit;

  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }

  void main() {
    float hue = fract(-vLocalPos.y * uHuePerUnit - uTime * uFlowSpeed);
    vec3 spectrum = hsl2rgb(vec3(hue, 0.95, 0.50));

    /* Strong shading from view dot normal — gives the tube clear roundness
       without leaning on bloom for visibility. */
    float ndv = max(0.0, dot(vNormal, vViewDir));
    float shading = pow(ndv, 0.85);      /* core bright, edges darker */
    vec3 col = spectrum * (0.25 + 0.75 * shading);

    /* Subtle rim accent (not a halo — just enough to define the silhouette) */
    float rim = pow(1.0 - ndv, 3.0);
    col += spectrum * rim * 0.35;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const V3 = (x, y, z = 0) => new THREE.Vector3(x, y, z);

/* Build two tube paths anchored to live section Y positions. */
function buildTubePaths(sectionYs, docBottomY) {
  const heroY    = sectionYs[0] ?? 0;
  const aboutY   = sectionYs[1] ?? (heroY - 9);
  const brainY   = sectionYs[2] ?? (aboutY - 9);
  const ch04Y    = sectionYs[3] ?? (brainY - 9);
  const ch05Y    = sectionYs[4] ?? (ch04Y - 9);
  const ch06Y    = sectionYs[5] ?? (ch05Y - 9);
  const contactY = sectionYs[6] ?? (ch06Y - 9);
  const docEnd   = docBottomY ?? (contactY - 6);

  /* TUBE A — top of page through Ch03 brain */
  const tubeA = [
    V3( 0, heroY + 7, 0),
    V3( 0.4, heroY + 5, 0.1),
    V3( 4, heroY + 4, 0.3),
    V3( 8, heroY + 2.5, 0.5),
    V3( OFF_SCREEN_X - 1, heroY + 0.8, 0.3),
    V3( 6, heroY - 0.8, 0),
    V3( 2, heroY - 2.0, -0.2),
    V3( 0, heroY - 3.2, 0),
    V3(-1.2, (heroY + aboutY) * 0.5, 0.2),
    V3( 0.6, aboutY, 0),
    V3(-0.8, aboutY - 3, 0.1),
    V3( 1.2, brainY + 3.5, -0.2),
    V3( 0, brainY + 1.8, 0),
    V3(-2.0, brainY + 0.6, 0.4),
    V3(-3.2, brainY - 0.6, 0.6),
    V3(-2.6, brainY - 1.9, 0.4),
    V3(-0.5, brainY - 2.9, 0),
    V3( 2.0, brainY - 2.8, -0.3),
    V3( 4.0, brainY - 2.0, -0.5),
    V3( 5.5, brainY - 1.0, -0.3),
    V3( 8.0, brainY - 0.2, 0),
    V3( OFF_SCREEN_X, brainY + 0.3, 0),
  ];

  /* TUBE B — re-enter left, weave through Ch04..06, exit through contact.
     Extra control points keep the weave alive all the way to docEnd. */
  const gapMid = (brainY + ch04Y) * 0.5;
  const ch45 = (ch04Y + ch05Y) * 0.5;
  const ch56 = (ch05Y + ch06Y) * 0.5;
  const ch6c = (ch06Y + contactY) * 0.5;
  const tubeB = [
    V3(-OFF_SCREEN_X, gapMid + 1.2, 0),
    V3(-7.5, gapMid + 0.4, 0.3),
    V3(-4.0, gapMid - 0.2, 0.2),
    V3(-1.5, gapMid - 1.0, 0),
    V3( 1.2, ch04Y + 1.5, -0.2),
    V3(-1.5, ch04Y, 0.1),
    V3( 2.2, ch04Y - 2.0, 0.3),
    V3(-2.0, ch45, -0.2),
    V3( 1.5, ch05Y + 1.0, 0.2),
    V3(-2.5, ch05Y, 0),
    V3( 2.0, ch05Y - 2.0, -0.3),
    V3(-1.5, ch56, 0.3),
    V3( 2.5, ch06Y + 1.0, -0.2),
    V3(-1.0, ch06Y, 0.1),
    V3( 1.8, ch06Y - 2.0, 0.2),
    V3(-1.5, ch6c, -0.2),
    V3( 1.0, contactY + 1.0, 0.3),
    V3(-0.8, contactY, 0),
    V3( 0.6, contactY - 2.5, -0.2),
    V3(-1.2, docEnd - 1, 0.2),
    V3( 0.5, docEnd - 4, 0),
  ];

  return [tubeA, tubeB];
}

export class GlobalRiver {
  constructor(canvas) {
    this.canvas = canvas;
    this.scrollY = 0;
    this.scrollImpulse = 0;
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

    this.resizeObserver = new ResizeObserver(() => this.rebuildAll());
    this.resizeObserver.observe(document.body);

    /* Composer with MUCH lower bloom so text isn't washed out. */
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.35,    /* strength — down from 0.85 */
      0.55,    /* radius */
      0.25,    /* threshold — only brighter parts bloom, not the whole thing */
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
    this.mouseTarget.set(
      (clientX / window.innerWidth) * 2 - 1,
      -((clientY / window.innerHeight) * 2 - 1),
    );
  }

  triggerSupernova() {
    if (this.supernovaActive) return;
    this.supernovaActive = true;
    gsap.to(this.bloomPass, { strength: 1.3, radius: 0.9, duration: 1.4, ease: 'power2.out' });
    gsap.to(this.uniforms.uFlowSpeed, { value: FLOW_SPEED * 5, duration: 1.4, ease: 'power2.out' });
  }

  tick(time) {
    if (!this.composer) return;
    this.uniforms.uTime.value = time;
    if (!this.supernovaActive) {
      this.uniforms.uFlowSpeed.value = FLOW_SPEED + this.scrollImpulse;
      this.scrollImpulse *= 0.92;
    }
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
