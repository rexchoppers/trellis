import * as THREE from 'three';
import { reducedMotion } from './figure';
import { placeKit, type KitPiece } from './kit';
import type { Plan } from './plan';

// Past the reception counter's right end.
const treeAt = (plan: Plan) => new THREE.Vector3(plan.reception.x + 5.6, 0, plan.reception.z + 1.4);

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

export function tinsel(parent: THREE.Object3D, pod: THREE.Vector3, n: number) {
  const colour = TINSEL[n % TINSEL.length];
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
