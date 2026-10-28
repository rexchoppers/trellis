import * as THREE from 'three';
import type { config, jobs } from '../../../wailsjs/go/models';
import { STOREY, type Materials, type Obstacle } from './build';
import type { Row } from './fittings';
import { placeKit } from './kit';
import type { AgentHit } from './people';

const RACK = 0.6;
const TOP_SLOT = 1.85;
const SLOT = 0.1;
const SLOTS = 17;
// Server fronts sit just behind the rack's rails.
const FRONT = 0.43;

type State = 'working' | 'needs_you' | 'resting' | 'idle';
type Unit = { hit: AgentHit; leds: THREE.Mesh[]; state: State; phase: number };
type Rect = { x0: number; z0: number; x1: number; z1: number };

// The server room's racks: one per department in its colour, one server per agent, whose lights show what the
// agent is doing: green flickering while working, amber when it needs you, blue while resting between checks, dark
// with no job. Clicking a server opens its agent. Inside, the room hums.
export function serverRoom(parent: THREE.Object3D, m: Materials, departments: config.Department[], obstacles: Obstacle[], room: Rect) {
  const units: Unit[] = [];
  const holders = new Map<THREE.Object3D, Unit>();
  let list: jobs.Job[] = [];
  const glow = (colour: number) => m.own(new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 3 }));
  const lit: Record<Exclude<State, 'idle'>, THREE.Material> = { working: glow(0x3ddc84), needs_you: glow(0xffb020), resting: glow(0x4aa3ff) };
  const dark = m.own(new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.4 }));

  const states = () => {
    for (const unit of units) {
      const runs = list.filter((run) => run.department === unit.hit.department && run.agent === unit.hit.agent);
      const working = runs.find((run) => run.state === 'working');
      const asking = runs.find((run) => run.state === 'needs_you');
      unit.state = working ? 'working' : asking ? 'needs_you' : runs.some((run) => run.state === 'waiting') ? 'resting' : 'idle';
      unit.hit = { department: unit.hit.department, agent: unit.hit.agent, run: (working ?? asking)?.id };
    }
  };

  // Departments fill the rows in order, as many racks as each row holds.
  const build = (rows: Row[]) => {
    let next = 0;
    for (const row of rows) {
      const along = new THREE.Vector3(Math.cos(row.rotationY), 0, -Math.sin(row.rotationY));
      const ahead = new THREE.Vector3(Math.sin(row.rotationY), 0, Math.cos(row.rotationY));
      for (let i = 0; i < Math.floor(row.w / RACK) && next < departments.length; i++, next++) {
        const department = departments[next];
        const at = new THREE.Vector3(row.x, 0, row.z).addScaledVector(along, RACK / 2 + i * RACK);
        const top = m.mat(new THREE.Color(department.colour).getHex());
        placeKit(parent, 'server_rack', at.x, at.z, row.rotationY, undefined, (copy) =>
          copy.traverse((object) => {
            if (object instanceof THREE.Mesh && (object.material as THREE.Material).name === 'rack_top') object.material = top;
          }),
        );
        obstacles.push({ x: at.x, z: at.z, hx: Math.abs(along.x) * 0.3 + Math.abs(ahead.x) * 0.5, hz: Math.abs(along.z) * 0.3 + Math.abs(ahead.z) * 0.5 });
        (department.agents ?? []).slice(0, SLOTS).forEach((agent, slot) => {
          const unit: Unit = { hit: { department: department.key, agent: agent.key }, leds: [], state: 'idle', phase: Math.random() * 1000 };
          const front = at.clone().addScaledVector(ahead, FRONT);
          const holder = placeKit(parent, 'server_unit', front.x, front.z, row.rotationY, undefined, (copy) =>
            copy.traverse((object) => {
              if (object instanceof THREE.Mesh && (object.material as THREE.Material).name === 'server_led') {
                object.material = dark;
                unit.leds.push(object);
              }
            }),
          );
          holder.position.y = TOP_SLOT - slot * SLOT;
          units.push(unit);
          holders.set(holder, unit);
        });
      }
    }
    states();
  };

  // A low fan hum, louder once you are inside; made on first entry, after a key has been pressed to walk there.
  let audio: AudioContext | undefined;
  let hum: GainNode | undefined;
  const humming = (inside: boolean) => {
    if (!inside && !hum) return;
    if (!audio) {
      audio = new AudioContext();
      hum = audio.createGain();
      hum.gain.value = 0;
      hum.connect(audio.destination);
      const buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const fans = audio.createBufferSource();
      fans.buffer = buffer;
      fans.loop = true;
      const filter = audio.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      fans.connect(filter).connect(hum);
      const drone = audio.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = 100;
      const level = audio.createGain();
      level.gain.value = 0.4;
      drone.connect(level).connect(hum);
      fans.start();
      drone.start();
    }
    hum?.gain.setTargetAtTime(inside ? 0.12 : 0, audio.currentTime, 0.4);
  };
  let wasInside = false;

  return {
    build,
    objects: () => [...holders.keys()],
    // The agent whose server an object belongs to.
    hitFor: (object: THREE.Object3D | undefined) => {
      for (let at = object ?? null; at; at = at.parent) {
        const unit = holders.get(at);
        if (unit) return unit.hit;
      }
      return undefined;
    },
    show: (next: jobs.Job[]) => {
      list = next;
      states();
    },
    update: (now: number, eye: THREE.Vector3 | null) => {
      for (const unit of units) {
        const flicker = unit.state === 'working' ? (now + unit.phase) % 180 < 110 : true;
        const material = unit.state === 'idle' || !flicker ? dark : lit[unit.state];
        for (const led of unit.leds) led.material = material;
      }
      const inside = !!eye && eye.y < STOREY && eye.x > room.x0 && eye.x < room.x1 && eye.z > room.z0 && eye.z < room.z1;
      if (inside !== wasInside) humming(inside);
      wasInside = inside;
    },
    dispose: () => void audio?.close(),
  };
}
