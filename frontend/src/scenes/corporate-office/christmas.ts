import * as THREE from 'three';
import { STOREY } from './build';
import { along, stringLights } from './bulbs';
import { reducedMotion } from './figure';
import { placeKit, type KitPiece } from './kit';
import { BAY, OFFICE, type Plan } from './plan';

// Past the reception counter's right end.
const treeAt = (plan: Plan) => new THREE.Vector3(plan.reception.x + 5.6, 0, plan.reception.z + 1.4);
// The tree's tiers as office.py builds them: base, radius and height of each cone.
const TIERS = [
  [0.5, 0.82, 0.72],
  [0.88, 0.68, 0.64],
  [1.24, 0.54, 0.58],
  [1.58, 0.4, 0.52],
  [1.9, 0.26, 0.5],
];
const treeRadius = (y: number) => Math.max(0, ...TIERS.filter(([base, , h]) => y >= base && y <= base + h).map(([base, r, h]) => r + ((0.02 - r) * (y - base)) / h));

export function decorations(plan: Plan): { key: string; piece: KitPiece; centre: THREE.Vector3; rotationY?: number }[] {
  const { reception, core, breakout } = plan;
  return [
    // Its presents toward the lifts.
    { key: 'xmas_tree', piece: 'xmas_tree', centre: treeAt(plan), rotationY: Math.PI },
    { key: 'xmas_garland', piece: 'xmas_garland', centre: reception },
    // On the lift core between the two lifts, above the call button.
    { key: 'xmas_wreath', piece: 'xmas_wreath', centre: new THREE.Vector3(core.x, 0, core.z + 2.005) },
    { key: 'xmas_treats', piece: 'xmas_treats', centre: breakout.centre },
  ];
}

const TINSEL = [0xd8b45a, 0xc9ccd1, 0xb3262d];
const tinted = new Map<number, THREE.Material>();

function tinsel(parent: THREE.Object3D, pod: THREE.Vector3, n: number) {
  const colour = TINSEL[(n / 2) % TINSEL.length];
  placeKit(parent, 'xmas_tinsel', pod.x, pod.z, 0, undefined, (model) =>
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || (object.material as THREE.Material).name !== 'tinsel') return;
      let material = tinted.get(colour);
      if (!material) {
        // Fully metallic reads near black here: the room reflects too little for it to shine.
        material = Object.assign((object.material as THREE.MeshStandardMaterial).clone(), { metalness: 0.4, roughness: 0.35 });
        (material as THREE.MeshStandardMaterial).color.setHex(colour);
        tinted.set(colour, material);
      }
      object.material = material;
    }),
  );
}

type Front = { x0: number; x1: number; z: number; look: 'warm' | 'multi' };

