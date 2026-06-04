/**
 * Custom cursor — lime dot + lagging ring.
 * Returns an updateCursor() fn that the global rAF calls each frame.
 */
const DOT_LERP = 0.55;
const RING_LERP = 0.16;
const HOVERABLE = 'a, button, [role="button"], .contact-email';

export function initCursor() {
  const dot = document.querySelector('.cursor-dot');
  const ring = document.querySelector('.cursor-ring');
  if (!dot || !ring) return () => {};

  const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const dPos = { x: mouse.x, y: mouse.y };
  const rPos = { x: mouse.x, y: mouse.y };

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }, { passive: true });

  /* Delegated hover detection — works for elements added after load. */
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest && e.target.closest(HOVERABLE)) {
      ring.classList.add('is-hover');
    }
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest && e.target.closest(HOVERABLE)) {
      const related = e.relatedTarget;
      if (!related || !related.closest || !related.closest(HOVERABLE)) {
        ring.classList.remove('is-hover');
      }
    }
  });

  /* Release on blur — prevents a stuck hover when tab changes. */
  window.addEventListener('blur', () => ring.classList.remove('is-hover'));

  return function updateCursor() {
    dPos.x += (mouse.x - dPos.x) * DOT_LERP;
    dPos.y += (mouse.y - dPos.y) * DOT_LERP;
    rPos.x += (mouse.x - rPos.x) * RING_LERP;
    rPos.y += (mouse.y - rPos.y) * RING_LERP;
    dot.style.transform = `translate3d(${dPos.x}px, ${dPos.y}px, 0) translate(-50%, -50%)`;
    ring.style.transform = `translate3d(${rPos.x}px, ${rPos.y}px, 0) translate(-50%, -50%)`;
  };
}
