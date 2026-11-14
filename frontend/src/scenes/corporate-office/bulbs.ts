import * as THREE from 'three';
import { reducedMotion } from './figure';

export type Look = 'warm' | 'multi';

const WARM = 0xffc47e;
const MULTI = [0xff2a2a, 0x22d65a, 0x3a6cff, 0xffa41c];
// Seconds a coloured string's controller holds each pattern before moving to the next.
const HOLD = 12;
const HALO = 1;

const sphere = new THREE.SphereGeometry(1, 8, 6);
// The bulbs are lights themselves, so they skip the room light patch and stay bright with the breakers off.
const glass = Object.assign(new THREE.MeshBasicMaterial(), { onBeforeCompile: () => {} });
const flex = new THREE.LineBasicMaterial({ color: 0x1b2e1f });
const halos = new Map<number, THREE.PointsMaterial>();

function haloMaterial(size: number) {
  let material = halos.get(size);
  if (!material) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.15, 'rgba(255,255,255,0.8)');
    glow.addColorStop(0.4, 'rgba(255,255,255,0.25)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 64, 64);
    material = new THREE.PointsMaterial({ size, map: new THREE.CanvasTexture(canvas), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    halos.set(size, material);
  }
  return material;
}

// Bulbs every `spacing` metres along swags hung between anchors, each dipping `sag` at its middle.
export function swags(anchors: THREE.Vector3[], sag: number, spacing: number) {
  const bulbs: THREE.Vector3[] = [];
  const wire: THREE.Vector3[] = [];
  for (let i = 0; i + 1 < anchors.length; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const at = (t: number) => a.clone().lerp(b, t).setY(THREE.MathUtils.lerp(a.y, b.y, t) - sag * 4 * t * (1 - t));
    const n = Math.max(1, Math.round(a.distanceTo(b) / spacing));
    for (let k = 0; k < n; k++) bulbs.push(at((k + 0.5) / n));
    for (let k = 0; k < 12; k++) wire.push(at(k / 12), at((k + 1) / 12));
  }
  return { bulbs, wire };
}

// Anchors from a to b, about `step` apart.
export function along(a: THREE.Vector3, b: THREE.Vector3, step: number) {
  const n = Math.max(1, Math.round(a.distanceTo(b) / step));
  return Array.from({ length: n + 1 }, (_, k) => a.clone().lerp(b, k / n));
}

// The beads of a merged mesh, one centre per separate piece of it.
const beadCache = new WeakMap<THREE.BufferGeometry, THREE.Vector3[]>();
function beads(geometry: THREE.BufferGeometry) {
  const cached = beadCache.get(geometry);
  if (cached) return cached;
  const position = geometry.attributes.position;
  const root = Int32Array.from({ length: position.count }, (_, i) => i);
  const find = (i: number) => {
    while (root[i] !== i) i = root[i] = root[root[i]];
    return i;
  };
  const join = (a: number, b: number) => {
    root[find(a)] = find(b);
  };
  const corner = (k: number) => (geometry.index ? geometry.index.getX(k) : k);
  const corners = geometry.index ? geometry.index.count : position.count;
  for (let k = 0; k < corners; k += 3) {
    join(corner(k), corner(k + 1));
    join(corner(k), corner(k + 2));
  }
  // Flat-shaded faces share no vertices, so faces meeting at a point are one bead too.
  const seen = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)}`;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i);
    else join(i, first);
  }
  const sums = new Map<number, THREE.Vector4>();
  for (let i = 0; i < position.count; i++) {
    const r = find(i);
    const sum = sums.get(r) ?? sums.set(r, new THREE.Vector4()).get(r)!;
    sum.add(new THREE.Vector4(position.getX(i), position.getY(i), position.getZ(i), 1));
  }
  const centres = [...sums.values()].map((sum) => new THREE.Vector3(sum.x / sum.w, sum.y / sum.w, sum.z / sum.w));
  beadCache.set(geometry, centres);
  return centres;
}

type Run = { mesh: THREE.InstancedMesh; tint: THREE.BufferAttribute; base: THREE.Color[]; seed: Float32Array; look: Look; offset: number };

// A coloured string's controller steps through these, like the box on a real set.
function pattern(mode: number, i: number, t: number, phase: number, speed: number) {
  if (mode === 0) return 0.1 + 0.9 * Math.pow(0.5 + 0.5 * Math.sin(i * 0.55 - t * 3), 3);
  // Every other bulb in turn, well under three flashes a second.
  if (mode === 1) return (Math.floor(t * 1.4) + i) % 2 ? 1 : 0.12;
  if (mode === 2) return Math.pow(0.5 + 0.5 * Math.sin(t * speed * 1.6 + phase), 2);
  return 0.85 + 0.15 * Math.sin(t * 0.9);
}

export function stringLights() {
  const runs: Run[] = [];
  const owned: THREE.BufferGeometry[] = [];
  const calm = reducedMotion();
  const colour = new THREE.Color();

  const level = (run: Run, i: number, t: number) => {
    if (calm) return 1;
    const phase = run.seed[i * 3];
    const speed = run.seed[i * 3 + 1];
    if (run.look === 'warm') {
      // A slow shimmer, and now and then a bulb glints.
      const glint = Math.sin(t * 0.4 * speed + run.seed[i * 3 + 2]) > 0.97 ? 0.5 : 0;
      return 0.65 + 0.35 * Math.sin(t * speed + phase) + glint;
    }
    const c = t + run.offset;
    const mode = Math.floor(c / HOLD);
    const now = pattern(mode % 4, i, c, phase, speed);
    const into = c - mode * HOLD;
    return into >= 1 ? now : THREE.MathUtils.lerp(pattern((mode + 3) % 4, i, c, phase, speed), now, into);
  };

  const add = (parent: THREE.Object3D, at: THREE.Vector3[], look: Look, size: number, halo: number, wire?: THREE.Vector3[]) => {
    if (!at.length) return;
    const mesh = new THREE.InstancedMesh(sphere, glass, at.length);
    mesh.userData.shared = true;
    mesh.castShadow = mesh.receiveShadow = false;
    const matrix = new THREE.Matrix4();
    // Coloured bulbs are the longer kind, hanging point down.
    at.forEach((p, i) => mesh.setMatrixAt(i, matrix.makeScale(size, size * (look === 'multi' ? 1.5 : 1), size).setPosition(p)));
    const base = at.map((_, i) => new THREE.Color(look === 'warm' ? WARM : MULTI[i % MULTI.length]));
    base.forEach((c, i) => mesh.setColorAt(i, c));
    const points = new THREE.BufferGeometry().setFromPoints(at);
    const tint = new THREE.BufferAttribute(new Float32Array(at.length * 3), 3);
    points.setAttribute('color', tint);
    owned.push(points);
    parent.add(mesh, new THREE.Points(points, haloMaterial(halo)));
    if (wire) {
      const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wire), flex);
      owned.push(line.geometry);
      parent.add(line);
    }
    const seed = Float32Array.from({ length: at.length * 3 }, (_, k) => (k % 3 === 1 ? 0.6 + Math.random() * 1.4 : Math.random() * Math.PI * 2));
    runs.push({ mesh, tint, base, seed, look, offset: Math.random() * HOLD * 4 });
  };

  return {
    add,
    // A string hung in swags between anchors.
    hang: (parent: THREE.Object3D, anchors: THREE.Vector3[], look: Look, o: { sag: number; spacing: number; size: number; halo: number }) => {
      const { bulbs, wire } = swags(anchors, o.sag, o.spacing);
      add(parent, bulbs, look, o.size, o.halo, wire);
    },
    // A piece's own bulbs (the kit's "fairy" beads) swapped for ones that twinkle.
    fairy: (model: THREE.Object3D) => {
      const found: THREE.Mesh[] = [];
      model.traverse((object) => {
        if (object instanceof THREE.Mesh && (object.material as THREE.Material).name === 'fairy') found.push(object);
      });
      for (const mesh of found) {
        const holder = new THREE.Group();
        holder.position.copy(mesh.position);
        holder.quaternion.copy(mesh.quaternion);
        holder.scale.copy(mesh.scale);
        mesh.parent?.add(holder);
        mesh.visible = false;
        add(holder, beads(mesh.geometry), 'warm', 0.02, 0.16);
      }
    },
    update: (now: number) => {
      const t = now / 1000;
      for (const run of runs) {
        const tint = run.tint.array as Float32Array;
        for (let i = 0; i < run.base.length; i++) {
          const lit = level(run, i, t);
          run.mesh.setColorAt(i, colour.copy(run.base[i]).multiplyScalar(0.1 + 0.95 * lit));
          colour.copy(run.base[i]).multiplyScalar(Math.min(1, lit) * HALO);
          tint[i * 3] = colour.r;
          tint[i * 3 + 1] = colour.g;
          tint[i * 3 + 2] = colour.b;
        }
        if (run.mesh.instanceColor) run.mesh.instanceColor.needsUpdate = true;
        run.tint.needsUpdate = true;
      }
    },
    dispose: () => {
      for (const geometry of owned) geometry.dispose();
      runs.length = 0;
    },
  };
}
