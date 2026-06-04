/* =============================================================
 *  ProjectNetwork — full-screen living web for the Projects page.
 *  A force-directed cloud: nodes repel each other (even spacing, never
 *  collapses) inside a soft circular boundary that keeps them gathered.
 *  Your 6 projects sit among ~70 ambient nodes. Everything is colored
 *  as a rainbow (each node a hue; edges are gradients between the two
 *  endpoint hues; signal pulses cycle the spectrum). Brushing a line or
 *  clicking sends a gentle signal rippling outward. Hover a project to
 *  open it. Reads .card markup (the no-JS / mobile fallback).
 * ============================================================= */

const FILLERS = 70;
const LINK = 168;          /* proximity edge between ordinary nodes */
const LINK_P = 320;        /* projects reach farther */
const NODE_R = 74;         /* min spacing — nodes repel within this */
const NODE_REPEL = 2600;
const CURSOR_R = 130;      /* cursor parts the cloud */
const CURSOR_F = 1000;
const CONTAIN = 3.4;       /* soft boundary strength */
const WANDER = 80;
const DAMP = 0.92;
const MAXV = 62;
const MARGIN = 26;
const EDGE_HOVER = 15;
const SIG_SPEED = 880;
const SIG_MAXDEPTH = 4;
const SIG_THROTTLE = 0.6;
const SIG_FADE = 0.55;
const PULSE_CAP = 360;