// Everything festive that hangs on the floor: lights on the windows, glass fronts, lift core, reception and desks.
export function festiveFloor(plan: Plan) {
  const lights = stringLights();
  const calm = reducedMotion();
  const pods: { parent: THREE.Object3D; pod: THREE.Vector3 }[] = [];
  let star: THREE.MeshStandardMaterial | undefined;

  const windows = (group: THREE.Object3D, walled: (x: number, z: number) => boolean) => {
    const { x0, x1, z0, z1 } = plan;
    const across = Math.round((x1 - x0) / BAY);
    const deep = Math.round((z1 - z0) / 3);
    const y = STOREY - 0.12;
    const row = (count: number, point: (u: number) => THREE.Vector3) => Array.from({ length: count + 1 }, (_, k) => point(k / count).setY(y));
    // One run per wall, from mullion to mullion a little in from the glass, broken where a walled room stands.
    for (const anchors of [
      row(across, (u) => new THREE.Vector3(x0 + u * (x1 - x0), 0, z0 + 0.1)),
      row(across, (u) => new THREE.Vector3(x0 + u * (x1 - x0), 0, z1 - 0.1)),
      row(deep, (u) => new THREE.Vector3(x0 + 0.1, 0, z0 + u * (z1 - z0))),
      row(deep, (u) => new THREE.Vector3(x1 - 0.1, 0, z0 + u * (z1 - z0))),
    ]) {
      let run: THREE.Vector3[] = [];
      const flush = () => {
        if (run.length > 1) lights.hang(group, run, 'multi', { sag: 0.2, spacing: 0.28, size: 0.03, halo: 0.45 });
        run = [];
      };
      anchors.forEach((a, k) => {
        const b = anchors[k + 1];
        if (b && !walled((a.x + b.x) / 2, (a.z + b.z) / 2)) run.push(...(run.length ? [b] : [a, b]));
        else flush();
      });
    }
  };

  return {
    // Tinsel on every other desk pod and a string of coloured lights on the rest.
    pod: (parent: THREE.Object3D, pod: THREE.Vector3, n: number) => {
      if (n % 2) pods.push({ parent, pod });
      else tinsel(parent, pod, n);
    },
    dress: (model: THREE.Object3D) => {
      lights.fairy(model);
      model.traverse((object) => {
        if (object instanceof THREE.Mesh && (object.material as THREE.Material).name === 'star') star = object.material as THREE.MeshStandardMaterial;
      });
    },
    // After the floor's shadows are set, so none of this casts any.
    finish: (group: THREE.Object3D, fronts: Front[], walled: (x: number, z: number) => boolean) => {
      const warm = { sag: 0.12, spacing: 0.1, size: 0.016, halo: 0.16 };
      windows(group, walled);
      for (const front of fronts) lights.hang(group, along(new THREE.Vector3(front.x0 + 0.05, 2.7, front.z), new THREE.Vector3(front.x1 - 0.05, 2.7, front.z), 1), front.look, front.look === 'warm' ? warm : { sag: 0.1, spacing: 0.2, size: 0.022, halo: 0.3 });
      const { core, reception } = plan;
      lights.hang(group, along(new THREE.Vector3(core.x - 3.9, STOREY - 0.08, core.z + 2.05), new THREE.Vector3(core.x + 3.9, STOREY - 0.08, core.z + 2.05), 1), 'warm', { ...warm, sag: 0.16 });
      // Along the front of the credenza behind reception.
      lights.hang(group, along(new THREE.Vector3(reception.x - 2.45, 0.92, reception.z + 2.32), new THREE.Vector3(reception.x + 2.45, 0.92, reception.z + 2.32), 0.7), 'warm', { ...warm, sag: 0.09, spacing: 0.08 });
      // Along the top of the pod's screen, in swags down its face toward your office.
      for (const { parent, pod } of pods) lights.hang(parent, along(new THREE.Vector3(pod.x - 1.62, 1.235, pod.z + 0.05), new THREE.Vector3(pod.x + 1.62, 1.235, pod.z + 0.05), 0.54), 'multi', { sag: 0.07, spacing: 0.1, size: 0.014, halo: 0.14 });
      // Two more spirals round the tree, between the turns of its own: one warm, one coloured.
      const tree = treeAt(plan);
      for (const [look, count, offset] of [
        ['warm', 120, Math.PI],
        ['multi', 70, Math.PI / 2],
      ] as const)
        lights.add(
          group,
          Array.from({ length: count }, (_, k) => {
            const t = k / (count - 1);
            const y = 0.56 + t * 1.78;
            const a = offset + t * Math.PI * 2 * 5.5;
            const reach = treeRadius(y) + 0.012;
            return new THREE.Vector3(tree.x + reach * Math.cos(a), y, tree.z + reach * Math.sin(a));
          }),
          look,
          look === 'warm' ? 0.02 : 0.026,
          look === 'warm' ? 0.16 : 0.26,
        );
    },
    update: (now: number) => {
      lights.update(now);
      if (calm) return;
      if (star) star.emissiveIntensity = 0.8 + 0.6 * (0.5 + 0.5 * Math.sin((now / 1000) * 1.3));
    },
    dispose: () => lights.dispose(),
  };
}

// The glass fronts that get a string along their top: your office's from inside, the rooms on the back wall and
// the waiting room's from the floor.
export function glassFronts(plan: Plan, rooms: { x0: number; x1: number }[]): Front[] {
  return [
    { x0: -OFFICE.hx, x1: OFFICE.hx, z: -OFFICE.hz + 0.07, look: 'warm' },
    ...rooms.map((room) => ({ x0: room.x0, x1: room.x1, z: -OFFICE.hz - 0.07, look: 'multi' as const })),
    { x0: plan.waiting.x0, x1: plan.waiting.x1, z: plan.waiting.z1 + 0.07, look: 'warm' },
  ];
}

const FALL = 1.1;
const NEAR = 36;
const FAR = { reach: 130, low: -50, span: 90 };
const RING = 85;

function flakeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

const wrap = (v: number, span: number) => ((v % span) + span) % span;

