import gsap from 'gsap';
import { VisualChapter } from './base.js';

/**
 * Hero (Ch01) — typography only.
 * The Rainbow River's curve head sits at the top of the page and serves
 * as the "singularity" itself. No chapter-local WebGL is needed.
 */
export class HeroChapter extends VisualChapter {
  setupScene() {
    const lines = this.container.querySelectorAll('.hero-line');
    lines.forEach((line) => {
      const text = line.dataset.text || line.textContent;
      line.innerHTML = '';
      for (const ch of text) {
        const span = document.createElement('span');
        span.className = 'char';
        span.textContent = ch;
        line.appendChild(span);
      }
    });

    const chars = this.container.querySelectorAll('.hero-line .char');
    const sub = this.container.querySelector('.hero-subtitle');

    this.introTl = gsap.timeline({ delay: 0.15 });
    this.introTl.to(chars, {
      opacity: 1,
      y: 0,
      duration: 0.9,
      ease: 'power3.out',
      stagger: 0.04,
    });
    if (sub) {
      this.introTl.to(sub, {
        opacity: 0.7,
        y: 0,
        duration: 0.7,
        ease: 'power2.out',
      }, '>0.0');
    }
  }

  destroy() {
    super.destroy();
    if (this.introTl) { this.introTl.kill(); this.introTl = null; }
  }
}
