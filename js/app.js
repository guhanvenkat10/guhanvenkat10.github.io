import { GlobalRiver } from './core/river.js';
import { HeroBrain } from './core/hero-brain.js';
import { ProjectNetwork } from './core/project-network.js';
import { NeuronTree } from './core/neuron.js';

/* Boot (multi-page): river spine on every page; brain on the Me page;
   the neural-network projects view on the Projects page. */

function safe(label, fn) { try { return fn(); } catch (e) { console.error('[' + label + ']', e); return null; } }

function boot() {
  window.__siteReady = true;

  let river = null;
  safe('river', () => { const c = document.getElementById('river-canvas'); if (c) { river = new GlobalRiver(c); river.init(); window.__river = river; } });

  let brain = null;
  safe('hero-brain', () => { const c = document.getElementById('hero-brain'); if (c) { brain = new HeroBrain(c); brain.init(); } });

  let pnet = null;
  safe('project-net', () => { const el = document.getElementById('pnet'); if (el) { pnet = new ProjectNetwork(el); pnet.init(); } });

  let neuron = null;
  safe('neuron', () => { const el = document.getElementById('neuron'); if (el) { neuron = new NeuronTree(el); neuron.init(); } });

  let last = performance.now();
  (function frame(now) {
    const delta = Math.min((now - last) / 1000, 1 / 20); last = now;
    if (river) river.tick(now / 1000);
    if (brain) brain.tick(now / 1000, delta);
    if (pnet) pnet.tick(now / 1000, delta);
    if (neuron) neuron.tick(now / 1000, delta);
    requestAnimationFrame(frame);
  })(performance.now());

  window.addEventListener('scroll', () => { if (river) river.onScroll(window.scrollY); }, { passive: true });
  window.addEventListener('mousemove', (e) => { if (river) river.onMouseMove(e.clientX, e.clientY); }, { passive: true });

  let rt = null;
  window.addEventListener('resize', () => {
    if (rt) clearTimeout(rt);
    rt = setTimeout(() => {
      if (river) river.resize(window.innerWidth, window.innerHeight);
      if (brain) brain.resize();
      if (pnet) pnet.resize();
      if (neuron) neuron.resize();
    }, 150);
  });

  const nav = document.getElementById('nav');
  const onScroll = () => {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 10);
    if (brain) brain.setVisible(window.scrollY < window.innerHeight * 1.1);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase() || 'index.html';
  document.querySelectorAll('.nav-links a[data-page]').forEach((a) => {
    if ((a.getAttribute('data-page') || '').toLowerCase() === page) a.classList.add('is-active');
  });

  const revealEls = Array.from(document.querySelectorAll('[data-reveal]'));
  if ('IntersectionObserver' in window) {
    const ro = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-in'); obs.unobserve(entry.target); } });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    revealEls.forEach((el) => ro.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
