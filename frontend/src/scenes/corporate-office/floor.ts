import { range } from 'es-toolkit';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { config } from '../../../wailsjs/go/models';
import { plural } from '@/lib/utils';
import { boxIn, disposeGeometry, floorName, materials, plaque, shadows, slabIn, STOREY, type Obstacle } from './build';
import { kitMarkers, placeKit, placeKitMany, type KitPiece, type Spot } from './kit';
import { BAY, desksOf, OFFICE, planFloor, type Plan } from './plan';

const TOWER_DEPTH = 140;

type Room = { group: THREE.Group };

export type PlaceSpot = { at: THREE.Vector3; facing: number };
type PlaceSpots = { serve: PlaceSpot[]; seat: PlaceSpot[] };

export type Floor = {
  group: THREE.Group;
  plan: Plan;
  // Shown only in first person, so bird's eye can look down into the floor.
  ceiling: THREE.Group;
  rooms: Map<string, Room>;
  obstacles: Obstacle[];
  // Filled once ready settles.
  spots: Map<string, PlaceSpots>;
  ready: Promise<void>;
  centre: THREE.Vector3;
  size: number;
  dispose: () => void;
};

export function buildFloor(departments: config.Department[], places: config.Place[] = []): Floor {
  const group = new THREE.Group();
  const m = materials();
  const glass: THREE.Mesh[] = [];
  const noShadow: THREE.Object3D[] = [];
  const obstacles: Obstacle[] = [];
  const plan = planFloor(departments, places);
  const { x0, x1, z0, z1 } = plan;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;

  // Below the floor, so no shadows; bands merged into one mesh for fewer draw calls.
  noShadow.push(boxIn(group, w, TOWER_DEPTH, d, m.mat(0x8fa2b8), cx, -TOWER_DEPTH / 2 - 0.4, cz));
  const bands: THREE.BufferGeometry[] = [];
  for (let y = -STOREY; y > -TOWER_DEPTH; y -= STOREY) bands.push(new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4).translate(cx, y, cz));
  const banding = new THREE.Mesh(mergeGeometries(bands), m.mat(0xdde2e7));
  bands.forEach((band) => band.dispose());
  group.add(banding);
  noShadow.push(banding);
  boxIn(group, w + 0.4, 0.4, d + 0.4, m.mat(0xd9d4cc), cx, -0.2, cz);
  slabIn(group, x0, x1, z0, z1, m.surface('concrete', 0xb4aea4, 0.5), 0.01, 4);

  // The floor is a whole number of bays wide, so mullions line up with the office walls.
  const mullion = m.mat(0x3b4250);
  const across = Math.round(w / BAY);
  const deep = Math.round(d / 3);
  for (let k = 0; k <= across; k++) {
    const x = x0 + (k / across) * w;
    boxIn(group, 0.12, STOREY, 0.12, mullion, x, STOREY / 2, z0);
    boxIn(group, 0.12, STOREY, 0.12, mullion, x, STOREY / 2, z1);
  }
  for (let k = 0; k <= deep; k++) {
    const z = z0 + (k / deep) * d;
    boxIn(group, 0.12, STOREY, 0.12, mullion, x0, STOREY / 2, z);
    boxIn(group, 0.12, STOREY, 0.12, mullion, x1, STOREY / 2, z);
  }
  for (const [pw, pd, px, pz] of [
    [w, 0.05, cx, z0],
    [w, 0.05, cx, z1],
    [0.05, d, x0, cz],
    [0.05, d, x1, cz],
  ]) {
    glass.push(boxIn(group, pw, STOREY, pd, m.pane(), px, STOREY / 2, pz));
    boxIn(group, pw + 0.1, 0.15, pd + 0.1, mullion, px, 0.075, pz);
  }
  obstacles.push({ x: cx, z: z0, hx: w / 2, hz: 0.1 }, { x: cx, z: z1, hx: w / 2, hz: 0.1 }, { x: x0, z: cz, hx: 0.1, hz: d / 2 }, { x: x1, z: cz, hx: 0.1, hz: d / 2 });

  placeKit(group, 'lift_core', plan.core.x, plan.core.z);
  obstacles.push({ x: plan.core.x, z: plan.core.z, hx: 4, hz: 2 });

  // Blender marks serve/seat/block spots in each piece; they land once the kit has loaded.
  const spots = new Map<string, PlaceSpots>();
  const ready = Promise.all(
    plan.places.map(async ({ place, centre }) => {
      const piece = place.kind as KitPiece;
      placeKit(group, piece, centre.x, centre.z);
      const here: PlaceSpots = { serve: [], seat: [] };
      spots.set(place.key, here);
      for (const mark of await kitMarkers(piece)) {
        const at = new THREE.Vector3(centre.x + mark.x, 0, centre.z + mark.z);
        if (mark.kind === 'block') obstacles.push({ x: at.x, z: at.z, hx: mark.w / 2, hz: mark.d / 2 });
        else here[mark.kind].push({ at, facing: mark.rotationY });
      }
    }),
  ).then(() => undefined);

  // Built with the floor so it repaints once the pixel font has loaded.
  noShadow.push(plaque(group, m, new THREE.Vector3(0, 0, -OFFICE.hz), new THREE.Vector3(0, 0, -1), 'Human', null, '#ffc861', '#1d1405'));

  const rooms = new Map<string, Room>();
  const toYou = new THREE.Vector3(0, 0, 1);
  for (const zone of plan.zones) {
    const dept = zone.department;
    const colour = new THREE.Color(dept.colour);
    const room = new THREE.Group();
    const tint = new THREE.Color(0xe2ded6).lerp(colour, 0.28).getHex();
    slabIn(room, zone.x0, zone.x1, zone.z0, zone.z1, m.surface('carpet', tint, 1), 0.02, 1);
    const edge = new THREE.Vector3(zone.centre.x, 0, zone.z1);
    const agents = dept.agents?.length ?? 0;
    const line = agents ? `${plural(agents, 'agent')} · ${plural(desksOf(dept), 'desk')}` : 'No agents yet';
    noShadow.push(plaque(room, m, edge, toYou, dept.name, line, dept.colour, '#ffffff'));
    noShadow.push(floorName(room, m, edge, toYou.clone().negate(), zone.z1 - zone.z0, zone.x1 - zone.x0, dept.name, `#${colour.clone().multiplyScalar(0.55).getHexString()}`));
    const felt = new THREE.Color(0x9aa0a6).lerp(colour, 0.6).getHex();
    for (const pod of zone.pods) {
      placeKit(room, 'pod_screen', pod.x, pod.z, 0, felt);
      obstacles.push({ x: pod.x, z: pod.z, hx: 1.75, hz: 0.9 });
    }
    for (const desk of zone.desks) placeKit(room, 'workstation', desk.spot.x, desk.spot.z, Math.atan2(desk.inward.x, desk.inward.z));
    group.add(room);
    rooms.set(dept.key, { group: room });
  }

  const ceiling = new THREE.Group();
  const tiles = new THREE.PlaneGeometry(w, d);
  const uv = tiles.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 1.2, (uv.getY(i) * d) / 1.2);
  const underside = new THREE.Mesh(tiles, m.ceiling());
  underside.rotation.x = Math.PI / 2;
  underside.position.set(cx, STOREY, cz);
  ceiling.add(underside);
  // Kept 2 m in from the glass so no panel meets a window.
  const lights: Spot[] = [];
  const grid = (from: number, to: number, step: number) => {
    const count = Math.max(1, Math.floor((to - from - 4) / step) + 1);
    const first = (from + to) / 2 - ((count - 1) * step) / 2;
    return range(count).map((i) => Math.round((first + i * step) / 0.6) * 0.6);
  };
  for (const x of grid(x0, x1, 6)) for (const z of grid(z0, z1, 4.8)) lights.push({ x, y: STOREY - 0.075, z });
  placeKitMany(ceiling, 'ceiling_light', lights);
  ceiling.visible = false;
  group.add(ceiling);

  shadows(group, new Set([...glass, ...noShadow, ...ceiling.children]));
  return {
    group,
    plan,
    ceiling,
    rooms,
    obstacles,
    spots,
    ready,
    centre: new THREE.Vector3(cx, 0, cz),
    size: Math.max(w, d),
    dispose: () => {
      disposeGeometry(group);
      m.dispose();
    },
  };
}

export function fitSun(sun: THREE.DirectionalLight, floor: Floor) {
  const half = floor.size / 2 + 4;
  Object.assign(sun.shadow.camera, {
    left: -half,
    right: half,
    top: half,
    bottom: -half,
    near: 1,
    far: 300,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.copy(floor.centre);
  sun.position.copy(floor.centre).add(new THREE.Vector3(40, 60, 25));
}
