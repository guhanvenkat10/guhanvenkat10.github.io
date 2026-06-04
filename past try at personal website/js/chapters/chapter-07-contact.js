import ScrollTrigger from 'gsap/ScrollTrigger';
import { VisualChapter } from './base.js';

/**
 * Contact — CSS handles the underline interaction. The chapter's job in this
 * refactor is to detonate the global Rainbow River's supernova when the
 * section comes into view.
 */
export class ContactChapter extends VisualChapter {
  setupScene() {
    // Fire-once trigger; the river guards against double-trigger internally.
    this.supernovaTrigger = ScrollTrigger.create({
      trigger: this.container,
      start: 'top 60%',
      once: true,
      onEnter: () => {
        if (window.__river && typeof window.__river.triggerSupernova === 'function') {
          window.__river.triggerSupernova();
        }
      },
    });
  }

  destroy() {
    super.destroy();
    if (this.supernovaTrigger) { this.supernovaTrigger.kill(); this.supernovaTrigger = null; }
  }
}
