import { useEffect, useRef } from 'react';

type Dot = {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  phase: number;
  driftRadius: number;
  driftSpeed: number;
  radius: number;
  alpha: number;
  depth: number;
  teal: boolean;
};

type TrailDot = { x: number; y: number; createdAt: number };
type Ripple = { x: number; y: number; createdAt: number };

function dotCount(width: number) {
  if (width < 768) return 80;
  if (width < 1280) return 110;
  return 180;
}

export function HeroDotField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = canvas?.parentElement;
    const context = canvas?.getContext('2d');
    if (!canvas || !hero || !context) return;
    const activeCanvas = canvas as HTMLCanvasElement;
    const activeHero = hero as HTMLElement;
    const activeContext = context as CanvasRenderingContext2D;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastFrameAt = 0;
    let visible = true;
    let dots: Dot[] = [];
    let trails: TrailDot[] = [];
    let ripples: Ripple[] = [];
    let pointer = { x: -1000, y: -1000, active: false, down: false, held: false };
    let pointerStart = { x: -1000, y: -1000, time: 0 };
    let lastPointer = { x: -1000, y: -1000 };
    let holdTimer = 0;

    const blockedRects = () => {
      const heroRect = activeHero.getBoundingClientRect();
      return Array.from(activeHero.querySelectorAll<HTMLElement>('.hero-copy, .status-card'))
        .map((element) => element.getBoundingClientRect())
        .map((rect) => ({
          left: rect.left - heroRect.left - 12,
          right: rect.right - heroRect.left + 12,
          top: rect.top - heroRect.top - 10,
          bottom: rect.bottom - heroRect.top + 10,
        }));
    };

    function isBlocked(x: number, y: number, exclusions: ReturnType<typeof blockedRects>) {
      return exclusions.some((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
    }

    function resize() {
      const rect = activeHero.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      activeCanvas.width = Math.round(width * pixelRatio);
      activeCanvas.height = Math.round(height * pixelRatio);
      activeCanvas.style.width = `${width}px`;
      activeCanvas.style.height = `${height}px`;
      activeContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      dots = Array.from({ length: dotCount(window.innerWidth) }, (_, index) => {
        const depth = index % 3;
        const x = Math.random() * width;
        const y = Math.random() * height;
        const size = depth === 0 ? 2 : depth === 1 ? 3 : 4 + Math.random();
        const alpha = depth === 0
          ? 0.25 + Math.random() * 0.1
          : depth === 1
            ? 0.4 + Math.random() * 0.15
            : 0.6 + Math.random() * 0.15;
        return {
          x,
          y,
          homeX: x,
          homeY: y,
          vx: 0,
          vy: 0,
          phase: Math.random() * Math.PI * 2,
          driftRadius: 2 + depth * 1.4 + Math.random() * 0.8,
          driftSpeed: 0.24 + depth * 0.12 + Math.random() * 0.06,
          radius: size / 2,
          alpha,
          depth,
          teal: index % 12 === 0,
        };
      });
      trails = [];
      ripples = [];
      draw(performance.now(), true);
    }

    function drawLines(visibleDots: Dot[]) {
      if (width < 1280) return;
      for (let first = 0; first < visibleDots.length; first += 1) {
        for (let second = first + 1; second < visibleDots.length; second += 1) {
          const a = visibleDots[first];
          const b = visibleDots[second];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance >= 110) continue;
          const alpha = 0.12 + (1 - distance / 110) * 0.06;
          activeContext.beginPath();
          activeContext.moveTo(a.x, a.y);
          activeContext.lineTo(b.x, b.y);
          activeContext.strokeStyle = `rgba(24, 48, 41, ${alpha})`;
          activeContext.lineWidth = 0.7;
          activeContext.stroke();
        }
      }
    }

    function draw(now: number, staticOnly = false, delta = 1) {
      activeContext.clearRect(0, 0, width, height);
      if (!dots.length) return;

      const exclusions = blockedRects();
      const seconds = now / 1000;
      const visibleDots: Dot[] = [];
      trails = trails.filter((trail) => now - trail.createdAt < 300);
      ripples = ripples.filter((ripple) => now - ripple.createdAt < 800);

      dots.forEach((dot) => {
        if (!staticOnly && !reducedMotion.matches) {
          const targetX = dot.homeX + Math.sin(seconds * dot.driftSpeed + dot.phase) * dot.driftRadius;
          const targetY = dot.homeY + Math.cos(seconds * dot.driftSpeed * 0.76 + dot.phase) * dot.driftRadius;
          dot.vx += (targetX - dot.x) * 0.008 * delta;
          dot.vy += (targetY - dot.y) * 0.008 * delta;

          if (pointer.active) {
            const dx = dot.x - pointer.x;
            const dy = dot.y - pointer.y;
            const distance = Math.hypot(dx, dy);
            if (distance < 150 && !pointer.held) {
              const angleX = distance < 0.01 ? Math.cos(dot.phase) : dx / distance;
              const angleY = distance < 0.01 ? Math.sin(dot.phase) : dy / distance;
              const falloff = (1 - distance / 150) ** 2;
              const push = falloff * (0.45 + dot.depth * 0.18);
              dot.vx += angleX * push * delta;
              dot.vy += angleY * push * delta;
            }
            if (pointer.held && distance < 220) {
              const attraction = (1 - distance / 220) ** 2;
              dot.vx -= dx * 0.0045 * attraction * delta;
              dot.vy -= dy * 0.0045 * attraction * delta;
            }
          }

          const damping = Math.pow(0.93, delta);
          dot.vx *= damping;
          dot.vy *= damping;
          dot.x += dot.vx * delta;
          dot.y += dot.vy * delta;
        }
        if (!isBlocked(dot.x, dot.y, exclusions)) visibleDots.push(dot);
      });

      if (!staticOnly && !reducedMotion.matches) drawLines(visibleDots);

      trails.forEach((trail) => {
        const age = (now - trail.createdAt) / 300;
        if (isBlocked(trail.x, trail.y, exclusions)) return;
        activeContext.beginPath();
        activeContext.arc(trail.x, trail.y, 1.6, 0, Math.PI * 2);
        activeContext.fillStyle = `rgba(0, 128, 106, ${0.2 * (1 - age)})`;
        activeContext.fill();
      });

      if (!staticOnly && !reducedMotion.matches) {
        ripples.forEach((ripple) => {
          const age = (now - ripple.createdAt) / 800;
          const radius = 10 + age * 92;
          activeContext.beginPath();
          activeContext.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
          activeContext.strokeStyle = `rgba(0, 128, 106, ${0.34 * (1 - age)})`;
          activeContext.lineWidth = 1.25;
          activeContext.stroke();
        });
      }

      visibleDots.forEach((dot) => {
        const distance = pointer.active ? Math.hypot(dot.x - pointer.x, dot.y - pointer.y) : Infinity;
        const proximity = !staticOnly && !reducedMotion.matches && distance < 150
          ? (1 - distance / 150) * 0.3
          : 0;
        const radius = dot.radius * (1 + proximity);
        const baseColor = dot.teal ? '0, 128, 106' : '30, 30, 30';
        const color = dot.teal ? baseColor : `${Math.round(30 - proximity * 42)}, ${Math.round(30 - proximity * 42)}, ${Math.round(30 - proximity * 42)}`;
        activeContext.beginPath();
        activeContext.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
        activeContext.fillStyle = `rgba(${color}, ${dot.alpha})`;
        activeContext.fill();
      });
    }

    function animate(now: number) {
      if (!visible || document.hidden || reducedMotion.matches) return;
      frame = window.requestAnimationFrame(animate);
      if (now - lastFrameAt < 1000 / 60) return;
      const delta = lastFrameAt ? Math.min((now - lastFrameAt) / (1000 / 60), 2) : 1;
      lastFrameAt = now;
      draw(now, false, delta);
    }

    function pointFromEvent(event: PointerEvent) {
      const rect = activeHero.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function onPointerMove(event: PointerEvent) {
      if (reducedMotion.matches) return;
      const next = pointFromEvent(event);
      const distance = Math.hypot(next.x - lastPointer.x, next.y - lastPointer.y);
      if (pointer.active && distance > 9) {
        trails.push({ ...lastPointer, createdAt: performance.now() });
        if (trails.length > 18) trails.shift();
      }
      pointer = { ...pointer, ...next, active: true };
      lastPointer = next;
    }

    function onPointerDown(event: PointerEvent) {
      if (reducedMotion.matches || event.button > 0) return;
      const start = pointFromEvent(event);
      pointer = { ...pointer, ...start, active: true, down: true, held: false };
      pointerStart = { ...start, time: performance.now() };
      window.clearTimeout(holdTimer);
      holdTimer = window.setTimeout(() => {
        pointer = { ...pointer, held: true };
      }, 220);
    }

    function onPointerUp(event: PointerEvent, cancelled = false) {
      if (!pointer.down) return;
      window.clearTimeout(holdTimer);
      const end = pointFromEvent(event);
      const distance = Math.hypot(end.x - pointerStart.x, end.y - pointerStart.y);
      const wasHeld = pointer.held;
      pointer = { ...pointer, ...end, down: false, held: false };
      if (!cancelled && !wasHeld && distance < 12) {
        ripples.push({ ...end, createdAt: performance.now() });
        if (ripples.length > 3) ripples.shift();
        dots.forEach((dot) => {
          const dx = dot.x - end.x;
          const dy = dot.y - end.y;
          const radius = Math.hypot(dx, dy);
          if (radius > 0 && radius < 145) {
            const impulse = (1 - radius / 145) * 6;
            dot.vx += dx / radius * impulse;
            dot.vy += dy / radius * impulse;
          }
        });
      }
    }

    function onPointerCancel(event: PointerEvent) {
      onPointerUp(event, true);
    }

    function onPointerLeave() {
      if (pointer.down) return;
      pointer = { ...pointer, x: -1000, y: -1000, active: false };
      lastPointer = { x: -1000, y: -1000 };
    }

    function onVisibilityChange() {
      if (document.hidden) {
        window.cancelAnimationFrame(frame);
      } else if (visible && !reducedMotion.matches) {
        lastFrameAt = 0;
        frame = window.requestAnimationFrame(animate);
      }
    }

    function onIntersection(entries: IntersectionObserverEntry[]) {
      visible = entries[0]?.isIntersecting ?? false;
      if (!visible) {
        window.cancelAnimationFrame(frame);
      } else if (!document.hidden && !reducedMotion.matches) {
        lastFrameAt = 0;
        frame = window.requestAnimationFrame(animate);
      }
    }

    function onMotionChange() {
      window.cancelAnimationFrame(frame);
      pointer = { x: -1000, y: -1000, active: false, down: false, held: false };
      if (reducedMotion.matches) {
        draw(performance.now(), true);
      } else if (visible && !document.hidden) {
        lastFrameAt = 0;
        frame = window.requestAnimationFrame(animate);
      }
    }

    const intersectionObserver = new IntersectionObserver(onIntersection, { threshold: 0 });
    const resizeObserver = new ResizeObserver(resize);
    intersectionObserver.observe(activeHero);
    resizeObserver.observe(activeHero);
    resize();
    if (!reducedMotion.matches) frame = window.requestAnimationFrame(animate);

    activeHero.addEventListener('pointermove', onPointerMove, { passive: true });
    activeHero.addEventListener('pointerdown', onPointerDown);
    activeHero.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    document.addEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.addEventListener('change', onMotionChange);

    return () => {
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frame);
      window.clearTimeout(holdTimer);
      activeHero.removeEventListener('pointermove', onPointerMove);
      activeHero.removeEventListener('pointerdown', onPointerDown);
      activeHero.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reducedMotion.removeEventListener('change', onMotionChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />;
}
