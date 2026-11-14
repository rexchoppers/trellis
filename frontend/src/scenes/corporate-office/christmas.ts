import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

const FOIL = [0xc9a24a, 0xb3262d, 0x2f7d4a, 0xc9ccd1, 0x3554b8];
const BAUBLES = [0x9e1b2c, 0xc9a24a, 0x1f6b3a, 0xc9ccd1, 0x2a4fa8];
const foils = new Map<number, THREE.Material>();
const foil = (colour: number) => foils.get(colour) ?? foils.set(colour, new THREE.MeshStandardMaterial({ color: colour, metalness: 0.45, roughness: 0.3, side: THREE.DoubleSide })).get(colour)!;
const ball = new THREE.SphereGeometry(1, 16, 12);
const shiny = new THREE.MeshStandardMaterial({ metalness: 0.5, roughness: 0.22 });
const twine = new THREE.LineBasicMaterial({ color: 0xbdbdbd });
const plane = new THREE.PlaneGeometry(1, 1);

function starShape() {
  const shape = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 0.42 : 1;
    const a = (k / 10) * Math.PI * 2;
    if (k) shape.lineTo(Math.sin(a) * r, Math.cos(a) * r);
    else shape.moveTo(0, r);
  }
  return new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false }).center();
}
const starGeometry = starShape();

