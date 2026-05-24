/**
 * SceneRegistry — thin entries + per-frame tick container.
 * Chapter activation is driven by ScrollTrigger in app.js (lazy init on
 * first enter, isActive flag flipped on each toggle). This module just
 * routes the global rAF tick to active chapters.
 */
export class SceneRegistry {
  constructor() {
    this.entries = [];
  }

  register({ id, section, canvas, factory, eager = false }) {
    this.entries.push({
      id,
      section,
      canvas,
      factory,
      eager,
      chapter: null,
    });
  }

  start() { /* no-op — kept for API symmetry */ }

  tick(time, delta) {
    for (const e of this.entries) {
      if (e.chapter && e.chapter.isActive) {
        e.chapter.tick(time, delta);
      }
    }
  }

  resize(width, height) {
    for (const e of this.entries) {
      if (e.chapter) e.chapter.resize(width, height);
    }
  }
}
