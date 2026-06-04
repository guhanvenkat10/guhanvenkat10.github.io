import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

import { initCursor } from './core/cursor.js';
import { initChapterMarker } from './core/ui.js';
import { SceneRegistry } from './core/scenes.js';
import { GlobalRiver } from './core/river.js';

import { HeroChapter } from './chapters/chapter-01-hero.js';
import { AboutChapter } from './chapters/chapter-02-about.js';
import { AttentionChapter } from './chapters/chapter-03-attention.js';
import { ResearchChapter } from './chapters/chapter-04-research.js';
import { TrialChapter } from './chapters/chapter-05-trial.js';
import { ToneSpeechChapter } from './chapters/chapter-06-tone-speech.js';
import { ContactChapter } from './chapters/chapter-07-contact.js';

gsap.registerPlugin(ScrollTrigger);

const CHAPTERS = [
  { id: '01', cls: HeroChapter },
  { id: '02', cls: AboutChapter },
  { id: '03', cls: AttentionChapter },
  { id: '04', cls: ResearchChapter },
  { id: '05', cls: TrialChapter },
  { id: '06', cls: ToneSpeechChapter },
  { id: '07', cls: ContactChapter },
];

function boot() {
  const updateCursor = initCursor();
  initChapterMarker();

  // Boot the global river FIRST so its canvas sits behind every chapter.
  const riverCanvas = document.getElementById('river-canvas');
  const river = new GlobalRiver(riverCanvas);
  river.init();
  window.__river = river;

  const registry = new SceneRegistry();
  for (const c of CHAPTERS) {
    const section = document.getElementById(`ch-${c.id}`);
    if (!section) continue;
    // Chapter canvases now live inside .chapter-canvas-wrap at body level.
    const canvas = document.querySelector(
      `.chapter-canvas-wrap[data-canvas="${c.id}"] canvas.chapter-canvas`,
    );
    registry.register({
      id: c.id,
      section,
      canvas,
      factory: (cv, s) => new c.cls(cv, s),
    });
  }
  registry.start();

  // Per-chapter activation via ScrollTrigger.
  // Each chapter's wrapper fades in via a paused tween whose play/reverse
  // is driven by toggleActions; onToggle handles lazy init + isActive flag.
  for (const entry of registry.entries) {
    const wrap = document.querySelector(
      `.chapter-canvas-wrap[data-canvas="${entry.id}"]`,
    );
    const fadeTween = wrap
      ? gsap.to(wrap, { opacity: 1, duration: 0.4, ease: 'power2.out', paused: true })
      : null;

    ScrollTrigger.create({
      trigger: entry.section,
      start: 'top 80%',
      end: 'bottom 80%',
      // play reverse play reverse — chapter visible only while section is in
      // the [start, end] window. With end at 'bottom 80%', adjacent chapter
      // windows are exactly contiguous (no overlap, no gap), so the handoff
      // is a clean crossfade rather than a mushy double-fade zone.
      toggleActions: 'play reverse play reverse',
      animation: fadeTween || undefined,
      onToggle: (self) => {
        if (self.isActive && !entry.chapter) {
          entry.chapter = entry.factory(entry.canvas, entry.section);
          entry.chapter.init();
          entry.chapter.resize(window.innerWidth, window.innerHeight);
        }
        if (entry.chapter) entry.chapter.isActive = self.isActive;
        if (wrap) wrap.classList.toggle('is-active', self.isActive);
      },
    });
  }

  // Refresh once after all triggers exist so positions reflect final layout.
  ScrollTrigger.refresh();

  // Single global rAF — river first, then chapters layer on top.
  let last = performance.now();
  function frame(now) {
    const delta = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    updateCursor();
    river.tick(now / 1000, delta);
    registry.tick(now / 1000, delta);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Scroll → river forward flow.
  let lastScrollY = window.scrollY;
  window.addEventListener('scroll', () => {
    const cur = window.scrollY;
    const ds = cur - lastScrollY;
    lastScrollY = cur;
    river.onScroll(cur, ds);
  }, { passive: true });

  // Cursor world position → river.
  window.addEventListener('mousemove', (e) => {
    river.onMouseMove(e.clientX, e.clientY);
  }, { passive: true });

  // Debounced resize.
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      registry.resize(window.innerWidth, window.innerHeight);
      river.resize(window.innerWidth, window.innerHeight);
      ScrollTrigger.refresh();
    }, 150);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
