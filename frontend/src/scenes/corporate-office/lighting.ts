import { sortBy } from 'es-toolkit';
import * as THREE from 'three';
import { numberStrip, STOREY, type Materials } from './build';
import { placeKit, placeKitMany, type Spot } from './kit';
import type { Row } from './fittings';

// The sun only reaches in through the windows (the ceiling casts its shadow), and three.js has no bounce light,
// so the light that fills the floor is worked out per room here. Daylight from the windows fades over the first
// few metres; past that, and in rooms with solid walls, the room's own lights are what light it.
const ROOMS = 32;
const LIT = 1.5;
const DAY_EDGE = 1.5;
const DAY_DEEP = 0.3;
const DAY_REACH = 7;
const DARK = 0.04;
// How far a lit area's light carries past its edge, where there is no wall to stop it.
const SPILL = 1.5;
const PITCH = 0.044;

export type Area = { key: string; name: string; x0: number; z0: number; x1: number; z1: number; enclosed?: boolean; circuit?: number; bank?: 'building' | 'departments' };

const uniforms = {
  uRooms: { value: Array.from({ length: ROOMS }, () => new THREE.Vector4()) },
  // x: lights on, y: solid walls.
  uRoomState: { value: Array.from({ length: ROOMS }, () => new THREE.Vector2()) },
  uRoomCount: { value: 0 },
  // The floor's glass edges, and whether there is a floor to light at all (w).
  uFloor: { value: new THREE.Vector4() },
  uFloorOn: { value: 0 },
};

const VERTEX = /* glsl */ `
#include <project_vertex>
vec4 roomWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  roomWorld = instanceMatrix * roomWorld;
#endif
vRoomPos = ( modelMatrix * roomWorld ).xyz;
`;

const FRAGMENT = /* glsl */ `
uniform vec4 uRooms[ ${ROOMS} ];
uniform vec2 uRoomState[ ${ROOMS} ];
uniform int uRoomCount;
uniform vec4 uFloor;
uniform float uFloorOn;
varying vec3 vRoomPos;
float roomLight() {
  vec3 p = vRoomPos;
  if ( uFloorOn < 0.5 || p.y < -0.05 || p.y > ${STOREY + 0.05} || p.x < uFloor.x || p.x > uFloor.z || p.z < uFloor.y || p.z > uFloor.w ) return 1.0;
  int own = -1;
  for ( int i = 0; i < ${ROOMS}; i ++ ) {
    if ( i >= uRoomCount ) break;
    vec4 r = uRooms[ i ];
    if ( p.x >= r.x && p.x <= r.z && p.z >= r.y && p.z <= r.w ) {
      own = i;
      break;
    }
  }
  vec2 state = own >= 0 ? uRoomState[ own ] : vec2( 1.0, 0.0 );
  float lit = state.x;
  if ( state.y < 0.5 && own >= 0 ) {
    // Light from lit areas nearby carries a little way in; the last area (the open plan) holds every other,
    // so its light comes in from the edge of the area the point is in.
    for ( int i = 0; i < ${ROOMS} - 1; i ++ ) {
      if ( i >= uRoomCount - 1 ) break;
      if ( i == own || uRoomState[ i ].x < 0.5 || uRoomState[ i ].y > 0.5 ) continue;
      vec4 r = uRooms[ i ];
      vec2 out2 = max( max( r.xy - p.xz, p.xz - r.zw ), 0.0 );
      lit = max( lit, 1.0 - smoothstep( 0.0, ${SPILL.toFixed(1)}, length( out2 ) ) );
    }
    vec4 o = uRooms[ own ];
    float inside = min( min( p.x - o.x, o.z - p.x ), min( p.z - o.y, o.w - p.z ) );
    if ( own != uRoomCount - 1 && uRoomState[ uRoomCount - 1 ].x > 0.5 ) lit = max( lit, 1.0 - smoothstep( 0.0, ${SPILL.toFixed(1)}, inside ) );
  }
  float edge = min( min( p.x - uFloor.x, uFloor.z - p.x ), min( p.z - uFloor.y, uFloor.w - p.z ) );
  float day = state.y > 0.5 ? 0.0 : mix( ${DAY_EDGE.toFixed(2)}, ${DAY_DEEP.toFixed(2)}, smoothstep( 0.0, ${DAY_REACH.toFixed(1)}, edge ) );
  return max( max( day, lit * ${LIT.toFixed(2)} ), ${DARK.toFixed(2)} );
}
`;

