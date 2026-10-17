import { minBy } from 'es-toolkit';
import * as THREE from 'three';
import { placeKit } from './kit';

const FLOOR = 47;
const TOP = 60;
const OPEN_MS = 1100;
const HOLD_MS = 4000;
const CRUISE_MS = 420;
const START_MS = 900;
const SLIDE = 0.66;

type Lift = {
  leaves: [THREE.Object3D, THREE.Object3D];
  x: number;
  display: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; shown: string };
  floor: number;
  target: number;
  from: number;
  answering: boolean;
  phase: 'stopped' | 'moving' | 'opening' | 'open' | 'closing';
  since: number;
  until: number;
};

const anyFloor = (not: number) => {
  const floor = 1 + Math.floor(Math.random() * (TOP - 1));
  return floor >= not ? floor + 1 : floor;
};

// Two lifts that roam the building, counting floors on their displays. Now and then one stops at
// your floor, chimes and opens. The call button brings the nearest one.
export function lifts(parent: THREE.Object3D, core: THREE.Vector3) {
  const group = new THREE.Group();
  parent.add(group);
  const front = core.z + 1.77;
  const make = (x: number): Lift => {
    const leaves = [placeKit(group, 'lift_door', x - 0.34, front), placeKit(group, 'lift_door', x + 0.34, front)] as [THREE.Object3D, THREE.Object3D];
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 76;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.11), new THREE.MeshBasicMaterial({ map: texture }));
    screen.position.set(x, 2.55, core.z + 2.024);
    group.add(screen);
    const floor = anyFloor(FLOOR);
    return { leaves, x, display: { canvas, texture, shown: '' }, floor, target: floor, from: floor, answering: false, phase: 'stopped', since: 0, until: performance.now() + 2000 + Math.random() * 8000 };
  };
  const all = [make(core.x - 1.6), make(core.x + 1.6)];

  const button = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.2), new THREE.MeshBasicMaterial({ color: 0xd9dadc }));
  button.position.set(core.x, 1.15, core.z + 2.024);
  group.add(button);
  let called = false;

  let audio: AudioContext | undefined;
  // Browsers only allow sound after the person has interacted with the page.
  const unlock = () => {
    audio ??= new AudioContext();
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  const chime = () => {
    if (!audio) return;
    for (const [freq, at] of [
      [988, 0],
      [784, 0.32],
    ]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, audio.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + at + 0.9);
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + at);
      osc.stop(audio.currentTime + at + 1);
    }
  };

  const paint = (lift: Lift) => {
    const arrow = lift.phase === 'moving' ? (lift.target > lift.floor ? '▲' : '▼') : '';
    const text = `${arrow} ${lift.floor}`.trim();
    if (text === lift.display.shown) return;
    lift.display.shown = text;
    const ctx = lift.display.canvas.getContext('2d')!;
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, 256, 76);
    ctx.fillStyle = '#ff8a2a';
    ctx.font = '700 54px "Archivo Variable", ui-sans-serif, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 40);
    lift.display.texture.needsUpdate = true;
  };

  const go = (lift: Lift, target: number, now: number) => {
    lift.from = lift.floor;
    lift.target = target;
    lift.phase = 'moving';
    lift.since = now;
  };
  const stop = (lift: Lift, now: number) => {
    if (lift.floor === FLOOR) {
      lift.phase = 'opening';
      lift.answering = false;
      called = false;
      chime();
    } else {
      lift.phase = 'stopped';
      lift.until = now + (lift.answering ? 1500 : 2000 + Math.random() * 10000);
    }
    lift.since = now;
  };
  // How many floors a lift has to travel before it can reach yours.
  const distance = (lift: Lift) => {
    if (lift.phase !== 'moving') return Math.abs(lift.floor - FLOOR);
    const passes = (lift.target - lift.floor) * (FLOOR - lift.floor) >= 0 && Math.abs(lift.target - lift.floor) >= Math.abs(FLOOR - lift.floor);
    return passes ? Math.abs(FLOOR - lift.floor) : Math.abs(lift.target - lift.floor) + Math.abs(lift.target - FLOOR);
  };

  const update = (now: number) => {
    for (const lift of all) {
      const t = now - lift.since;
      if (lift.phase === 'stopped' && now > lift.until) {
        const next = lift.answering ? FLOOR : lift.floor !== FLOOR && Math.random() < 0.3 ? FLOOR : anyFloor(lift.floor);
        if (next !== lift.floor) go(lift, next, now);
        else stop(lift, now);
      } else if (lift.phase === 'moving') {
        // Slow away from the start and into the stop, faster in between.
        const gap = lift.floor === lift.from || Math.abs(lift.target - lift.floor) <= 1 ? START_MS : CRUISE_MS;
        if (t > gap) {
          lift.floor += lift.target > lift.floor ? 1 : -1;
          lift.since = now;
          if (lift.floor === lift.target) stop(lift, now);
        }
      } else if (lift.phase === 'opening' && t > OPEN_MS) {
        lift.phase = 'open';
        lift.since = now;
      } else if (lift.phase === 'open' && t > HOLD_MS) {
        lift.phase = 'closing';
        lift.since = now;
      } else if (lift.phase === 'closing' && t > OPEN_MS) {
        lift.phase = 'stopped';
        lift.since = now;
        lift.until = now + 3000 + Math.random() * 9000;
      }
      const open =
        lift.phase === 'open' ? 1 : lift.phase === 'opening' ? Math.min(1, t / OPEN_MS) : lift.phase === 'closing' ? 1 - Math.min(1, t / OPEN_MS) : 0;
      const eased = open * open * (3 - 2 * open);
      lift.leaves[0].position.x = lift.x - 0.34 - eased * SLIDE;
      lift.leaves[1].position.x = lift.x + 0.34 + eased * SLIDE;
      paint(lift);
    }
    (button.material as THREE.MeshBasicMaterial).color.setHex(called ? 0xffb02e : 0xd9dadc);
  };

  return {
    group,
    button,
    // An open lift at your floor stays open; a closed one opens; otherwise the nearest one comes.
    call: () => {
      const now = performance.now();
      const here = all.find((lift) => lift.floor === FLOOR && lift.phase !== 'moving');
      if (here) {
        if (here.phase === 'open') here.since = now;
        else if (here.phase === 'stopped') stop(here, now);
        else if (here.phase === 'closing') {
          here.phase = 'opening';
          here.since = now - (1 - Math.min(1, (now - here.since) / OPEN_MS)) * OPEN_MS;
        }
        return;
      }
      if (called) return;
      called = true;
      const lift = minBy(all, distance)!;
      lift.answering = true;
      if (lift.phase === 'stopped') go(lift, FLOOR, now);
      else if (lift.phase === 'moving' && distance(lift) === Math.abs(FLOOR - lift.floor)) lift.target = FLOOR;
    },
    update,
    dispose: () => {
      window.removeEventListener('pointerdown', unlock);
      void audio?.close();
      group.traverse((object) => {
        if (object instanceof THREE.Mesh && !object.userData.kit) {
          object.geometry.dispose();
          const material = object.material as THREE.MeshBasicMaterial;
          material.map?.dispose();
          material.dispose();
        }
      });
    },
  };
}
