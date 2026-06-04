import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import { VisualChapter } from './base.js';

export class AboutChapter extends VisualChapter {
  setupScene() {
    const lines = this.container.querySelectorAll('.about-line > span');
    const metas = this.container.querySelectorAll('.about-meta');

    this.timeline = gsap.timeline({
      scrollTrigger: {
        trigger: this.container,
        start: 'top 80%',
        end: 'bottom 20%',
        scrub: 0.4,
      },
    });

    lines.forEach((line, i) => {
      this.timeline.to(line, {
        y: '0%',
        duration: 0.8,
        ease: 'power3.out',
      }, i * 0.20);
    });

    this.timeline.to(metas, {
      opacity: 0.55,
      duration: 0.5,
      stagger: 0.12,
    }, '>0.1');
  }

  destroy() {
    super.destroy();
    if (this.timeline) {
      if (this.timeline.scrollTrigger) this.timeline.scrollTrigger.kill();
      this.timeline.kill();
      this.timeline = null;
    }
  }
}
