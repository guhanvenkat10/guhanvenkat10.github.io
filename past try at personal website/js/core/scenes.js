/**
 * SceneRegistry — thin entries + per-frame tick container.
 *
 * Chapter activation is driven by ScrollTrigger in app.js (not by an
 * IntersectionObserver here). This module just registers chapters and
 * routes the global rAF tick to whichever chapters have isActive = true.
 */
export class SceneRegistry {
  constructor() {
    this.entries = [];
  }

  register({ id, section, canvas, factory }) {
    this.entries.push({
      id,
      section,
      canvas,
      factory,
      chapter: null,
    });
  }

  // No-op kept for API compatibility with previous callers.
  start() {}

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
