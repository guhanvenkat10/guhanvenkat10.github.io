import * as THREE from 'three';

/* =============================================================
 *  HeroBrain — the brain POINT CLOUD in the intro.
 *  Points + colors are embedded (base64) in window.__BRAIN_POINTS by
 *  js/brain-points.js, so there is NO network fetch (works on file://).
 *  Auto-rotates, but the user can grab it (click + drag) to spin it;
 *  on release the throw momentum decays back into the idle spin.
 *  Source cloud: "Brain Point Cloud" by Terrie (Sketchfab), CC-BY-4.0.
 * ============================================================= */

const FOV = 40;
const IDLE_ROT_SPEED = 0.16;
const POINT_SIZE = 0.014;
const DRAG_K = 0.01;        /* radians per pixel dragged */
const MOMENTUM = 9;         /* throw -> angular velocity */

export class HeroBrain {
  constructor(canvas) {
    this.canvas = canvas;
    this.group = null;
    this.points = null;
    this.visible = true;
    this.yaw = -0.5; this.pitch = 0.1;
    this.velYaw = 0; this.velPitch = 0;
    this.dragging = false; this.lastX = 0; this.lastY = 0;
  }

  init() {
    if (!this.canvas) return;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
    this.camera.position.set(0, 0, 4);

    this.group = new THREE.Group();
    this.group.rotation.set(this.pitch, this.yaw, 0);
    this.scene.add(this.group);

    this.resize();
    this.buildPoints();
    this.addInput();
  }

  buildPoints() {
    const D = (typeof window !== 'undefined') ? window.__BRAIN_POINTS : null;
    if (!D || !D.b64) { console.warn('[hero-brain] embedded point data missing'); return; }
    const binStr = atob(D.b64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    const n = D.n;
    const positions = new Float32Array(bytes.buffer, 0, n * 3);
    const colors = new Uint8Array(bytes.buffer, n * 3 * 4, n * 3);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));

    const mat = new THREE.PointsMaterial({
      size: POINT_SIZE, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.96, depthWrite: false,
    });
    this.points = new THREE.Points(geom, mat);
    this.geom = geom; this.mat = mat;
    this.group.add(this.points);
    this.canvas.classList.add('is-ready');
  }

  /* Click + drag to spin (mouse / pen only; touch is left to scroll). */
  addInput() {
    const c = this.canvas;
    this.onDown = (e) => {
      if (e.pointerType === 'touch') return;
      this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY;
      this.velYaw = 0; this.velPitch = 0;
      try { c.setPointerCapture(e.pointerId); } catch (_) {}
      c.style.cursor = 'grabbing';
    };
    this.onMove = (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.yaw += dx * DRAG_K; this.pitch += dy * DRAG_K;
      this.velYaw = Math.max(-6, Math.min(6, dx * DRAG_K * MOMENTUM));
      this.velPitch = Math.max(-6, Math.min(6, dy * DRAG_K * MOMENTUM));
    };
    this.onUp = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      try { c.releasePointerCapture(e.pointerId); } catch (_) {}
      c.style.cursor = 'grab';
    };
    c.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove, { passive: true });
    window.addEventListener('pointerup', this.onUp, { passive: true });
    window.addEventListener('pointercancel', this.onUp, { passive: true });
  }

  resize() {
    if (!this.renderer) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.renderer.setSize(rect.width, rect.height, false);
    const aspect = rect.width / rect.height;
    this.camera.aspect = aspect;
    const fov = THREE.MathUtils.degToRad(FOV);
    const minHalf = Math.tan(fov / 2) * Math.min(1, aspect);
    this.camera.position.z = Math.max(2.6, Math.min(1.0 / (0.8 * minHalf), 12));
    this.camera.updateProjectionMatrix();
  }

  tick(time, delta) {
    if (!this.renderer || !this.visible) return;
    const dt = Math.min(delta || 0.016, 0.05);
    if (this.group) {
      if (!this.dragging) {
        this.yaw += (IDLE_ROT_SPEED + this.velYaw) * dt;
        this.pitch += this.velPitch * dt;
        this.velYaw *= 0.9; this.velPitch *= 0.9;
      }
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
      this.group.rotation.set(this.pitch, this.yaw, 0);
    }
    this.renderer.render(this.scene, this.camera);
  }

  setVisible(v) { this.visible = v; }

  destroy() {
    if (this.onDown) this.canvas.removeEventListener('pointerdown', this.onDown);
    if (this.onMove) window.removeEventListener('pointermove', this.onMove);
    if (this.onUp) { window.removeEventListener('pointerup', this.onUp); window.removeEventListener('pointercancel', this.onUp); }
    if (this.geom) this.geom.dispose();
    if (this.mat) this.mat.dispose();
    if (this.renderer) this.renderer.dispose();
    this.renderer = this.scene = this.camera = this.group = this.points = null;
  }
}
