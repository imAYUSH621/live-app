// Universal animation player for gifts, entry effects and frames.
// Supports: Lottie (.json), SVGA (.svga), VAP-style 3D alpha video (.mp4, type 'vap') and plain video.
import { useEffect, useRef } from 'react';
import { playVap } from './vapPlayer.js';
import { assetUrl } from '../api.js';

const jsonCache = new Map();
let lottiePromise;
let svgaPromise;

export function loadLottie() {
  lottiePromise ||= import('lottie-web/build/player/lottie_svg').then((m) => m.default || m);
  return lottiePromise;
}
function loadSvga() {
  svgaPromise ||= import('svgaplayerweb').then((m) => m.default || m);
  return svgaPromise;
}
export function fetchJson(url) {
  if (!jsonCache.has(url)) jsonCache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error('anim'); return r.json(); }));
  return jsonCache.get(url);
}
// Warm the cache so big gifts start instantly (call when the gift list loads).
export function preload(urls) {
  for (const u of urls) if (u && u.endsWith('.json')) fetchJson(u).catch(() => {});
  loadLottie();
}

export function guessType(url, type) {
  if (type && type !== 'auto') return type;
  if (/\.svga($|\?)/i.test(url)) return 'svga';
  if (/\.(mp4|webm)($|\?)/i.test(url)) return 'video';
  return 'lottie';
}

export default function AnimPlayer({ src, type, loop = false, onDone, className, style, speed = 1 }) {
  const ref = useRef(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!src || !ref.current) return undefined;
    const el = ref.current;
    const finalSrc = assetUrl(src);
    const kind = guessType(finalSrc, type);
    let cancelled = false;
    let cleanup = () => {};
    const finish = () => { if (!cancelled) done.current?.(); };

    if (kind === 'lottie') {
      Promise.all([loadLottie(), fetchJson(finalSrc)]).then(([lottie, data]) => {
        if (cancelled) return;
        const a = lottie.loadAnimation({ container: el, renderer: 'svg', loop, autoplay: true, animationData: data,
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true } });
        a.setSpeed(speed);
        if (!loop) a.addEventListener('complete', finish);
        cleanup = () => a.destroy();
      }).catch(finish);
    } else if (kind === 'svga') {
      loadSvga().then((SVGA) => {
        if (cancelled) return;
        const player = new SVGA.Player(el);
        const parser = new SVGA.Parser(el);
        player.loops = loop ? 0 : 1;
        player.clearsAfterStop = true;
        player.onFinished(finish);
        parser.load(finalSrc, (item) => { if (!cancelled) { player.setVideoItem(item); player.startAnimation(); } }, finish);
        cleanup = () => { player.stopAnimation(); player.clear(); };
      }).catch(finish);
    } else if (kind === 'vap') {
      cleanup = playVap(el, finalSrc, { loop, onDone: finish });
    } else if (kind === 'video') {
      const v = document.createElement('video');
      Object.assign(v, { src: finalSrc, autoplay: true, muted: true, playsInline: true, loop });
      v.style.cssText = 'width:100%;height:100%;object-fit:contain';
      v.onended = finish;
      v.onerror = finish;
      el.appendChild(v);
      cleanup = () => v.remove();
    } else {
      setTimeout(finish, 1500);
    }
    return () => { cancelled = true; cleanup(); };
  }, [src, type, loop, speed]);

  return <div ref={ref} className={className} style={style} />;
}