// Snow round the tower, never inside the floor, and Santa's sleigh circling at a distance, above the rooftops.
export function festiveSky(scene: THREE.Scene) {
  const group = new THREE.Group();
  scene.add(group);
  const texture = flakeTexture();
  const calm = reducedMotion();
  const room = { x0: 0, z0: 0, x1: 0, z1: 0 };
  const centre = new THREE.Vector3();

  const flakes = (count: number, size: number) => {
    const seed = new Float32Array(count * 4).map(() => Math.random());
    const positions = new Float32Array(count * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xffffff, size, map: texture, transparent: true, depthWrite: false });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    group.add(points);
    return { seed, positions, geometry, material, count };
  };
  // Close flakes keep to a box round the camera, so there are always some nearby; far ones fill the sky round the tower.
  const near = flakes(9000, 0.06);
  const far = flakes(6000, 0.35);
  const indoors = (x: number, z: number) => x > room.x0 - 0.3 && x < room.x1 + 0.3 && z > room.z0 - 0.3 && z < room.z1 + 0.3;

  let nose: THREE.MeshStandardMaterial | undefined;
  const sleigh = placeKit(group, 'santa_sleigh', 0, 0, 0, undefined, (model) =>
    model.traverse((object) => {
      if (object instanceof THREE.Mesh && (object.material as THREE.Material).name === 'nose_red') nose = object.material as THREE.MeshStandardMaterial;
    }),
  );
  sleigh.scale.setScalar(1.5);
  const phase = Array.from({ length: 5 }, () => Math.random() * Math.PI * 2);
  const ahead = new THREE.Vector3();
  // Always onward round the tower, wandering in and out and up and down.
  const fly = (t: number, out: THREE.Vector3) => {
    const angle = phase[0] + t * 0.08 + 0.6 * Math.sin(t * 0.03 + phase[1]);
    const r = RING + 14 * Math.sin(t * 0.047 + phase[2]) + 6 * Math.sin(t * 0.13 + phase[3]);
    return out.set(centre.x + Math.cos(angle) * r, 16 + 9 * Math.sin(t * 0.06 + phase[4]) + 1.5 * Math.sin(t * 0.5), centre.z + Math.sin(angle) * r);
  };

  return {
    fit: (plan: { x0: number; z0: number; x1: number; z1: number }) => {
      Object.assign(room, { x0: plan.x0, z0: plan.z0, x1: plan.x1, z1: plan.z1 });
      centre.set((plan.x0 + plan.x1) / 2, 0, (plan.z0 + plan.z1) / 2);
    },
    update: (now: number, camera: THREE.Vector3) => {
      const t = calm ? 0 : now / 1000;
      fly(t, sleigh.position);
      sleigh.lookAt(fly(t + 0.5, ahead));
      // Lean into the turn.
      sleigh.rotateZ(0.12);
      if (nose) nose.emissiveIntensity = 2 + 1.5 * Math.sin(t * 2.5);

      for (let i = 0; i < near.count; i++) {
        const s = near.seed;
        const sway = Math.sin(t * 0.6 + i);
        const x = camera.x - NEAR / 2 + wrap(s[i * 4] * NEAR + 0.4 * sway - camera.x + NEAR / 2, NEAR);
        const y = camera.y - NEAR / 2 + wrap(s[i * 4 + 1] * NEAR - t * FALL * (0.7 + 0.6 * s[i * 4 + 3]) - camera.y + NEAR / 2, NEAR);
        const z = camera.z - NEAR / 2 + wrap(s[i * 4 + 2] * NEAR + 0.4 * Math.cos(t * 0.5 + i * 1.3) - camera.z + NEAR / 2, NEAR);
        near.positions[i * 3] = x;
        near.positions[i * 3 + 1] = indoors(x, z) ? -1e5 : y;
        near.positions[i * 3 + 2] = z;
      }
      near.geometry.attributes.position.needsUpdate = true;

      const span = FAR.reach * 2;
      for (let i = 0; i < far.count; i++) {
        const s = far.seed;
        const x = centre.x - FAR.reach + wrap(s[i * 4] * span + Math.sin(t * 0.3 + i), span);
        const y = FAR.low + wrap(s[i * 4 + 1] * FAR.span - t * FALL * (0.7 + 0.6 * s[i * 4 + 3]), FAR.span);
        const z = centre.z - FAR.reach + wrap(s[i * 4 + 2] * span, span);
        far.positions[i * 3] = x;
        far.positions[i * 3 + 1] = indoors(x, z) ? -1e5 : y;
        far.positions[i * 3 + 2] = z;
      }
      far.geometry.attributes.position.needsUpdate = true;
    },
    dispose: () => {
      scene.remove(group);
      for (const layer of [near, far]) {
        layer.geometry.dispose();
        layer.material.dispose();
      }
      texture.dispose();
    },
  };
}
