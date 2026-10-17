import { clamp } from 'es-toolkit';
import * as THREE from 'three';
import { placeKit } from './kit';

const OPEN_S = 0.9;
const CLOSE_S = 2.2;
const STAYS_MS = 6000;
const SWING = 1.6;

// A fire door swings into the stair when clicked, then its closer pulls it shut.
export function fireDoor(parent: THREE.Object3D, x: number, z: number) {
  const leaf = placeKit(parent, 'fire_door', x, z);
  let open = 0;
  let held = false;
  let heldAt = 0;
  let last = 0;
  return {
    leaf,
    toggle: () => {
      held = !held;
      heldAt = performance.now();
    },
    update: (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (held && now - heldAt > STAYS_MS) held = false;
      open = clamp(open + (held ? dt / OPEN_S : -dt / CLOSE_S), 0, 1);
      leaf.rotation.y = -open * open * (3 - 2 * open) * SWING;
    },
  };
}