const rnd = (a, b) => a + Math.random() * (b - a);
const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hsla = (h, s, l, a) => 'hsla(' + (h * 360).toFixed(0) + ',' + s + '%,' + l + '%,' + a.toFixed(3) + ')';
function segNearest(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

export class ProjectNetwork {
  constructor(container) {
    this.container = container;
    this.canvas = container ? container.querySelector('.pnet__canvas') : null;
    this.panel = container ? container.querySelector('.pnet__panel') : null;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.projects = []; this.nodes = []; this.edges = []; this.adj = []; this.pulses = [];
    this.mouse = { x: -9999, y: -9999, on: false };
    this.hover = -1; this.pinned = -1; this.lastPanel = -2;
    this.enabled = false; this.built = false; this.reduce = false;
    this.W = 0; this.H = 0; this.time = 0; this.cid = 0; this.lastSig = -1;
  }

  init() {
    if (!this.canvas || !this.ctx) return;
    this.parse();
    if (!this.projects.length) return;
    this.reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top; this.mouse.on = true;
    });
    this.canvas.addEventListener('mouseleave', () => { this.mouse.on = false; this.mouse.x = -9999; this.mouse.y = -9999; });
    this.canvas.addEventListener('click', () => {
      if (this.hover >= 0) this.pinned = (this.pinned === this.hover) ? -1 : this.hover;
      else this.pinned = -1;
      this.refreshPanel(true);
      const nn = this.nearestNode(this.mouse.x, this.mouse.y);
      if (nn >= 0) this.fireSignal(nn);
    });
    this.layout();
  }

  parse() {
    const t = (c, s) => { const e = c.querySelector(s); return e ? e.textContent.trim() : ''; };
    this.projects = Array.from(document.querySelectorAll('#project-cards .card')).map((c) => ({
      short: c.dataset.short || t(c, '.card-title'),
      title: t(c, '.card-title'), venue: t(c, '.card-venue'), sub: t(c, '.card-sub'), desc: t(c, '.card-desc'),
      metrics: Array.from(c.querySelectorAll('.card-metrics li')).map((li) => li.innerHTML),
      tags: Array.from(c.querySelectorAll('.tags li')).map((li) => li.textContent.trim()),
    }));
  }

  enabledCheck() { return window.innerWidth >= 820; }

  layout() {
    this.enabled = this.enabledCheck();
    document.body.classList.toggle('net-on', this.enabled);
    if (!this.enabled) return;
    const W = window.innerWidth, H = window.innerHeight; this.W = W; this.H = H;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.built) { this.build(); this.built = true; }
    else for (const n of this.nodes) { n.x = Math.max(MARGIN, Math.min(W - MARGIN, n.x)); n.y = Math.max(MARGIN, Math.min(H - MARGIN, n.y)); }
  }

  build() {
    const W = this.W, H = this.H, R = Math.min(W, H) * 0.42, cx = W / 2, cy = H / 2;
    const place = () => { const a = rnd(0, Math.PI * 2), r = Math.sqrt(Math.random()) * R; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; };
    this.nodes = [];
    this.projects.forEach((p, i) => { const q = place(); this.nodes.push({ x: q.x, y: q.y, vx: 0, vy: 0, project: true, pi: i, r: 7, hue: i / this.projects.length, firedCid: -1, fireT: -9 }); });
    for (let k = 0; k < FILLERS; k++) { const q = place(); this.nodes.push({ x: q.x, y: q.y, vx: rnd(-8, 8), vy: rnd(-8, 8), project: false, pi: -1, r: rnd(1.4, 2.8), hue: Math.random(), firedCid: -1, fireT: -9 }); }
    this.projIdx = this.nodes.map((n, i) => (n.project ? i : -1)).filter((i) => i >= 0);
  }

  nearestNode(mx, my) { let b = -1, bd = Infinity; for (let i = 0; i < this.nodes.length; i++) { const n = this.nodes[i], d = (n.x - mx) ** 2 + (n.y - my) ** 2; if (d < bd) { bd = d; b = i; } } return b; }

  refreshPanel(force) {
    const idx = this.pinned >= 0 ? this.pinned : this.hover;
    if (!force && idx === this.lastPanel) return;
    this.lastPanel = idx;
    const node = this.nodes[idx];
    if (idx < 0 || !node || !node.project) { this.panel.classList.remove('show'); return; }
    const p = this.projects[node.pi];
    this.panel.innerHTML =
      '<div class="pnet-card">' +
        '<div class="card-top"><h3 class="card-title">' + esc(p.title) + '</h3>' +
        '<span class="card-venue">' + esc(p.venue) + '</span></div>' +
        '<p class="card-sub">' + esc(p.sub) + '</p>' +
        '<p class="card-desc">' + esc(p.desc) + '</p>' +
        '<ul class="card-metrics">' + p.metrics.map((m) => '<li>' + m + '</li>').join('') + '</ul>' +
        '<ul class="tags">' + p.tags.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>' +
      '</div>';
    this.panel.classList.add('show');
  }

  fireSignal(node) { this.cid++; this.ignite(node, this.cid, 0); }
  ignite(i, cid, depth) {
    const n = this.nodes[i]; if (!n) return;
    n.firedCid = cid; n.fireT = this.time;
    if (depth >= SIG_MAXDEPTH) return;
    const nb = this.adj[i] || [];
    for (let k = 0; k < nb.length; k++) { if (this.pulses.length >= PULSE_CAP) break; this.pulses.push({ a: i, b: nb[k], cid, depth: depth + 1, t: 0 }); }
  }

  step(dt) {
    if (this.reduce) return;
    const W = this.W, H = this.H, m = this.mouse, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42;
    const N = this.nodes.length;
    /* node-node repulsion: even spacing, never collapses */
    for (let i = 0; i < N; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < N; j++) {
        const b = this.nodes[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < NODE_R * NODE_R) { const d = Math.sqrt(d2) || 1, f = NODE_REPEL * (1 - d / NODE_R) / d * dt, ax = dx * f, ay = dy * f; a.vx += ax; a.vy += ay; b.vx -= ax; b.vy -= ay; }
      }
    }
    const act = (this.pinned >= 0 ? this.pinned : this.hover);
    for (let i = 0; i < N; i++) {
      const n = this.nodes[i];
      n.vx += rnd(-1, 1) * WANDER * dt; n.vy += rnd(-1, 1) * WANDER * dt;
      const ddx = n.x - cx, ddy = n.y - cy, dist = Math.hypot(ddx, ddy);
      if (dist > R) { const over = dist - R, f = over * CONTAIN * dt / (dist || 1); n.vx -= ddx * f; n.vy -= ddy * f; }
      if (m.on && !n.project) { const dx = n.x - m.x, dy = n.y - m.y, q2 = dx * dx + dy * dy; if (q2 < CURSOR_R * CURSOR_R) { const d = Math.sqrt(q2) || 1, f = CURSOR_F * (1 - d / CURSOR_R) / d * dt; n.vx += dx * f; n.vy += dy * f; } }
      if (i === act) { n.vx *= 0.55; n.vy *= 0.55; }
      const sp = Math.hypot(n.vx, n.vy); if (sp > MAXV) { n.vx = n.vx / sp * MAXV; n.vy = n.vy / sp * MAXV; }
      n.x += n.vx * dt; n.y += n.vy * dt; n.vx *= DAMP; n.vy *= DAMP;
      if (n.x < MARGIN) { n.x = MARGIN; n.vx = Math.abs(n.vx); } else if (n.x > W - MARGIN) { n.x = W - MARGIN; n.vx = -Math.abs(n.vx); }
      if (n.y < MARGIN) { n.y = MARGIN; n.vy = Math.abs(n.vy); } else if (n.y > H - MARGIN) { n.y = H - MARGIN; n.vy = -Math.abs(n.vy); }
    }
  }

  buildGraph() {
    const nodes = this.nodes, N = nodes.length, edges = [], seen = new Set(), adj = [];
    for (let i = 0; i < N; i++) adj[i] = [];
    const add = (i, j, d) => { const k = i < j ? i * 100003 + j : j * 100003 + i; if (seen.has(k)) return; seen.add(k); edges.push([i, j, d]); adj[i].push(j); adj[j].push(i); };
    for (let i = 0; i < N; i++) { const a = nodes[i]; for (let j = i + 1; j < N; j++) { const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y); if (d < ((a.project || b.project) ? LINK_P : LINK)) add(i, j, d); } }
    for (let i = 0; i < N; i++) {
      if (adj[i].length >= 2) continue;
      const cand = []; for (let j = 0; j < N; j++) { if (j !== i) cand.push([Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y), j]); }
      cand.sort((p, q) => p[0] - q[0]); for (let k = 0; k < 3 && adj[i].length < 3; k++) add(i, cand[k][1], cand[k][0]);
    }
    const P = this.projIdx;
    for (let a = 0; a < P.length; a++) { const cand = []; for (let b = 0; b < P.length; b++) { if (a !== b) cand.push([Math.hypot(nodes[P[a]].x - nodes[P[b]].x, nodes[P[a]].y - nodes[P[b]].y), P[b]]); } cand.sort((p, q) => p[0] - q[0]); for (let k = 0; k < Math.min(2, cand.length); k++) add(P[a], cand[k][1], cand[k][0]); }
    this.edges = edges; this.adj = adj;
  }

  glow(i) { const g = 1 - (this.time - this.nodes[i].fireT) / SIG_FADE; return g > 0 ? g : 0; }

  tick(time, delta) {
    if (!this.enabled || !this.ctx) return;
    const dt = Math.min(delta || 0.016, 0.05); this.time += dt;
    this.step(dt); this.buildGraph();

    this.hover = -1;
    if (this.mouse.on) { let bd = 26 * 26; for (let i = 0; i < this.nodes.length; i++) { const n = this.nodes[i]; if (!n.project) continue; const dx = this.mouse.x - n.x, dy = this.mouse.y - n.y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; this.hover = i; } } }
    this.refreshPanel(false);

    for (let p = this.pulses.length - 1; p >= 0; p--) {
      const pu = this.pulses[p], a = this.nodes[pu.a], b = this.nodes[pu.b], L = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      pu.t += dt * SIG_SPEED / L;
      if (pu.t >= 1) { if (this.nodes[pu.b].firedCid !== pu.cid) this.ignite(pu.b, pu.cid, pu.depth); this.pulses.splice(p, 1); }
    }

    const ctx = this.ctx, m = this.mouse, act = (this.pinned >= 0 ? this.pinned : this.hover);
    ctx.clearRect(0, 0, this.W, this.H);

    let heBest = EDGE_HOVER, heEnd = -1;
    for (let e = 0; e < this.edges.length; e++) {
      const [i, j, d] = this.edges[e], a = this.nodes[i], b = this.nodes[j];
      const proj = a.project || b.project, lim = proj ? LINK_P : LINK;
      let al = d < lim ? (1 - d / lim) * (proj ? 0.34 : 0.16) : (proj ? 0.12 : 0.08);
      let lw = proj ? 1 : 0.6, hot = false;
      const eg = Math.max(this.glow(i), this.glow(j));
      if (eg > 0) { al = Math.max(al, 0.18 + 0.32 * eg); lw += 0.9 * eg; hot = true; }
      if (m.on) { const sn = segNearest(m.x, m.y, a.x, a.y, b.x, b.y); if (sn.d < EDGE_HOVER) { const k = 1 - sn.d / EDGE_HOVER; al = Math.min(0.6, al + 0.22 * k); lw += 0.5 * k; hot = true; if (sn.d < heBest) { heBest = sn.d; heEnd = sn.t < 0.5 ? i : j; } } }
      const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      g.addColorStop(0, hsla(a.hue, 85, hot ? 66 : 58, al));
      g.addColorStop(1, hsla(b.hue, 85, hot ? 66 : 58, al));
      ctx.strokeStyle = g; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    if (heEnd >= 0 && (this.time - this.lastSig) > SIG_THROTTLE) { this.fireSignal(heEnd); this.lastSig = this.time; }

    for (let p = 0; p < this.pulses.length; p++) {
      const pu = this.pulses[p], a = this.nodes[pu.a], b = this.nodes[pu.b];
      const x = a.x + (b.x - a.x) * pu.t, y = a.y + (b.y - a.y) * pu.t;
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fillStyle = hsla((this.time * 0.25 + pu.t) % 1, 95, 66, 0.95); ctx.fill();
    }

    ctx.font = '12px "DM Mono", ui-monospace, monospace'; ctx.textBaseline = 'middle';
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i], g = this.glow(i);
      if (!n.project) {
        let a = 0.34, l = 56;
        if (m.on) { const dd = Math.hypot(n.x - m.x, n.y - m.y); if (dd < CURSOR_R) a = 0.34 + 0.34 * (1 - dd / CURSOR_R); }
        if (g > 0) { a = Math.max(a, 0.55 + 0.4 * g); l = 66; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 5 * g, 0, Math.PI * 2); ctx.fillStyle = hsla(n.hue, 90, 62, 0.14 * g); ctx.fill(); }
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fillStyle = hsla(n.hue, 80, l, a); ctx.fill();
        continue;
      }
      const on = i === act, r = on ? 12 : 7;
      ctx.beginPath(); ctx.arc(n.x, n.y, r + (on ? 11 : 7) + 5 * g, 0, Math.PI * 2); ctx.fillStyle = hsla(n.hue, 90, 60, (on ? 0.16 : 0.09) + 0.16 * g); ctx.fill();
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fillStyle = hsla(n.hue, 92, on ? 70 : 60, 1); ctx.fill();
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 3, 0, Math.PI * 2); ctx.strokeStyle = hsla(n.hue, 90, 64, on ? 0.7 : 0.3); ctx.lineWidth = 1; ctx.stroke();
      const left = n.x > this.W - 180; ctx.textAlign = left ? 'right' : 'left';
      ctx.fillStyle = on ? 'rgba(241,237,229,1)' : 'rgba(241,237,229,0.7)';
      ctx.fillText(this.projects[n.pi].short, n.x + (left ? -(r + 10) : (r + 10)), n.y);
    }
    ctx.textAlign = 'left';
  }

  resize() { this.layout(); }
}
