import * as THREE from 'three';

/**
 * Create a hidden <video> element wired up for autoplay/loop/muted/inline,
 * plus a Three.js VideoTexture pulling from it. Returns { video, texture }.
 * Caller is responsible for calling video.play() once user interaction or
 * chapter activation occurs (autoplay should work since muted).
 */
export function createVideoTexture(url, opts = {}) {
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.autoplay = true;
  video.preload = opts.preload ?? 'auto';
  video.style.display = 'none';
  /* attach so the browser actually loads & plays it */
  document.body.appendChild(video);

  /* Attempt autoplay — some browsers block until interaction; we'll retry on
     user gesture as a fallback. */
  const tryPlay = () => video.play().catch(() => {});
  video.addEventListener('canplay', tryPlay, { once: true });
  document.addEventListener('pointerdown', tryPlay, { once: true });

  const texture = new THREE.VideoTexture(video);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.format = THREE.RGBAFormat;
  texture.colorSpace = THREE.SRGBColorSpace;

  return { video, texture };
}