// A twisted foil garland: two strips crossed, turning as they go, hung in a swag from a to b.
function streamer(a: THREE.Vector3, b: THREE.Vector3, sag: number) {
  const at = (t: number) => a.clone().lerp(b, t).setY(THREE.MathUtils.lerp(a.y, b.y, t) - sag * 4 * t * (1 - t));
  const length = a.distanceTo(b);
  const n = Math.ceil(length / 0.03);
  const up = new THREE.Vector3(0, 1, 0);
  const positions: number[] = [];
  let last: THREE.Vector3[][] | null = null;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const p = at(t);
    const tangent = at(Math.min(1, t + 0.01)).sub(at(Math.max(0, t - 0.01))).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const lift = new THREE.Vector3().crossVectors(side, tangent);
    const turn = t * length * 28;
    const edges = [0, Math.PI / 2].map((extra) => {
      const d = side.clone().multiplyScalar(Math.cos(turn + extra)).addScaledVector(lift, Math.sin(turn + extra)).multiplyScalar(0.055);
      return [p.clone().add(d), p.clone().sub(d)];
    });
    if (last)
      for (let r = 0; r < 2; r++) {
        const [a0, a1] = last[r];
        const [b0, b1] = edges[r];
        for (const v of [a0, a1, b1, a0, b1, b0]) positions.push(v.x, v.y, v.z);
      }
    last = edges;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function snowflake(seed: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const rng = random(seed);
  const branches = [0.3 + rng() * 0.15, 0.55 + rng() * 0.15, 0.78 + rng() * 0.08].map((at) => ({ at, length: 0.12 + rng() * 0.16 }));
  ctx.translate(64, 64);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  for (let arm = 0; arm < 6; arm++) {
    ctx.save();
    ctx.rotate((arm / 6) * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -58);
    for (const { at, length } of branches)
      for (const side of [-1, 1]) {
        ctx.moveTo(0, -58 * at);
        ctx.lineTo(side * 58 * length * Math.sin(Math.PI / 3), -58 * (at + length * Math.cos(Math.PI / 3)));
      }
    ctx.stroke();
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
}
let flakes: THREE.MeshBasicMaterial[] | undefined;

function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

type Front = { x0: number; x1: number; z: number; look: 'warm' | 'multi' };

// Everything festive that hangs on the floor: lights on the windows, glass fronts, lift core, reception and desks,
// foil garlands and baubles across the ceiling over the aisles, and snowflakes on the glass.
export function festiveFloor(plan: Plan) {
  const lights = stringLights();
  const calm = reducedMotion();
  const pods: { parent: THREE.Object3D; pod: THREE.Vector3 }[] = [];
  const spin: { mesh: THREE.InstancedMesh | null; at: THREE.Vector3[]; turn: number[]; speed: number[]; size: number } = { mesh: null, at: [], turn: [], speed: [], size: 0.13 };
  let star: THREE.MeshStandardMaterial | undefined;
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  const ceilingDecor = (ceiling: THREE.Object3D) => {
    const top = STOREY - 0.02;
    const chains: THREE.Vector3[][] = [];
    // Zigzags along both aisles, and down the open line from your office to reception, clear of the cross aisle.
    for (const lane of [plan.aisle, plan.cross]) chains.push(along(new THREE.Vector3(plan.x0 + 3, top, lane), new THREE.Vector3(plan.x1 - 3, top, lane), BAY).map((p, k) => p.setZ(lane + (k % 2 ? 1 : -1))));
    const spine: THREE.Vector3[] = [];
    for (let z = plan.aisle - 1.5; z > plan.reception.z + 4; z -= 3) {
      if (Math.abs(z - plan.cross) < 1.5) {
        chains.push(spine.splice(0));
        continue;
      }
      spine.push(new THREE.Vector3(spine.length % 2 ? 1.2 : -1.2, top, z));
    }
    chains.push(spine);
    const strips = new Map<number, THREE.BufferGeometry[]>();
    const hung: { at: THREE.Vector3; size: number; colour: number }[] = [];
    let n = 0;
    for (const chain of chains)
      chain.forEach((a, k) => {
        hung.push({ at: a.clone().setY(top - (k % 2 ? 0.45 : 0.32)), size: k % 2 ? 0.1 : 0.08, colour: BAUBLES[(n + k) % BAUBLES.length] });
        const b = chain[k + 1];
        if (!b) return;
        const colour = FOIL[n++ % FOIL.length];
        strips.set(colour, [...(strips.get(colour) ?? []), streamer(a, b, 0.38)]);
        spin.at.push(a.clone().lerp(b, 0.5).setY(top - 0.38 - 0.3));
        spin.turn.push(Math.random() * Math.PI * 2);
        spin.speed.push((Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.4));
      });
    for (const [colour, geometries] of strips) {
      ceiling.add(new THREE.Mesh(mergeGeometries(geometries), foil(colour)));
      geometries.forEach((geometry) => geometry.dispose());
    }
    const baubles = new THREE.InstancedMesh(ball, shiny, hung.length);
    baubles.userData.shared = true;
    hung.forEach(({ at, size, colour }, i) => {
      baubles.setMatrixAt(i, matrix.makeScale(size, size, size).setPosition(at));
      baubles.setColorAt(i, new THREE.Color(colour));
    });
    const stars = new THREE.InstancedMesh(starGeometry, shiny, spin.at.length);
    stars.userData.shared = true;
    spin.at.forEach((at, i) => {
      stars.setMatrixAt(i, matrix.compose(at, turn.setFromAxisAngle(up, spin.turn[i]), new THREE.Vector3().setScalar(spin.size)));
      stars.setColorAt(i, new THREE.Color(i % 2 ? 0xc9ccd1 : 0xd8b45a));
    });
    spin.mesh = stars;
    const threads = [...hung.map(({ at, size }) => [at.clone().setY(STOREY), at.clone().setY(at.y + size)]), ...spin.at.map((at) => [at.clone().setY(at.y + 0.3), at.clone().setY(at.y + spin.size)])].flat();
    ceiling.add(baubles, stars, new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(threads), twine));
  };

  const snow = (group: THREE.Object3D, walled: (x: number, z: number) => boolean) => {
    flakes ??= [11, 23, 37].map(snowflake);
    const rng = random(7);
    const { x0, x1, z0, z1 } = plan;
    const across = Math.round((x1 - x0) / BAY);
    const deep = Math.round((z1 - z0) / 3);
    const spots: THREE.Matrix4[][] = flakes.map(() => []);
    const wall = (count: number, point: (u: number) => THREE.Vector3, facing: number) => {
      for (let k = 0; k < count; k++) {
        const mid = point((k + 0.5) / count);
        if (walled(mid.x, mid.z) || rng() < 0.3) continue;
        for (let f = rng() < 0.5 ? 1 : 2; f > 0; f--) {
          const at = point((k + 0.2 + rng() * 0.6) / count).setY(0.7 + rng() * 1.9);
          const size = 0.22 + rng() * 0.3;
          const q = new THREE.Quaternion().setFromAxisAngle(up, facing).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rng() * Math.PI));
          spots[Math.floor(rng() * spots.length)].push(new THREE.Matrix4().compose(at, q, new THREE.Vector3(size, size, 1)));
        }
      }
    };
    // Just inside the glass, facing in.
    wall(across, (u) => new THREE.Vector3(x0 + u * (x1 - x0), 0, z0 + 0.04), 0);
    wall(across, (u) => new THREE.Vector3(x0 + u * (x1 - x0), 0, z1 - 0.04), Math.PI);
    wall(deep, (u) => new THREE.Vector3(x0 + 0.04, 0, z0 + u * (z1 - z0)), Math.PI / 2);
    wall(deep, (u) => new THREE.Vector3(x1 - 0.04, 0, z0 + u * (z1 - z0)), -Math.PI / 2);
    spots.forEach((list, i) => {
      const mesh = new THREE.InstancedMesh(plane, flakes![i], list.length);
      mesh.userData.shared = true;
      list.forEach((m, k) => mesh.setMatrixAt(k, m));
      group.add(mesh);
    });
  };

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
    finish: (group: THREE.Object3D, ceiling: THREE.Object3D, fronts: Front[], walled: (x: number, z: number) => boolean) => {
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
      ceilingDecor(ceiling);
      snow(group, walled);
    },
    update: (now: number) => {
      lights.update(now);
      if (calm) return;
      const t = now / 1000;
      const stars = spin.mesh;
      if (stars) {
        const size = new THREE.Vector3().setScalar(spin.size);
        spin.at.forEach((at, i) => stars.setMatrixAt(i, matrix.compose(at, turn.setFromAxisAngle(up, spin.turn[i] + t * spin.speed[i]), size)));
        stars.instanceMatrix.needsUpdate = true;
      }
      if (star) star.emissiveIntensity = 0.8 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.3));
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
