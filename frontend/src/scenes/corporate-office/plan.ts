import { sortBy, sum, sumBy } from 'es-toolkit';
import * as THREE from 'three';
import type { config } from '../../../wailsjs/go/models';
import { MAX_DESKS } from '@/lib/desks';

// Back (+z) to front (-z): your office (centred on the origin, door at -z), aisle, a row of department zones, front aisle, lifts and places.

// Window bars stand every BAY metres from the centre; the office's side walls stand on them.
export const BAY = 3;
export const OFFICE = { hx: 2 * BAY, hz: 3.5 };
export const DESK_Z = OFFICE.hz - 2.1;
const POD = { w: 4.2, d: 2.6 };
const ZONE_DEPTH = 6.8;
const ZONE_PAD = 0.9;
const ZONE_GAP = 2.2;
const AISLE = 3;
const FRONT = 8.5;
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
const PLACE_GAP = 4;
const CORE_HALF = 4;

type PlacedPlace = { place: config.Place; centre: THREE.Vector3; w: number; d: number };

export type Plan = {
  zones: Zone[];
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  core: THREE.Vector3;
  places: PlacedPlace[];
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
  const row = sum(widths) + ZONE_GAP * Math.max(0, widths.length - 1);
  const z1 = -OFFICE.hz - AISLE;
  const z0 = z1 - ZONE_DEPTH;
  const aisle = (z1 - OFFICE.hz) / 2 - 0.25;
  const zones: Zone[] = [];
  let x = -row / 2;
  ordered.forEach((department, n) => {
    const w = widths[n];
    const zone: Zone = { department, x0: x, x1: x + w, z0, z1, centre: new THREE.Vector3(x + w / 2, 0, (z0 + z1) / 2), pods: [], desks: [] };
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
        const out = dz > 0 ? [back, new THREE.Vector3(back.x, 0, aisle)] : [back, new THREE.Vector3(end, 0, back.z), new THREE.Vector3(end, 0, aisle)];
        zone.desks.push({ spot, inward, seat, out });
      }
    }
    zones.push(zone);
    x += w + ZONE_GAP;
  });
  // A whole number of bays each side of the centre, so the window bars line up with your office.
  const half = Math.ceil(Math.max(row / 2 + MARGIN, MIN_HALF) / BAY) * BAY;
  const front = Math.min(z0 - FRONT, OFFICE.hz + 0.1 - MIN_DEPTH);
  const walkways: THREE.Vector3[] = [];
  const stops = [-half + 1.5, ...zones.slice(1).map((zone) => zone.x0 - ZONE_GAP / 2), half - 1.5, ...zones.map((zone) => zone.centre.x)];
  for (const sx of stops) walkways.push(new THREE.Vector3(sx, 0, aisle), new THREE.Vector3(sx, 0, z0 - 2));
  // Places alternate either side of the lifts, each side filling outwards.
  const reach = [CORE_HALF, CORE_HALF];
  const placed: PlacedPlace[] = [];
  for (const place of sortBy(places, [(p) => p.order ?? 0])) {
    const size = PLACE_KINDS[place.kind];
    if (!size) continue;
    const side = placed.length % 2;
    const x = (side ? 1 : -1) * (reach[side] + PLACE_GAP + size.w / 2);
    reach[side] += PLACE_GAP + size.w;
    placed.push({ place, centre: new THREE.Vector3(x, 0, front + 0.5 + size.d / 2), ...size });
  }
  return {
    zones,
    x0: -half,
    x1: half,
    z0: front - 0.5,
    z1: OFFICE.hz + 0.1,
    core: new THREE.Vector3(0, 0, front + 2.5),
    places: placed,
    walkways,
  };
}
