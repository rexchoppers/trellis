import { sortBy, sumBy } from 'es-toolkit';
import * as THREE from 'three';
import type { config } from '../../../wailsjs/go/models';
import { MAX_DESKS } from '@/lib/desks';

// Back (+z) to front (-z): your office (centred on the origin, door at -z), aisle, two rows of department zones either side
// of an open line from your office door to reception, lifts and places.

// Window bars stand every BAY metres from the centre; the office's side walls stand on them.
export const BAY = 3;
export const OFFICE = { hx: 2 * BAY, hz: 3.5 };
export const DESK_Z = OFFICE.hz - 2.1;
const POD = { w: 4.2, d: 2.6 };
const ZONE_DEPTH = 6.8;
const ZONE_PAD = 0.9;
const AISLE = 3;
// Between the back and front rows of departments.
const CROSS = 2.5;
// Half the open line from your office door to reception; departments fill outwards from it.
const SPINE = 4.5;
// Each department has a feature wall this far past its outer edge, halfway to the next department.
const WALL_GAP = 1.5;
const WALL_STYLES = ['feature_board', 'feature_shelf', 'feature_planter', 'feature_gallery', 'feature_display'] as const;
// Room in front of the lifts for reception, up to the front row of departments.
const FRONT = 13.8;
const MARGIN = 4;
// The floor is never smaller than this, so there is room for departments to come.
const MIN_HALF = 45;
const MIN_DEPTH = 40;

export type Desk = { spot: THREE.Vector3; inward: THREE.Vector3; seat: THREE.Vector3; out: THREE.Vector3[] };

type Zone = {
  department: config.Department;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  centre: THREE.Vector3;
  pods: THREE.Vector3[];
  desks: Desk[];
};

const PLACE_KINDS: Record<string, { w: number; d: number }> = { kitchen: { w: 12, d: 8 } };
// The breakout area sits beside the first kitchen, on its far side from the lifts.
const BREAKOUT = { w: 12, d: 8 };
const PLACE_GAP = 4;
const CORE_HALF = 4;
// The waiting room sits right of the lifts, against the front windows.
const WAITING = { x0: 5.5, x1: 11.5, depth: 6 };
// The arrival hub is a wall just past the waiting room, square to the front windows, with lockers, parcel lockers and
// vending along its far side.
const HUB = { gap: 2.45, length: 9.6, depth: 0.95 };
// The town hall fills the front corner on the waiting room's side, its seating along both windows.
const TOWN_HALL = { w: 12, d: 12 };

type PlacedPlace = { place: config.Place; centre: THREE.Vector3; w: number; d: number };

export type Plan = {
  zones: Zone[];
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  core: THREE.Vector3;
  reception: THREE.Vector3;
  waiting: { x0: number; x1: number; z0: number; z1: number; centre: THREE.Vector3 };
  places: PlacedPlace[];
  breakout: { centre: THREE.Vector3; w: number; d: number };
  townHall: { centre: THREE.Vector3; w: number; d: number };
  hub: THREE.Vector3;
  walls: { centre: THREE.Vector3; style: (typeof WALL_STYLES)[number]; rotationY: number; department: config.Department }[];
  walkways: THREE.Vector3[];
};

export const desksOf = (department: config.Department) =>
  Math.min(
    sumBy(department.agents ?? [], (agent) => (agent.desks >= 0 ? agent.desks : 1)),
    MAX_DESKS,
  );

