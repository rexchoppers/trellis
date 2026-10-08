import { clamp } from 'es-toolkit';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';

// Fits to width (never below readable) and refits on resize until the user moves it.
export function usePanZoom(width: number) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const moved = useRef(false);
  const fit = useCallback(() => {
    const el = box.current;
    if (!el || !el.clientWidth) return;
    const k = clamp(el.clientWidth / width, 0.5, 1);
    setView({ x: Math.max(0, (el.clientWidth - width * k) / 2), y: 0, k });
    moved.current = false;
  }, [width]);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => !moved.current && fit());
    observer.observe(el);
    fit();
    return () => observer.disconnect();
  }, [fit]);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      moved.current = true;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        setView((v) => {
          const k = clamp(v.k * Math.exp(-e.deltaY * 0.01), 0.3, 2);
          return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
        });
      } else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  // A press only becomes a drag once it moves a few pixels, so clicking a label still works.
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; far: boolean } | null>(null);
  const dragged = useRef(false);
  const [grabbing, setGrabbing] = useState(false);
  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, far: false };
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.far) {
        if (Math.hypot(dx, dy) < 4) return;
        d.far = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        setGrabbing(true);
      }
      moved.current = true;
      setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
    },
    onPointerUp: () => {
      dragged.current = drag.current?.far ?? false;
      drag.current = null;
      setGrabbing(false);
    },
    onPointerCancel: () => {
      drag.current = null;
      setGrabbing(false);
    },
    onClickCapture: (e: MouseEvent<HTMLDivElement>) => {
      if (dragged.current) {
        e.stopPropagation();
        e.preventDefault();
      }
      dragged.current = false;
    },
  };
  return { box, view, fit, grabbing, handlers };
}
