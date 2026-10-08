import '@fontsource/pixelify-sans/700.css';
import { clamp } from 'es-toolkit';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { config, jobs } from '../../../wailsjs/go/models';
import { STOREY } from './build';
import { cameraRig, typing, type View } from './camera';
import { reducedMotion } from './figure';
import { buildFloor, fitSun, type Floor } from './floor';
import { npcCrowd } from './npcs';
import { people, type AgentHit } from './people';
import { agentFigures } from './walkers';
import { buildWorld, SKY } from './world';

export type { AgentHit, View };

type OfficeMapProps = {
  departments: config.Department[];
  jobs?: jobs.Job[];
  view: View;
  places?: config.Place[];
  npcs?: config.NPC[];
  onAgent: (hit: AgentHit, at: { x: number; y: number }) => void;
};

const RISE_MS = 900;

type Controls = {
  setPeople: (list: jobs.Job[]) => void;
  viewChanged: () => void;
  sit: () => void;
  setDepartments: (departments: config.Department[]) => void;
};

export default function OfficeMap({ departments, jobs: list = [], view, places = [], npcs: npcList = [], onAgent }: OfficeMapProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [seated, setSeated] = useState(true);
  const viewRef = useRef(view);
  viewRef.current = view;
  const placesRef = useRef(places);
  placesRef.current = places;
  const npcListRef = useRef(npcList);
  npcListRef.current = npcList;
  const cast = JSON.stringify([places, npcList]);
  const handlers = useRef({ onAgent });
  handlers.current = { onAgent };
  const controls = useRef<Controls | null>(null);

  // Only what the floor draws, so it is not rebuilt on every refresh.
  const shape = JSON.stringify(departments.map((d) => [d.key, d.name, d.colour, d.order, (d.agents ?? []).map((a) => a.desks)]));
  const latest = useRef(departments);
  latest.current = departments;

  useEffect(() => {
    const element = wrap.current;
    if (!element) return undefined;
    // Plain depth buffer (not logarithmic) keeps early-z; near plane 0.1 keeps precision for the street 140 m below.
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.domElement.className = 'absolute inset-0 size-full cursor-grab';
    renderer.domElement.setAttribute('aria-label', 'Your floor of the office tower in 3D');
    element.prepend(renderer.domElement);
    const canvas = renderer.domElement;

    const world = buildWorld();
    // Gives metal, glass and polished floors something to reflect.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    world.scene.environment = environment;
    world.scene.environmentIntensity = 0.3;
    let floor: Floor | null = null;
    let known: Set<string> | null = null;
    const rising = new Map<string, number>();
    let last = performance.now();
    let raf = 0;
    const ray = new THREE.Raycaster();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 800);
    const rig = cameraRig(camera, () => viewRef.current, () => [...world.obstacles, ...(floor?.obstacles ?? [])], setSeated);

    const open = (hit: AgentHit, e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      handlers.current.onAgent(hit, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    const walkers = agentFigures(world.scene, element, open);
    const npcs = npcCrowd(world.scene, element, () => floor, walkers.namesNear);

    const frame = (now: number) => {
      // rAF timestamps can trail performance.now(); a negative dt would push the easing outwards for good.
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      const atDesk = viewRef.current === 'desk';
      world.you.visible = !atDesk;
      if (floor) {
        floor.ceiling.visible = atDesk;
        for (const [key, start] of rising) {
          const room = floor.rooms.get(key);
          const p = Math.min(1, (now - start) / RISE_MS);
          if (room) room.group.position.y = -STOREY * Math.pow(1 - p, 3);
          if (p >= 1) rising.delete(key);
        }
      }
      walkers.update(dt, now);
      rig.update(dt, now);
      renderer.render(world.scene, camera);
      walkers.label(camera, element.clientWidth, element.clientHeight);
      npcs.move(dt, now);
      npcs.label(camera, element.clientWidth, element.clientHeight, now);
      raf = requestAnimationFrame(frame);
    };

    const setDepartments = (next: config.Department[]) => {
      if (floor) {
        world.scene.remove(floor.group);
        floor.dispose();
      }
      floor = buildFloor(next, placesRef.current);
      world.scene.add(floor.group);
      npcs.place(floor, npcListRef.current);
      const keysNow = new Set(next.map((d) => d.key));
      if (known && !reducedMotion()) for (const key of keysNow) if (!known.has(key)) rising.set(key, performance.now());
      known = keysNow;
      rig.frame(floor.plan);
      fitSun(world.sun, floor);
    };

    const resize = () => {
      // Capped at 1.5: with anti-aliasing it looks the same as 2 and draws about half the pixels.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(element.clientWidth, element.clientHeight, false);
      camera.aspect = element.clientWidth / Math.max(1, element.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    const pick = (e: PointerEvent) => {
      if (!floor) return undefined;
      const rect = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
      return walkers.pick(ray);
    };

    let drag: { x: number; y: number; moved: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) {
        canvas.style.cursor = pick(e) ? 'pointer' : '';
        return;
      }
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      drag.x = e.clientX;
      drag.y = e.clientY;
      rig.drag(dx, dy);
    };
    const onUp = (e: PointerEvent) => {
      const clicked = drag && !drag.moved;
      drag = null;
      if (!clicked) return;
      const hit = pick(e);
      if (hit) open(hit, e);
    };
    const onCancel = () => {
      drag = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (viewRef.current !== 'bird') return;
      e.preventDefault();
      rig.zoom(e.deltaY);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyH' && !typing(e.target)) walkers.toggleHits();
      else rig.press(e);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', rig.release);
    window.addEventListener('blur', rig.stop);

    controls.current = {
      viewChanged: rig.viewChanged,
      sit: rig.sit,
      setDepartments,
      setPeople: (next) => {
        if (floor) walkers.set(people(floor.plan, next));
      },
    };
    setDepartments(latest.current);
    // Plaques are painted on canvases; repaint them once the pixel font has loaded.
    let alive = true;
    document.fonts?.load('700 64px "Pixelify Sans"').then(() => alive && setDepartments(latest.current));
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', rig.release);
      window.removeEventListener('blur', rig.stop);
      controls.current = null;
      walkers.dispose();
      npcs.dispose();
      floor?.dispose();
      world.dispose();
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  useEffect(() => {
    controls.current?.setDepartments(latest.current);
  }, [shape, cast]);

  const presence = JSON.stringify(list.map((run) => [run.id, run.state, run.doing, run.progress?.find((step) => step.status === 'active')?.name]));
  useEffect(() => {
    controls.current?.setPeople(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- presence covers what people() reads from the jobs
  }, [presence, shape]);

  useEffect(() => {
    controls.current?.viewChanged();
  }, [view]);

  return (
    <div ref={wrap} className="absolute inset-0 touch-none overflow-hidden select-none" style={{ background: SKY }}>
      {view === 'desk' && !seated && (
        <button type="button" className="absolute top-3 left-3 rounded-md bg-background/80 px-2 py-1 text-xs hover:bg-background" onClick={() => controls.current?.sit()}>
          Sit back down
        </button>
      )}

      <p className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground">
        {view === 'bird' ? 'Drag to turn · scroll to zoom · click an agent' : 'Drag to look · WASD or arrow keys to walk · click an agent'}
      </p>
    </div>
  );
}
