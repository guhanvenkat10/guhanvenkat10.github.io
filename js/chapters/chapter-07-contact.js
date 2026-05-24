import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { VisualChapter } from './base.js';

/**
 * Ch07 — Contact.
 * Typography-only chapter. Its job is to (a) animate the title, email,
 * and socials in with a clean staircase reveal, and (b) trigger the
 * Rainbow River's supernova on first entry — every other chapter has
 * been a movement, this is the resolution.
 */
export class ContactChapter extends VisualChapter {
  setupScene() {
    const prelude = this.container.querySelector('.contact-prelude');
    const title   = this.container.querySelector('.contact-title');
    const email   = this.container.querySelector('.contact-email');
    const socials = this.container.querySelector('.contact-socials');
    const foot    = this.container.querySelector('.contact-foot');

    /* Reveal timeline */
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: this.container,
        start: 'top 70%',
        once: true,
      },
    });
    tl.from(prelude, { opacity: 0, y: 12, duration: 0.8, ease: 'power2.out' })
      .from(title,   { opacity: 0, y: 32, duration: 1.3, ease: 'expo.out' }, '-=0.4')
      .from(email,   { opacity: 0, y: 12, duration: 0.8 }, '-=0.5')
      .from(socials, { opacity: 0, y: 12, duration: 0.8 }, '-=0.5')
      .from(foot,    { opacity: 0, y: 8,  duration: 0.6 }, '-=0.3');
    this.revealTl = tl;

    /* Detonate the global Rainbow River's supernova on first sight. */
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
    if (this.revealTl) {
      if (this.revealTl.scrollTrigger) this.revealTl.scrollTrigger.kill();
      this.revealTl.kill();
      this.revealTl = null;
    }
    if (this.supernovaTrigger) { this.supernovaTrigger.kill(); this.supernovaTrigger = null; }
  }
}
