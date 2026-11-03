import { useEffect, useRef } from 'react';

type Dash = {
  baseX: number;
  baseY: number;
  baseAngle: number;
  length: number;
  depth: number;
  color: string;
  phase: number;
  speed: number;
  offsetX: number;
  offsetY: number;
  angle: number;
};

const colors = ['rgba(0,128,106,.4)', 'rgba(150,180,0,.62)', 'rgba(11,79,66,.28)'];
const lengths = [5, 8, 8, 11];
const pullRadius = 220;

function createDashes(count: number): Dash[] {
  // Fixed seed so the pattern looks the same on every visit.
  let seed = 7;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, (_, index) => {
    const baseAngle = next() * Math.PI - Math.PI / 2;
    return {
      baseX: next(),
      baseY: next(),
      baseAngle,
      length: lengths[index % lengths.length],
      depth: 0.3 + next() * 0.9,
      color: colors[Math.floor(next() * colors.length)],
      phase: next() * Math.PI * 2,
      speed: 0.35 + next() * 0.4,
      offsetX: 0,
      offsetY: 0,
      angle: baseAngle,
    };
  });
}

function shortestAngle(from: number, to: number) {
  return ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

/**
 * Small strokes drawn on a canvas behind the hero. They drift on their own,
 * shift with depth as the cursor moves, and the ones near the cursor turn to
 * face it and lean towards it.
 */
export function HeroDashes() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = canvas?.parentElement;
    const context = canvas?.getContext('2d');
    if (!canvas || !hero || !context) return;
    const ctx = context;
    const surface = canvas;
    const heroElement = hero;

    const finePointer = window.matchMedia('(pointer: fine)').matches;
    // Without a mouse there is nothing for the lines to follow, so phones get a
    // single still frame instead of a loop that would compete with scrolling.
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches || !finePointer;
    const dashes = createDashes(window.innerWidth < 768 ? 40 : 76);

    let width = 0;
    let height = 0;
    let frame = 0;
    let lastTime = 0;
    let inView = true;
    const pointer = { x: 0, y: 0, active: false };
    const smooth = { x: 0.5, y: 0.5 };

    const resize = () => {
      const rect = heroElement.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      surface.width = Math.round(width * ratio);
      surface.height = Math.round(height * ratio);
      surface.style.width = `${width}px`;
      surface.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineWidth = 2;
    };

    const draw = (time: number) => {
      const elapsed = lastTime ? Math.min(time - lastTime, 50) : 16;
      lastTime = time;
      const ease = 1 - Math.exp(-elapsed / 90);
      const turn = 1 - Math.exp(-elapsed / 140);
      const seconds = time / 1000;

      // The cursor itself is smoothed too, so fast flicks still glide.
      const goalX = pointer.active ? pointer.x / width : 0.5;
      const goalY = pointer.active ? pointer.y / height : 0.5;
      smooth.x += (goalX - smooth.x) * ease;
      smooth.y += (goalY - smooth.y) * ease;
      const cursorX = smooth.x * width;
      const cursorY = smooth.y * height;

      ctx.clearRect(0, 0, width, height);
      for (const dash of dashes) {
        const baseX = dash.baseX * width;
        const baseY = dash.baseY * height;
        const driftX = reducedMotion ? 0 : Math.sin(seconds * dash.speed + dash.phase) * 6;
        const driftY = reducedMotion ? 0 : Math.cos(seconds * dash.speed * 0.8 + dash.phase) * 6;

        let targetX = (smooth.x - 0.5) * dash.depth * 90;
        let targetY = (smooth.y - 0.5) * dash.depth * 90;
        let targetAngle = dash.baseAngle + (reducedMotion ? 0 : Math.sin(seconds * 0.3 + dash.phase) * 0.25);

        if (pointer.active) {
          const dx = cursorX - baseX;
          const dy = cursorY - baseY;
          const distance = Math.hypot(dx, dy);
          if (distance < pullRadius) {
            const strength = (1 - distance / pullRadius) ** 2;
            targetX += (dx / (distance || 1)) * strength * 28;
            targetY += (dy / (distance || 1)) * strength * 28;
            targetAngle += shortestAngle(targetAngle, Math.atan2(dy, dx)) * Math.min(1, strength * 2.2);
          }
        }

        dash.offsetX += (targetX - dash.offsetX) * ease;
        dash.offsetY += (targetY - dash.offsetY) * ease;
        dash.angle += shortestAngle(dash.angle, targetAngle) * turn;

        const x = baseX + driftX + dash.offsetX;
        const y = baseY + driftY + dash.offsetY;
        const half = dash.length / 2;
        const cos = Math.cos(dash.angle) * half;
        const sin = Math.sin(dash.angle) * half;
        ctx.strokeStyle = dash.color;
        ctx.beginPath();
        ctx.moveTo(x - cos, y - sin);
        ctx.lineTo(x + cos, y + sin);
        ctx.stroke();
      }

      frame = !reducedMotion && inView && !document.hidden ? window.requestAnimationFrame(draw) : 0;
    };

    const start = () => {
      if (!frame && !reducedMotion && inView && !document.hidden) {
        lastTime = 0;
        frame = window.requestAnimationFrame(draw);
      }
    };
    const onMove = (event: PointerEvent) => {
      const rect = heroElement.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
    };
    const onLeave = () => { pointer.active = false; };
    const onVisibility = () => start();

    resize();
    if (reducedMotion) {
      draw(0);
    } else {
      start();
    }

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reducedMotion) draw(0);
    });
    resizeObserver.observe(heroElement);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      start();
    });
    visibilityObserver.observe(heroElement);
    if (finePointer) {
      heroElement.addEventListener('pointermove', onMove, { passive: true });
      heroElement.addEventListener('pointerleave', onLeave);
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      heroElement.removeEventListener('pointermove', onMove);
      heroElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="hero-dashes" aria-hidden="true" />;
}
