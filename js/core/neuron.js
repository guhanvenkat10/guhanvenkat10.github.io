/* =============================================================
 *  NeuronTree — the Experience page as a growing neuron.
 *  A soma sprouts dendrites (one primary per group: Research,
 *  Leadership, Education) that branch out to role "tips". The
 *  arbor grows in on load, afferent signal pulses travel tip→soma,
 *  and hovering a tip expands that role's details. Reads roles from
 *  the .group/.entry markup, which stays as the no-JS/mobile view.
 * ============================================================= */

const LIME = '200,245,66';
const TEXT = '241,237,229';
const hsla = (h, s, l, a) => 'hsla(' + (h * 360).toFixed(0) + ',' + s + '%,' + l + '%,' + a.toFixed(3) + ')';
const GROW_DUR = 2.4;

const lerp = (a, b, t) => a + (b - a) * t;
function qpoint(p0, c, p1, t) {
  const it = 1 - t;
  return { x: it * it * p0.x + 2 * it * t * c.x + t * t * p1.x, y: it * it * p0.y + 2 * it * t * c.y + t * t * p1.y };
}
function ctrl(p0, p1, k) {
  const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
  const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1;
  return { x: mx + (-dy / len) * len * k, y: my + (dx / len) * len * k };
}
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function dot(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

export class NeuronTree {
  constructor(container) {
    this.container = container;
    this.canvas = container ? container.querySelector('.pnet__canvas') : null;
    this.panel = container ? container.querySelector('.pnet__panel') : null;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.groups = [];
    this.layoutGroups = [];
    this.tips = [];
    this.pulses = [];
    this.active = -1; this.pinned = -1;
    this.enabled = false; this.elapsed = 0;
    this.W = 0; this.H = 0;
  }

  init() {
    if (!this.canvas || !this.ctx) return;
    this.parse();
    if (!this.groups.length) return;
    this.canvas.addEventListener('mousemove', (e) => this.onMove(e));
    this.canvas.addEventListener('mouseleave', () => { this.active = -1; if (this.pinned < 0) this.updatePanel(); });
    this.canvas.addEventListener('click', () => {
      if (this.active >= 0) this.pinned = (this.pinned === this.active) ? -1 : this.active;
      else this.pinned = -1;
      this.updatePanel();
    });
    this.layout();
  }

  parse() {
    const T = (el, s) => { const e = el.querySelector(s); return e ? e.textContent.trim() : ''; };
    const groupEls = Array.from(document.querySelectorAll('.page .group'));
    this.groups = groupEls.map((g) => ({
      name: T(g, '.sub-head'),
      awards: Array.from(g.querySelectorAll('.awards li')).map((li) => li.textContent.trim()),
      items: Array.from(g.querySelectorAll('.entry')).map((e) => ({
        label: e.dataset.node || T(e, '.entry-role'),
        role: T(e, '.entry-role'),
        org: T(e, '.entry-org'),
        date: T(e, '.entry-date'),
        note: T(e, '.entry-note'),
        points: Array.from(e.querySelectorAll('.entry-points li')).map((li) => li.innerHTML),
      })),
    })).filter((g) => g.items.length);
  }

  enabledCheck() { return window.innerWidth >= 820; }

  layout() {
    const page = document.querySelector('.page') || document.body;
    this.enabled = this.enabledCheck();
    page.classList.toggle('neuron-on', this.enabled);
    if (!this.enabled) return;

    const rect = this.container.getBoundingClientRect();
    const W = rect.width, H = rect.height; this.W = W; this.H = H;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.soma = { x: W * 0.10, y: H * 0.5 };
    const tipX = W * 0.47, hubX = W * 0.28;
    const total = this.groups.reduce((a, g) => a + g.items.length, 0);
    const top = H * 0.12, bot = H * 0.88;
    let idx = 0; this.tips = []; this.layoutGroups = [];
    this.groups.forEach((g, gi) => {
      const items = g.items.map((it) => {
        const y = total > 1 ? lerp(top, bot, idx / (total - 1)) : H * 0.5;
        idx++;
        const tip = { x: tipX, y, item: it, gi };
        return tip;
      });
      const hubY = items.reduce((a, t) => a + t.y, 0) / items.length;
      const hub = { x: hubX, y: hubY };
      const priC = ctrl(this.soma, hub, gi % 2 ? 0.14 : -0.14);
      const secs = items.map((tip, k) => {
        const secC = ctrl(hub, tip, k % 2 ? 0.18 : -0.18);
        tip.hub = hub; tip.secC = secC; tip.priC = priC;
        this.tips.push(tip);
        return { tip, secC };
      });
      this.layoutGroups.push({ g, hub, priC, secs, gi });
    });
    this.tips.forEach((t, i) => { t.hue = this.tips.length > 1 ? i / (this.tips.length - 1) : 0.5; });
    this.layoutGroups.forEach((lg) => { lg.hue = lg.secs.reduce((a, s) => a + s.tip.hue, 0) / Math.max(1, lg.secs.length); });
    if (!this.pulses.length) this.pulses = Array.from({ length: 12 }, () => this.newPulse());
  }

  newPulse() { return { ti: Math.floor(Math.random() * Math.max(1, this.tips.length)), u: Math.random() * 2, sp: 0.3 + Math.random() * 0.5 }; }

  onMove(e) {
    if (!this.enabled) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let found = -1;
    for (let i = 0; i < this.tips.length; i++) {
      const t = this.tips[i], dx = mx - t.x, dy = my - t.y;
      if (dx * dx + dy * dy <= 18 * 18) { found = i; break; }
    }
    this.canvas.style.cursor = found >= 0 ? 'pointer' : 'default';
    if (found !== this.active) { this.active = found; if (this.pinned < 0) this.updatePanel(); }
  }

  currentIdx() { return this.pinned >= 0 ? this.pinned : this.active; }

  updatePanel() {
    if (!this.panel) return;
    const idx = this.currentIdx();
    const t = this.tips[idx];
    if (idx < 0 || !t) { this.panel.classList.remove('show'); return; }
    const it = t.item;
    let lis = it.points.map((p) => '<li>' + p + '</li>').join('');
    if (!lis) {
      const extra = [];
      if (it.note) extra.push(esc(it.note));
      const g = this.groups[t.gi];
      (g.awards || []).forEach((a) => extra.push(esc(a)));
      lis = extra.map((x) => '<li>' + x + '</li>').join('');
    }
    this.panel.innerHTML =
      '<div class="pnet-card">' +
        '<div class="card-top"><h3 class="card-title">' + esc(it.role) + '</h3>' +
        '<span class="card-venue">' + esc(it.date) + '</span></div>' +
        '<p class="card-sub">' + esc(it.org) + '</p>' +
        '<ul class="entry-points">' + lis + '</ul>' +
      '</div>';
    this.panel.classList.add('show');
  }

  tick(time, delta) {
    if (!this.enabled || !this.ctx) return;
    const dt = Math.min(delta || 0.016, 0.05);
    this.elapsed += dt;
    const g = smooth(this.elapsed / GROW_DUR);
    const priF = smooth(Math.min(1, g / 0.45));
    const secF = smooth(Math.min(1, Math.max(0, (g - 0.4) / 0.6)));
    const grown = g >= 1;
    const ctx = this.ctx; ctx.clearRect(0, 0, this.W, this.H);
    const act = this.currentIdx();
    const actGi = act >= 0 ? this.tips[act].gi : -1;

    /* axon flourish (decorative) */
    const axEnd = { x: this.W * 0.045, y: this.H * 0.84 };
    const axC = ctrl(this.soma, axEnd, 0.1);
    this.drawCurve(this.soma, axC, axEnd, priF, 'rgba(' + TEXT + ',0.10)', 1.4);

    /* dendrites */
    for (const lg of this.layoutGroups) {
      const onHub = lg.gi === actGi;
      this.drawCurve(this.soma, lg.priC, lg.hub, priF,
        onHub ? hsla(lg.hue, 88, 66, 0.6) : hsla(lg.hue, 70, 56, 0.18), onHub ? 2 : 1.3);
      for (const s of lg.secs) {
        const onTip = this.tips[act] === s.tip;
        this.drawCurve(lg.hub, s.secC, s.tip, secF,
          onTip ? hsla(s.tip.hue, 92, 68, 0.78) : hsla(s.tip.hue, 72, 56, 0.16), onTip ? 2 : 1);
      }
    }

    /* afferent pulses tip -> hub -> soma */
    if (grown) {
      for (const pu of this.pulses) {
        pu.u += dt * pu.sp;
        if (pu.u >= 2) { Object.assign(pu, this.newPulse()); pu.u = 0; }
        const t = this.tips[pu.ti] || this.tips[0];
        let p;
        if (pu.u < 1) p = qpoint(t, t.secC, t.hub, pu.u);
        else p = qpoint(t.hub, t.priC, this.soma, pu.u - 1);
        dot(ctx, p.x, p.y, 1.8, hsla((this.time * 0.2 + (t ? t.hue : 0)) % 1, 95, 66, 0.85));
      }
    }

    /* soma */
    const sr = 13 + Math.sin(this.elapsed * 1.5) * 0.8;
    dot(ctx, this.soma.x, this.soma.y, sr + 8, 'rgba(255,255,255,0.10)');
    dot(ctx, this.soma.x, this.soma.y, sr * priF, 'rgba(245,242,235,0.95)');
    dot(ctx, this.soma.x, this.soma.y, sr * 0.45 * priF, 'rgba(255,255,255,0.85)');

    /* tips + labels */
    ctx.font = '12px "DM Mono", ui-monospace, monospace'; ctx.textBaseline = 'middle';
    const labelA = smooth((secF - 0.55) / 0.45);
    for (let i = 0; i < this.tips.length; i++) {
      const t = this.tips[i], on = i === act, r = (on ? 12 : 7) * Math.max(0.001, secF);
      if (on) dot(ctx, t.x, t.y, r + 8, hsla(t.hue, 90, 62, 0.16));
      dot(ctx, t.x, t.y, r, on ? hsla(t.hue, 92, 72, 1) : hsla(t.hue, 85, 60, 0.55 * secF));
      ctx.beginPath(); ctx.arc(t.x, t.y, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = on ? hsla(t.hue, 90, 66, 0.6) : hsla(t.hue, 80, 60, 0.16 * secF); ctx.lineWidth = 1; ctx.stroke();
      if (labelA > 0.01) {
        ctx.fillStyle = on ? 'rgba(' + TEXT + ',1)' : 'rgba(' + TEXT + ',' + (0.62 * labelA) + ')';
        ctx.fillText(t.item.label, t.x + r + 10, t.y);
      }
    }
  }

  drawCurve(p0, c, p1, frac, style, lw) {
    if (frac <= 0) return;
    const ctx = this.ctx; ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
    const N = 20;
    for (let i = 1; i <= N; i++) { const p = qpoint(p0, c, p1, (i / N) * frac); ctx.lineTo(p.x, p.y); }
    ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
  }

  resize() { this.layout(); }
}
