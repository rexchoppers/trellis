import { sumBy } from 'es-toolkit';
import * as THREE from 'three';
import type { config, jobs } from '../../../wailsjs/go/models';
import { DESK_Z, OFFICE, type Desk, type Plan } from './plan';

export type AgentHit = { department: string; agent: string; run?: string };

export type Person = {
  id: string;
  hit: AgentHit;
  name: string;
  working: boolean;
  doing: string;
  colour: string;
  seat: THREE.Vector3;
  facing: number;
  out: THREE.Vector3[];
  place: 'desk' | 'human';
  queue: number;
};

export function route(person: Person) {
  const front = new THREE.Vector3((person.queue % 2 ? 1.2 : -1.2) * Math.ceil(person.queue / 2), 0, DESK_Z - 1.2 - Math.floor((person.queue + 1) / 2) * 0.2);
  return [...person.out, new THREE.Vector3(0, 0, -OFFICE.hz - 0.9), new THREE.Vector3(0, 0, -OFFICE.hz + 1.1), front];
}

const sitAt = (desk: Desk) => ({ seat: desk.seat, facing: Math.atan2(desk.inward.x, desk.inward.z), out: desk.out });

export function people(plan: Plan, list: jobs.Job[]): Person[] {
  // Agents resting between checks sit at their desks too.
  const active = list.filter((run) => run.state === 'working' || run.state === 'needs_you' || run.state === 'waiting');
  // desks: any (-1) takes a desk per running job, and keeps one so it is always on the floor.
  const slots = (department: string, agent: config.Agent) => (agent.desks >= 0 ? agent.desks : Math.max(1, active.filter((run) => run.department === department && run.agent === agent.key).length));
  let queue = 0;
  const seen = new Set<string>();
  const result: Person[] = [];
  const zones = new Map(plan.zones.map((zone) => [zone.department.key, zone]));
  for (const run of [...active].reverse()) {
    const zone = zones.get(run.department);
    if (!zone?.desks.length) continue;
    const department = zone.department;
    const agents = department.agents ?? [];
    const at = agents.findIndex((agent) => agent.key === run.agent);
    if (at < 0) continue;
    // Each running copy of an agent takes the next of that agent's desks.
    const copy = active.filter((other) => other.department === run.department && other.agent === run.agent && seen.has(other.id)).length;
    seen.add(run.id);
    const first = sumBy(agents.slice(0, at), (agent) => slots(department.key, agent));
    const desk = zone.desks[Math.min(first + copy, zone.desks.length - 1)];
    const waiting = run.state === 'needs_you';
    result.push({
      id: run.id,
      hit: { department: run.department, agent: run.agent, run: run.id },
      working: run.state === 'working',
      doing: run.progress?.find((step) => step.status === 'active')?.name || run.doing || 'Thinking',
      name: agents[at].name,
      colour: department.colour,
      ...sitAt(desk),
      place: waiting ? 'human' : 'desk',
      queue: waiting ? queue++ : 0,
    });
  }
  for (const zone of plan.zones) {
    const department = zone.department;
    if (!zone.desks.length) continue;
    let first = 0;
    for (const agent of department.agents ?? []) {
      const busy = active.filter((run) => run.department === department.key && run.agent === agent.key).length;
      for (let desk = busy; desk < slots(department.key, agent); desk++) {
        const at = zone.desks[Math.min(first + desk, zone.desks.length - 1)];
        result.push({
          id: `free:${department.key}/${agent.key}/${desk}`,
          hit: { department: department.key, agent: agent.key },
          working: false,
          doing: '',
          name: agent.name,
          colour: department.colour,
          ...sitAt(at),
          place: 'desk',
          queue: 0,
        });
      }
      first += slots(department.key, agent);
    }
  }
  return result;
}
