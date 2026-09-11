import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

/** How many pieces, and how long the shower lasts. */
const COUNT = 150;
const LIFE_MS = 2800;

interface Piece {
  x: number; y: number; vx: number; vy: number;
  w: number; h: number; rot: number; spin: number; color: string;
}

/**
 * A short shower of confetti for the winner, drawn on a canvas over the
 * result. Colours come from the theme's own tokens. Nothing is drawn under
 * reduced motion, and the canvas leaves the tree as soon as it is done.
 */
export function Confetti({ on }: { on: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!on || reduced || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const style = getComputedStyle(canvas);
    const colors = ['--hydro', '--signal', '--right', '--hydro-2', '--m2']
      .map((v) => style.getPropertyValue(v).trim())
      .filter(Boolean);
    if (!colors.length) colors.push('#1C5A56');

    // Two bursts, one from each bottom corner, crossing in the middle.
    const pieces: Piece[] = Array.from({ length: COUNT }, (_, i) => {
      const left = i % 2 === 0;
      const a = (left ? -70 : -110) + (Math.random() - 0.5) * 50;
      const speed = 11 + Math.random() * 9;
      return {
        x: left ? w * 0.1 : w * 0.9,
        y: h + 10,
        vx: Math.cos((a * Math.PI) / 180) * speed,
        vy: Math.sin((a * Math.PI) / 180) * speed,
        w: 5 + Math.random() * 5,
        h: 8 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        color: colors[i % colors.length],
      };
    });

    let raf = 0;
    let last = performance.now();
    const t0 = last;
    const step = (t: number) => {
      const dt = Math.min(2, (t - last) / 16.7);
      last = t;
      const age = t - t0;
      ctx.clearRect(0, 0, w, h);
      const fade = age > LIFE_MS - 700 ? Math.max(0, (LIFE_MS - age) / 700) : 1;
      ctx.globalAlpha = fade;
      for (const p of pieces) {
        p.vy += 0.28 * dt;
        p.vx *= 0.99;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (age < LIFE_MS) raf = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on, reduced]);

  if (!on || reduced) return null;
  return <canvas ref={ref} className="vs-confetti" aria-hidden="true" />;
}