export function planFloor(departments: config.Department[], places: config.Place[] = []): Plan {
  const ordered = sortBy(departments, [(d) => d.order ?? 0]);
  const widths = ordered.map((d) => Math.max(1, Math.ceil(desksOf(d) / 4)) * POD.w + ZONE_PAD * 2);
  const z1 = -OFFICE.hz - AISLE;
  const rows = [z1, z1 - ZONE_DEPTH - CROSS];
  const aisle = (z1 - OFFICE.hz) / 2 - 0.25;
  const cross = z1 - ZONE_DEPTH - CROSS / 2;
  const zones: Zone[] = [];
  const walls: Plan['walls'] = [];
  // Left then right, back row then front, each filling outwards: [side][row].
  const filled = [
    [SPINE, SPINE],
    [SPINE, SPINE],
  ];
  ordered.forEach((department, n) => {
    const side = n % 2;
    const row = Math.floor(n / 2) % 2;
    const w = widths[n];
    const x0 = side ? filled[side][row] : -filled[side][row] - w;
    filled[side][row] += w + WALL_GAP * 2;
    const zone: Zone = { department, x0, x1: x0 + w, z0: rows[row] - ZONE_DEPTH, z1: rows[row], centre: new THREE.Vector3(x0 + w / 2, 0, rows[row] - ZONE_DEPTH / 2), pods: [], desks: [] };
    // Some walls are dressed on their +x face only, so turn that face toward the department's desks.
    walls.push({ centre: new THREE.Vector3(side ? zone.x1 + WALL_GAP : zone.x0 - WALL_GAP, 0, zone.centre.z), style: WALL_STYLES[n % WALL_STYLES.length], rotationY: side ? Math.PI : 0, department });
    // The back row walks the aisle to your door; the front row walks the cross aisle to the open line, then up it.
    const lane = row ? cross : aisle;
    const toLine = row ? [new THREE.Vector3(0, 0, cross)] : [];
    const count = desksOf(department);
    const pods = Math.max(1, Math.ceil(count / 4));
    for (let p = 0; p < pods; p++) {
      const pod = new THREE.Vector3(zone.centre.x + (p - (pods - 1) / 2) * POD.w, 0, zone.centre.z);
      if (p * 4 < count) zone.pods.push(pod);
      // The pair nearer your office first, so a part-filled pod faces you.
      for (const [dx, dz] of [
        [-0.82, 0.45],
        [0.82, 0.45],
        [-0.82, -0.45],
        [0.82, -0.45],
      ]) {
        if (zone.desks.length >= count) break;
        const spot = new THREE.Vector3(pod.x + dx, 0, pod.z + dz);
        const inward = new THREE.Vector3(0, 0, dz > 0 ? -1 : 1);
        const seat = spot.clone().addScaledVector(inward, -0.75);
        const back = seat.clone().addScaledVector(inward, -0.6);
        // The far pair walks round the end of its pod first.
        const end = pod.x + Math.sign(dx) * (POD.w / 2);
        const out = dz > 0 ? [back, new THREE.Vector3(back.x, 0, lane)] : [back, new THREE.Vector3(end, 0, back.z), new THREE.Vector3(end, 0, lane)];
        zone.desks.push({ spot, inward, seat, out: [...out, ...toLine] });
      }
    }
    zones.push(zone);
  });
  const outer = Math.max(0, ...walls.map((wall) => Math.abs(wall.centre.x)));
  // A whole number of bays each side of the centre, so the window bars line up with your office.
  const half = Math.ceil(Math.max(outer + MARGIN, MIN_HALF) / BAY) * BAY;
  const front = Math.min(rows[1] - ZONE_DEPTH - FRONT, OFFICE.hz + 0.1 - MIN_DEPTH);
  const walkways: THREE.Vector3[] = [];
  for (const x of [0, -half + 1.5, half - 1.5, ...zones.map((zone) => zone.centre.x)]) walkways.push(new THREE.Vector3(x, 0, aisle), new THREE.Vector3(x, 0, cross));
  // Places alternate either side of the lifts, each side filling outwards.
  const townHall = { centre: new THREE.Vector3(half - TOWN_HALL.w / 2, 0, front - 0.5 + TOWN_HALL.d / 2), w: TOWN_HALL.w, d: TOWN_HALL.d };
  const hub = new THREE.Vector3(WAITING.x1 + HUB.gap, 0, front + HUB.length / 2);
  const reach = [CORE_HALF, hub.x + HUB.depth];
  const placed: PlacedPlace[] = [];
  let breakout: Plan['breakout'] | undefined;
  const beside = (side: number) => {
    const x = (side ? 1 : -1) * (reach[side] + PLACE_GAP + BREAKOUT.w / 2);
    reach[side] += PLACE_GAP + BREAKOUT.w;
    breakout = { centre: new THREE.Vector3(x, 0, front + 0.5 + BREAKOUT.d / 2), ...BREAKOUT };
  };
  for (const place of sortBy(places, [(p) => p.order ?? 0])) {
    const size = PLACE_KINDS[place.kind];
    if (!size) continue;
    const side = placed.length % 2;
    const x = (side ? 1 : -1) * (reach[side] + PLACE_GAP + size.w / 2);
    reach[side] += PLACE_GAP + size.w;
    placed.push({ place, centre: new THREE.Vector3(x, 0, front + 0.5 + size.d / 2), ...size });
    if (place.kind === 'kitchen' && !breakout) beside(side);
  }
  // With no kitchen it takes the kitchen's spot.
  if (!breakout) beside(0);
  return {
    zones,
    x0: -half,
    x1: half,
    z0: front - 0.5,
    z1: OFFICE.hz + 0.1,
    core: new THREE.Vector3(0, 0, front + 2.5),
    reception: new THREE.Vector3(0, 0, front + 9.5),
    waiting: { x0: WAITING.x0, x1: WAITING.x1, z0: front - 0.5, z1: front - 0.5 + WAITING.depth, centre: new THREE.Vector3((WAITING.x0 + WAITING.x1) / 2, 0, front - 0.5 + WAITING.depth / 2) },
    places: placed,
    breakout: breakout as Plan['breakout'],
    townHall,
    hub,
    walls,
    walkways,
  };
}
