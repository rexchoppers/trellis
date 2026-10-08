import * as THREE from 'three';
import { buildFigure, disposeFigure, reducedMotion, seatFigure, stepToward } from './figure';
import { makeBubble, makeTag, placeBubble, placeTag, setBubble, show, toScreen } from './overlay';
import { route, type AgentHit, type Person } from './people';

type Walker = {
  figure: THREE.Group;
  person: Person;
  path: THREE.Vector3[];
};

export function agentFigures(scene: THREE.Scene, host: HTMLElement, onClick: (hit: AgentHit, e: MouseEvent) => void) {
  const walkers = new Map<string, Walker>();
  const tags = new Map<string, HTMLSpanElement>();
  const bubbles = new Map<string, HTMLSpanElement>();
  const at = new THREE.Vector3();
  // Debug: H toggles yellow outlines of the click boxes.
  let showHits = false;

  // stopPropagation so a click on a tag never falls through to whoever stands behind it.
  const open = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    const walker = walkers.get(id);
    if (walker) onClick(walker.person.hit, e);
  };

  const outlineHits = () => {
    for (const walker of walkers.values()) {
      const box = walker.figure.getObjectByName('hit') as THREE.Mesh | undefined;
      if (!box) continue;
      let outline = walker.figure.getObjectByName('hit-outline');
      if (!outline && showHits) {
        outline = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: 0xffd400 }));
        outline.name = 'hit-outline';
        outline.position.copy(box.position);
        walker.figure.add(outline);
      }
      if (outline) outline.visible = showHits;
    }
  };

  const set = (next: Person[]) => {
    const ids = new Set(next.map((person) => person.id));
    for (const [id, walker] of walkers) {
      if (!ids.has(id)) {
        scene.remove(walker.figure);
        disposeFigure(walker.figure);
        walkers.delete(id);
      }
    }
    for (const person of next) {
      const walker = walkers.get(person.id);
      if (!walker) {
        const figure = buildFigure(person.colour, person.name);
        figure.position.copy(person.place === 'desk' ? person.seat : route(person).at(-1)!);
        scene.add(figure);
        walkers.set(person.id, { figure, person, path: [] });
        continue;
      }
      if (walker.person.place !== person.place) {
        const way = route(person);
        const path = person.place === 'human' ? way : [...way.reverse().slice(1), person.seat];
        walker.path = reducedMotion() ? [] : path;
        if (reducedMotion()) walker.figure.position.copy(path.at(-1)!);
      } else if (person.place === 'human' && walker.person.queue !== person.queue) {
        walker.path = [route(person).at(-1)!];
      }
      walker.person = person;
    }
    for (const walker of walkers.values()) {
      const alert = walker.figure.getObjectByName('alert');
      if (alert) alert.visible = walker.person.place === 'human';
    }
  };

  const update = (dt: number, now: number) => {
    for (const walker of walkers.values()) {
      const target = walker.path[0];
      if (target) {
        if (stepToward(walker.figure, target, 2.6, dt, now, 0.05, 90)) walker.path.shift();
        seatFigure(walker.figure, false);
      } else {
        const sitting = walker.person.place === 'desk';
        walker.figure.position.y = 0;
        seatFigure(walker.figure, sitting);
        walker.figure.rotation.y = sitting ? walker.person.facing : 0;
      }
    }
    if (showHits) outlineHits();
  };

  const label = (camera: THREE.Camera, width: number, height: number) => {
    for (const [id, walker] of walkers) {
      let tag = tags.get(id);
      if (!tag) {
        tag = makeTag(walker.person.name, (e) => open(id, e));
        host.append(tag);
        tags.set(id, tag);
      }
      if (tag.textContent !== walker.person.name) tag.textContent = walker.person.name;
      const feet = toScreen(at.copy(walker.figure.position).setY(0), camera, width, height);
      show(tag, feet.visible);
      if (feet.visible) placeTag(tag, feet);

      let bubble = bubbles.get(id);
      if (!bubble) {
        bubble = makeBubble((e) => open(id, e));
        host.append(bubble);
        bubbles.set(id, bubble);
      }
      setBubble(bubble, walker.person.doing);
      const head = toScreen(at.copy(walker.figure.position).setY(walker.path.length ? 2.2 : 1.9), camera, width, height);
      const shown = walker.person.working && feet.visible && head.ahead;
      show(bubble, shown);
      if (shown) placeBubble(bubble, head);
    }
    for (const [id, tag] of tags) {
      if (!walkers.has(id)) {
        tag.remove();
        tags.delete(id);
        bubbles.get(id)?.remove();
        bubbles.delete(id);
      }
    }
  };

  // A body hit wins; otherwise the invisible boxes, preferring a figure on a job.
  const pick = (ray: THREE.Raycaster): AgentHit | undefined => {
    const list = [...walkers.values()];
    const boxes = list.map((walker) => walker.figure.getObjectByName('hit')!);
    const owner = (object: THREE.Object3D | null) => {
      for (let o = object; o; o = o.parent) {
        const found = list.find((candidate) => candidate.figure === o);
        if (found) return found;
      }
      return undefined;
    };
    const bodies = list.flatMap((w) => w.figure.children.filter((child) => child instanceof THREE.Mesh && child.name !== 'hit'));
    const body = ray.intersectObjects(bodies, false)[0];
    let walker = body && owner(body.object);
    if (!walker) {
      const hits = ray.intersectObjects(boxes, false);
      const nearest = hits[0];
      const busy = nearest && hits.find((h) => h.distance - nearest.distance < 1.5 && owner(h.object)?.person.hit.run);
      walker = owner((busy ?? nearest)?.object ?? null);
    }
    return walker?.person.hit;
  };

  const namesNear = (here: THREE.Vector3, within: number) => [...walkers.values()].filter((w) => w.figure.position.distanceTo(here) < within).map((w) => w.person.name);

  return {
    set,
    update,
    label,
    pick,
    namesNear,
    toggleHits: () => {
      showHits = !showHits;
      outlineHits();
    },
    dispose: () => {
      for (const walker of walkers.values()) disposeFigure(walker.figure);
      for (const tag of tags.values()) tag.remove();
      for (const bubble of bubbles.values()) bubble.remove();
    },
  };
}
