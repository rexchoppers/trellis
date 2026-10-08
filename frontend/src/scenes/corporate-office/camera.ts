import { clamp } from 'es-toolkit';
import * as THREE from 'three';
import type { Obstacle } from './build';
import { reducedMotion } from './figure';
import type { Plan } from './plan';
import { SEAT } from './world';

export type View = 'bird' | 'desk';

const RADIUS = 0.28;
const EYE_SEATED = 1.22;
const EYE_STANDING = 1.6;
const MOVE_KEYS: Record<string, string> = {
  KeyW: 'w',
  ArrowUp: 'w',
  KeyS: 's',
  ArrowDown: 's',
  KeyA: 'a',
  ArrowLeft: 'a',
  KeyD: 'd',
  ArrowRight: 'd',
  KeyE: 'up',
  KeyQ: 'down',
  ShiftLeft: 'fast',
  ShiftRight: 'fast',
};

export const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function cameraRig(camera: THREE.PerspectiveCamera, view: () => View, obstacles: () => Obstacle[], onSeated: (seated: boolean) => void) {
  // zoom is relative to the distance that fits the floor, so resizing keeps it framed.
  const bird = {
    yaw: 0.78,
    pitch: 0.72,
    zoom: 1,
    target: new THREE.Vector3(),
  };
  let frameSpan = 30;
  const player = { ...SEAT, seated: true, y: EYE_SEATED };
  let noclip = false;
  const keys = new Set<string>();
  const camPos = new THREE.Vector3(30, 40, 30);
  const camTarget = new THREE.Vector3();
  let camFov = 40;
  let changedAt = performance.now();

  const desired = () => {
    if (view() === 'bird') {
      const { yaw, pitch, zoom, target } = bird;
      const half = Math.tan(THREE.MathUtils.degToRad(40) / 2);
      const span = frameSpan * 0.5;
      // A canvas not laid out yet has no width; never let that make the distance infinite.
      const dist = (span / half / clamp(camera.aspect, 0.2, 1)) * zoom;
      const offset = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
      return {
        pos: target.clone().add(offset),
        target: target.clone(),
        fov: 40,
      };
    }
    const eye = new THREE.Vector3(player.x, noclip ? player.y : player.seated ? EYE_SEATED : EYE_STANDING, player.z);
    const look = new THREE.Vector3(Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), Math.cos(player.yaw) * Math.cos(player.pitch));
    return { pos: eye, target: eye.clone().add(look), fov: 72 };
  };

  const blocked = (x: number, z: number) => obstacles().some((o) => Math.abs(x - o.x) < o.hx + RADIUS && Math.abs(z - o.z) < o.hz + RADIUS);

  const fly = (dt: number) => {
    const forward = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
    const side = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    const rise = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0);
    const step = (keys.has('fast') ? 60 : 15) * dt;
    const look = Math.cos(player.pitch);
    player.x += (Math.sin(player.yaw) * look * forward - Math.cos(player.yaw) * side) * step;
    player.z += (Math.cos(player.yaw) * look * forward + Math.sin(player.yaw) * side) * step;
    player.y += (Math.sin(player.pitch) * forward + rise) * step;
  };

  const walk = (dt: number) => {
    if (noclip) return fly(dt);
    const forward = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
    const side = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    if (!forward && !side) return;
    if (player.seated) {
      player.seated = false;
      changedAt = performance.now();
      onSeated(false);
    }
    const step = (3.6 * dt) / Math.hypot(forward, side);
    const dx = (Math.sin(player.yaw) * forward - Math.cos(player.yaw) * side) * step;
    const dz = (Math.cos(player.yaw) * forward + Math.sin(player.yaw) * side) * step;
    if (!blocked(player.x + dx, player.z)) player.x += dx;
    if (!blocked(player.x, player.z + dz)) player.z += dz;
  };

  return {
    frame: ({ zones, places }: Plan) => {
      const xs = [-6, 6, ...zones.flatMap((zone) => [zone.x0, zone.x1]), ...places.flatMap((p) => [p.centre.x - p.w / 2, p.centre.x + p.w / 2])];
      const zs = [4, ...zones.flatMap((zone) => [zone.z0, zone.z1]), ...places.flatMap((p) => [p.centre.z - p.d / 2, p.centre.z + p.d / 2])];
      const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
      frameSpan = Math.max(x1 - x0, z1 - z0) * 1.05;
      bird.target.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    },
    update: (dt: number, now: number) => {
      const atDesk = view() === 'desk';
      if (atDesk) walk(dt);
      const d = desired();
      // In first person the camera follows your head exactly once the fly-in has finished.
      const settled = atDesk && now - changedAt > 900;
      const k = reducedMotion() || settled ? 1 : 1 - Math.exp(-dt * 3.2);
      camPos.lerp(d.pos, k);
      camTarget.lerp(d.target, k);
      // Easing never recovers from NaN, so start again from where the camera should be.
      if (!Number.isFinite(camPos.x + camPos.y + camPos.z + camTarget.x + camTarget.y + camTarget.z)) {
        camPos.copy(d.pos);
        camTarget.copy(d.target);
      }
      camFov += (d.fov - camFov) * k;
      camera.position.copy(camPos);
      camera.lookAt(camTarget);
      camera.fov = camFov;
      // Fog is solid 320 m out; bird's eye can sit further back than that from the floor.
      camera.far = atDesk ? 340 : 800;
      camera.updateProjectionMatrix();
    },
    drag: (dx: number, dy: number) => {
      if (view() === 'bird') {
        bird.yaw -= dx * 0.006;
        bird.pitch = clamp(bird.pitch + dy * 0.004, 0.35, 1.45);
      } else {
        player.yaw -= dx * 0.005;
        player.pitch = clamp(player.pitch - dy * 0.004, noclip ? -1.55 : -1.1, noclip ? 1.55 : 1.1);
      }
    },
    zoom: (deltaY: number) => {
      bird.zoom = clamp(bird.zoom * (1 + deltaY * 0.001), 0.2, 2.5);
    },
    press: (e: KeyboardEvent) => {
      const key = MOVE_KEYS[e.code];
      if (!key || view() !== 'desk' || typing(e.target)) return;
      e.preventDefault();
      keys.add(key);
    },
    release: (e: KeyboardEvent) => {
      const key = MOVE_KEYS[e.code];
      if (key) keys.delete(key);
    },
    stop: () => keys.clear(),
    viewChanged: () => {
      changedAt = performance.now();
      keys.clear();
    },
    toggleNoclip: () => {
      if (view() !== 'desk') return noclip;
      noclip = !noclip;
      if (noclip) {
        player.y = player.seated ? EYE_SEATED : EYE_STANDING;
        player.seated = false;
        onSeated(false);
      } else {
        player.pitch = clamp(player.pitch, -1.1, 1.1);
      }
      return noclip;
    },
    sit: () => {
      noclip = false;
      Object.assign(player, SEAT, { seated: true, y: EYE_SEATED });
      changedAt = performance.now();
      onSeated(true);
    },
  };
}
