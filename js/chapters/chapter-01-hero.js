import gsap from 'gsap';
import { VisualChapter } from './base.js';

/**
 * Ch01 — Hero. Typography only; the global River paints behind it.
 * Splits each line into <span class="char"> and staggers them in,
 * then fades the subtitle, meta, and scroll hint.
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
    const meta = this.container.querySelector('.hero-meta');
    const scrollHint = this.container.querySelector('.hero-scroll');

    this.introTl = gsap.timeline({ delay: 0.25 });
    this.introTl
      .to(chars, {
        opacity: 1,
        y: 0,
        duration: 1.0,
        ease: 'expo.out',
        stagger: 0.038,
      })
      .to(meta, { opacity: 1, duration: 0.7, ease: 'power2.out' }, '-=0.6')
      .to(sub, {
        opacity: 1,
        y: 0,
        duration: 0.7,
        ease: 'power2.out',
      }, '-=0.45')
      .to(scrollHint, { opacity: 1, duration: 0.5 }, '-=0.2');
  }

  destroy() {
    super.destroy();
    if (this.introTl) { this.introTl.kill(); this.introTl = null; }
  }
}
