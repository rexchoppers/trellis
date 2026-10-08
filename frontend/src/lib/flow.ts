import { compact, partition, sortBy, sumBy } from 'es-toolkit';
import type { config } from '../../wailsjs/go/models';

export const CARD_W = 280;
export const HEAD_H = 58;
export const STEP_H = 20;
export const ROW_H = 28;
export const LISTEN_H = 22;
const COL_GAP = 240;
const CARD_GAP = 28;
const PAD = 32;
// A column-skipping arrow gets its own lane above the cards so it never crosses one.
const LANE_H = 76;
const CORNER = 10;

export type Node = { key: string; agent: config.Agent; department: config.Department; col: number; x: number; y: number; h: number; stepsH: number };
// Delegation edges belong to the whole agent, so they have no outcome.
export type Edge = { from: string; outcome?: number; to: string; event: string; filter: string; maybe: boolean; back?: boolean; delegate?: boolean };
type Problem = { text: string };
export type Route = { d: string; x: number; y: number; h: number; lane: boolean };

export const keyOf = (d: config.Department, a: config.Agent) => `${d.key}/${a.key}`;
export const describe = (when?: Record<string, string>) =>
  Object.entries(when ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
// A step that owns tools takes a second line for them.
export const stepH = (step: config.StepDef) => STEP_H + ((step.tools ?? []).length ? 14 : 0);
const stepsHeight = (a: config.Agent) => (a.steps?.length ? 10 + sumBy(a.steps, stepH) : 0);

export const outcomeOf = (node: Node, edge: Edge) => (edge.outcome === undefined ? undefined : (node.agent.outcomes ?? [])[edge.outcome]);

// A field missing from the data may still turn up, so it is a maybe; callers decide if that counts.
export function matches(when: Record<string, string> | undefined, data: Record<string, string> | undefined): 'yes' | 'maybe' | 'no' {
  let result: 'yes' | 'maybe' = 'yes';
  for (const [key, value] of Object.entries(when ?? {})) {
    if (data?.[key] === undefined) result = 'maybe';
    else if (data[key] !== value) return 'no';
  }
  return result;
}

// Filters are checked against the outcome's fixed `with`; any other field depends on agent data, so the arrow is dashed.
export function wire(departments: config.Department[]) {
  const agents = departments.flatMap((d) => (d.agents ?? []).map((a) => ({ d, a })));
  const edges: Edge[] = [];
  const problems: Problem[] = [];
  for (const { d, a } of agents) {
    (a.outcomes ?? []).forEach((outcome, index) => {
      if (!outcome.publish) return;
      // Each agent is reached once, through the first of its listeners that takes the event.
      let reached = false;
      for (const other of agents) {
        const listen = (other.a.listens ?? []).find((l) => l.event === outcome.publish && matches(l.when, outcome.with) !== 'no');
        if (!listen) continue;
        edges.push({ from: keyOf(d, a), outcome: index, to: keyOf(other.d, other.a), event: outcome.publish, filter: describe(listen.when), maybe: matches(listen.when, outcome.with) === 'maybe' });
        reached = true;
      }
      if (!reached) problems.push({ text: `${a.name} · ${outcome.label || outcome.name} sends ${outcome.publish}, but nobody is listening for it.` });
    });
  }
  for (const { d, a } of agents) {
    for (const ref of a.delegates ?? []) {
      const target = agents.find((other) => keyOf(other.d, other.a) === ref.trim());
      if (target) edges.push({ from: keyOf(d, a), to: keyOf(target.d, target.a), event: 'delegates', filter: a.every ? `checks every ${a.every}` : '', maybe: true, delegate: true });
      else problems.push({ text: `${a.name} delegates to ${ref}, but there is no such agent.` });
    }
  }
  // An outcome that sends work back goes to whoever hands this agent its work.
  for (const { d, a } of agents) {
    const heard = new Set((a.listens ?? []).map((l) => l.event));
    const senders = agents.filter((other) => (other.a.outcomes ?? []).some((o) => o.publish && heard.has(o.publish)));
    (a.outcomes ?? []).forEach((outcome, index) => {
      if (!outcome.back) return;
      for (const other of senders) edges.push({ from: keyOf(d, a), outcome: index, to: keyOf(other.d, other.a), event: 'sent back', filter: '', maybe: false, back: true });
      if (!senders.length) problems.push({ text: `${a.name} · ${outcome.label || outcome.name} sends work back, but no agent hands ${a.name} any.` });
    });
  }
  const sent = new Set(agents.flatMap(({ a }) => (a.outcomes ?? []).map((o) => o.publish).filter(Boolean)));
  for (const { a } of agents) {
    for (const listen of a.listens ?? []) {
      if (!sent.has(listen.event)) problems.push({ text: `${a.name} listens for ${listen.event}, but no agent sends it.` });
      else if (!edges.some((e) => e.to.endsWith(`/${a.key}`) && e.event === listen.event))
        problems.push({ text: `${a.name} listens for ${listen.event} · ${describe(listen.when)}, but no outcome sending it matches that filter.` });
    }
  }
  return { agents, edges, problems };
}

// An agent sits one column after the furthest agent handing to it; skips and back-edges use lanes.
const laned = (from: number, to: number) => to - from !== 1;

export function layout(agents: { d: config.Department; a: config.Agent }[], edges: Edge[]) {
  const col = new Map(agents.map(({ d, a }) => [keyOf(d, a), 0]));
  for (let pass = 0; pass < agents.length; pass++) {
    let moved = false;
    for (const edge of edges) {
      if (edge.from === edge.to || edge.back || edge.delegate) continue;
      const next = (col.get(edge.from) ?? 0) + 1;
      if (next > (col.get(edge.to) ?? 0) && next < agents.length) {
        col.set(edge.to, next);
        moved = true;
      }
    }
    if (!moved) break;
  }
  const lanes = edges.filter((e) => e.from !== e.to && laned(col.get(e.from) ?? 0, col.get(e.to) ?? 0)).length;
  const top = PAD + lanes * LANE_H;
  const nodes: Node[] = [];
  const heights = new Map<number, number>();
  const touched = new Set(edges.flatMap((e) => [e.from, e.to]));
  const [connected, loose] = partition(agents, ({ d, a }) => touched.has(keyOf(d, a)));
  for (const { d, a } of [...connected, ...loose]) {
    const key = keyOf(d, a);
    const c = col.get(key) ?? 0;
    const stepsH = stepsHeight(a);
    const h = HEAD_H + stepsH + Math.max(1, (a.outcomes ?? []).length) * ROW_H + (a.listens ?? []).length * LISTEN_H + 12;
    const y = heights.get(c) ?? top;
    nodes.push({ key, agent: a, department: d, col: c, x: PAD + c * (CARD_W + COL_GAP), y, h, stepsH });
    heights.set(c, y + h + CARD_GAP);
  }
  // Lanes turn up just right of a card, so the last column needs room for theirs.
  const width = PAD * 2 + (Math.max(0, ...nodes.map((n) => n.col)) + 1) * (CARD_W + COL_GAP) - COL_GAP + (lanes ? 20 + lanes * 10 + CORNER : 0);
  const height = Math.max(top, ...heights.values()) + PAD;
  return { nodes, width, height };
}

export function can(agent: config.Agent) {
  const free = agent.permissions?.free ?? [];
  const ask = agent.permissions?.ask ?? [];
  return compact([free.length && `free: ${free.join(', ')}`, ask.length && `asks: ${ask.join(', ')}`]).join(' · ') || 'Nothing allowed';
}

// Delegations leave from the header since they belong to the whole agent.
const start = (node: Node, edge: Edge) => (edge.outcome === undefined ? node.y + HEAD_H / 2 : node.y + HEAD_H + node.stepsH + edge.outcome * ROW_H + ROW_H / 2);

// Arrivals spread over the target header; lane arrows label on the lane, others are nudged down until none overlap.
export function route(nodes: Node[], edges: Edge[]): Route[] {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const arrive = new Map<number, number>();
  for (const node of nodes) {
    // A lone arrow is left to land mid-header.
    const incoming = sortBy(
      edges.flatMap((edge, i) => {
        const from = byKey.get(edge.from);
        return from && edge.to === node.key ? [{ i, y: start(from, edge) }] : [];
      }),
      ['y'],
    );
    if (incoming.length < 2) continue;
    const gap = Math.min(12, (HEAD_H - 20) / (incoming.length - 1));
    incoming.forEach(({ i }, k) => arrive.set(i, node.y + 10 + k * gap));
  }
  let lane = 0;
  const out = edges.map((edge, i) => {
    const from = byKey.get(edge.from);
    const to = byKey.get(edge.to);
    if (!from || !to) return { d: '', x: 0, y: 0, h: 0, lane: false };
    const x1 = from.x + CARD_W;
    const y1 = start(from, edge);
    const x2 = to.x;
    const y2 = arrive.get(i) ?? to.y + HEAD_H / 2;
    const fields = Object.keys(outcomeOf(from, edge)?.fields ?? {}).join(' · ');
    const h = 22 + (edge.filter ? 14 : 0) + Math.ceil(fields.length / 30) * 14;
    if (edge.from !== edge.to && laned(from.col, to.col)) {
      const n = lane++;
      const ly = PAD + n * LANE_H + LANE_H / 2;
      const xa = x1 + 20 + n * 10;
      const xb = x2 - 20 - n * 10;
      const r = CORNER;
      // The lane runs left instead when the arrow goes back to an earlier column.
      const s = xb < xa ? -1 : 1;
      const d = `M${x1} ${y1} L${xa - r} ${y1} Q${xa} ${y1} ${xa} ${y1 - r} L${xa} ${ly + r} Q${xa} ${ly} ${xa + s * r} ${ly} L${xb - s * r} ${ly} Q${xb} ${ly} ${xb} ${ly + r} L${xb} ${y2 - r} Q${xb} ${y2} ${xb + r} ${y2} L${x2} ${y2}`;
      return { d, x: (xa + xb) / 2, y: ly, h, lane: true };
    }
    const bend = Math.max(60, Math.abs(x2 - x1) / 2);
    const t = 0.55;
    const u = 1 - t;
    const x = u * u * u * x1 + 3 * u * u * t * (x1 + bend) + 3 * u * t * t * (x2 - bend) + t * t * t * x2;
    const y = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
    return { d: `M${x1} ${y1} C${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`, x, y, h, lane: false };
  });
  const placed: Route[] = [];
  const labels = sortBy(out.filter((r) => !r.lane), ['y']);
  for (const spot of labels) {
    for (const other of placed) {
      if (Math.abs(other.x - spot.x) < 200 && Math.abs(other.y - spot.y) < (other.h + spot.h) / 2 + 6) spot.y = other.y + (other.h + spot.h) / 2 + 6;
    }
    placed.push(spot);
  }
  return out;
}
