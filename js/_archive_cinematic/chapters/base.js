/**
 * VisualChapter — lifecycle contract for every chapter (WebGL or not).
 * The registry routes the global rAF tick to whichever chapters have
 * isActive = true. ScrollTrigger toggles isActive in app.js.
 */
export class VisualChapter {
  constructor(canvasElement, containerElement) {
    this.canvas = canvasElement;     /* may be null for typography-only chapters */
    this.container = containerElement;
    this.isActive = false;
  }

  init() {
    this.setupScene();
    this.addEventListeners();
  }

  setupScene() {}
  addEventListeners() {}
  removeEventListeners() {}
  resize(/* w, h */) {}
  tick(/* time, delta */) {}

  destroy() {
    this.isActive = false;
    this.removeEventListeners();
    /* Subclasses must dispose geometry/material/texture/renderer here. */
  }
}
