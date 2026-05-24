/**
 * Drives the top-right chapter marker (01..07) based on the section that
 * currently dominates the viewport.
 */
export function initChapterMarker() {
  const marker = document.getElementById('chapter-marker');
  if (!marker) return;

  const sections = Array.from(document.querySelectorAll('[data-chapter]'));
  let current = sections[0]?.dataset.chapter || '01';
  marker.textContent = current;

  const update = () => {
    const mid = window.innerHeight * 0.45;
    let best = { dist: Infinity, target: sections[0] };
    for (const s of sections) {
      const rect = s.getBoundingClientRect();
      // Score: how close is the section's *upper third* to the viewport middle.
      const center = rect.top + Math.min(rect.height, window.innerHeight) * 0.5;
      const dist = Math.abs(center - mid);
      if (rect.bottom > 0 && rect.top < window.innerHeight && dist < best.dist) {
        best = { dist, target: s };
      }
    }
    const next = best.target?.dataset.chapter;
    if (next && next !== current) {
      current = next;
      marker.textContent = next;
    }
  };

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}
