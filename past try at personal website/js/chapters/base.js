/**
 * VisualChapter — exact lifecycle contract from the directive.
 * Every chapter (WebGL or not) extends this; the registry treats all
 * chapters uniformly through these hooks.
 */
export class VisualChapter {
  constructor(canvasElement, containerElement) {
    this.canvas = canvasElement;
    this.container = containerElement;
    this.isActive = false;
  }

  init() {
    this.isActive = true;
    this.setupScene();
    this.addEventListeners();
  }

  setupScene() {}
  addEventListeners() {}
  removeEventListeners() {}
  resize(width, height) {}
  tick(time, delta) { if (!this.isActive) return; }

  destroy() {
    this.isActive = false;
    this.removeEventListeners();
    // Subclasses must dispose geometry/material/texture/renderer here.
  }
}