// Every material's indirect light (sky, environment, and the flat light of unlit materials) is scaled by the
// room it falls in; direct light (the sun through the windows) is left alone. Patched on the prototype so
// materials made later, the kit's included, all take it.
let patched = false;
export function installRoomLight() {
  if (patched) return;
  patched = true;
  THREE.Material.prototype.onBeforeCompile = function (this: THREE.Material, shader) {
    if (!shader.fragmentShader.includes('#include <aomap_fragment>') || !shader.vertexShader.includes('#include <project_vertex>')) return;
    // Unlit materials (signs, the ceiling) only ever dim: a lit room shows them as they are.
    const k = (this as THREE.MeshBasicMaterial).isMeshBasicMaterial ? 'min( roomLight(), 1.0 )' : 'roomLight()';
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 vRoomPos;\n${shader.vertexShader.replace('#include <project_vertex>', VERTEX)}`;
    shader.fragmentShader = `${FRAGMENT}\n${shader.fragmentShader.replace(
      '#include <aomap_fragment>',
      `{ float roomK = ${k}; reflectedLight.indirectDiffuse *= roomK; reflectedLight.indirectSpecular *= roomK; }\n#include <aomap_fragment>`,
    )}`;
  };
}

// Breakers switched off stay off when the floor is rebuilt.
const switchedOff = new Set<string>();

// Each area's lights: its ceiling panels, its share of the room light, and a breaker on the distribution board.
// areas run from most specific to least: the first that holds a point is the room it is in. Areas with a circuit
// get a breaker, in circuit order within their bank; the rest stay lit.
export function lighting(ceiling: THREE.Object3D, parent: THREE.Object3D, m: Materials, floor: { x0: number; z0: number; x1: number; z1: number }, areas: Area[], panels: Spot[]) {
  installRoomLight();
  const used = areas.slice(0, ROOMS);
  const switched = sortBy(used.filter((area) => area.circuit !== undefined), [(area) => area.circuit ?? 0]);
  const glows = new Map<string, { material: THREE.MeshStandardMaterial; on: number }[]>();
  const levers = new Map<string, THREE.Mesh[]>();

  const show = () => {
    used.forEach((area, i) => {
      uniforms.uRooms.value[i].set(area.x0, area.z0, area.x1, area.z1);
      uniforms.uRoomState.value[i].set(switchedOff.has(area.key) ? 0 : 1, area.enclosed ? 1 : 0);
      const on = !switchedOff.has(area.key);
      for (const glow of glows.get(area.key) ?? []) glow.material.emissiveIntensity = on ? glow.on : 0;
      for (const lever of levers.get(area.key) ?? []) lever.position.y = on ? 0.012 : -0.012;
    });
  };
  uniforms.uRoomCount.value = used.length;
  uniforms.uFloor.value.set(floor.x0, floor.z0, floor.x1, floor.z1);
  uniforms.uFloorOn.value = 1;

  // Ceiling panels go in by area, so an area's panels can go dark with its lights.
  const inside = (area: Area, x: number, z: number) => x >= area.x0 && x <= area.x1 && z >= area.z0 && z <= area.z1;
  const byArea = new Map<string, Spot[]>();
  for (const spot of panels) {
    const area = used.find((candidate) => inside(candidate, spot.x, spot.z));
    if (area) byArea.set(area.key, [...(byArea.get(area.key) ?? []), spot]);
  }
  for (const [key, spots] of byArea) {
    const own: { material: THREE.MeshStandardMaterial; on: number }[] = [];
    glows.set(key, own);
    placeKitMany(ceiling, 'ceiling_light', spots, (material) => {
      if (material.name !== 'diffuser') return material;
      const copy = m.own((material as THREE.MeshStandardMaterial).clone());
      own.push({ material: copy, on: copy.emissiveIntensity });
      return copy;
    });
  }
  show();

  const toggle = (key: string) => {
    if (switchedOff.has(key)) switchedOff.delete(key);
    else switchedOff.add(key);
    show();
  };

  // The building's breakers fill the top row and the departments' the bottom one, numbered on from each other
  // on a strip under each row. Returns what went on each row, for the circuit chart.
  const breakers = (rows: Row[], add: (object: THREE.Object3D, action: () => void) => void) => {
    const sections: { title: string; names: string[] }[] = [];
    let n = 0;
    sortBy(rows, [(row) => -row.y]).forEach((row, r) => {
      const bank = r === 0 ? 'building' : 'departments';
      const fitted = switched.filter((area) => (area.bank ?? 'building') === bank).slice(0, Math.floor(row.w / PITCH));
      const along = new THREE.Vector3(Math.cos(row.rotationY), 0, -Math.sin(row.rotationY));
      const out = new THREE.Vector3(Math.sin(row.rotationY), 0, Math.cos(row.rotationY));
      fitted.forEach((area, i) => {
        const at = new THREE.Vector3(row.x, 0, row.z).addScaledVector(along, PITCH / 2 + i * PITCH);
        const unit = placeKit(parent, 'breaker', at.x, at.z, row.rotationY, undefined, (copy) =>
          copy.traverse((object) => {
            if (!(object instanceof THREE.Mesh) || (object.material as THREE.Material).name !== 'breaker_lever') return;
            levers.set(area.key, [...(levers.get(area.key) ?? []), object]);
            object.position.y = switchedOff.has(area.key) ? -0.012 : 0.012;
          }),
        );
        unit.position.y = row.y;
        add(unit, () => toggle(area.key));
      });
      if (!fitted.length) return;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(row.w, 0.022), numberStrip(m, n + 1, fitted.length, row.w, PITCH));
      strip.position.set(row.x, row.y - 0.085, row.z).addScaledVector(along, row.w / 2).addScaledVector(out, -0.009);
      strip.rotation.y = row.rotationY;
      parent.add(strip);
      sections.push({ title: bank === 'building' ? 'Building' : 'Departments', names: fitted.map((area) => area.name) });
      n += fitted.length;
    });
    return sections;
  };

  return {
    breakers,
    dispose: () => {
      uniforms.uFloorOn.value = 0;
    },
  };
}
