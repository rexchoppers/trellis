import { sample, sortBy } from 'es-toolkit';
import * as THREE from 'three';
import type { config } from '../../../wailsjs/go/models';
import { addCigarette, addCup, disposeFigure, drawSmoke, figureBody, reducedMotion, seatFigure, stepToward } from './figure';
import type { Floor, PlaceSpot } from './floor';
import { makeBubble, makeTag, placeBubble, placeTag, setBubble, show, toScreen } from './overlay';

type Npc = {
  def: config.NPC;
  figure: THREE.Group;
  tag: HTMLSpanElement;
  bubble: HTMLSpanElement;
  // Set once its place has loaded; patrollers have none.
  home: PlaceSpot | null;
  target: THREE.Vector3 | null;
  line: string;
  sayUntil: number;
  nextLine: number;
};

export function npcCrowd(scene: THREE.Scene, host: HTMLElement, floor: () => Floor | null, namesNear: (here: THREE.Vector3, within: number) => string[]) {
  let npcs: Npc[] = [];
  const at = new THREE.Vector3();

  const drop = () => {
    for (const npc of npcs) {
      scene.remove(npc.figure);
      disposeFigure(npc.figure);
      npc.tag.remove();
      npc.bubble.remove();
    }
    npcs = [];
  };

  const place = (built: Floor, defs: config.NPC[]) => {
    drop();
    for (const def of defs) {
      const figure = figureBody(def.colour || '#8a8f98', def.name);
      if (def.carries?.includes('cup')) addCup(figure);
      if (def.carries?.includes('cigarette')) addCigarette(figure);
      figure.visible = def.does === 'patrol';
      if (figure.visible) figure.position.copy(sample(built.plan.walkways));
      scene.add(figure);
      const tag = makeTag(def.name);
      const bubble = makeBubble();
      host.append(tag, bubble);
      npcs.push({ def, figure, tag, bubble, home: null, target: null, line: '', sayUntil: 0, nextLine: 0 });
    }
    // With no place or spot left, an NPC stays hidden.
    void built.ready.then(() => {
      if (floor() !== built) return;
      const taken = new Map<string, number>();
      for (const npc of npcs) {
        const { does, place = '' } = npc.def;
        if (does !== 'serve' && does !== 'sit') continue;
        const spots = built.spots.get(place);
        const key = `${place}/${does}`;
        const n = taken.get(key) ?? 0;
        const spot = (does === 'serve' ? spots?.serve : spots?.seat)?.[n];
        if (!spot) continue;
        taken.set(key, n + 1);
        npc.home = spot;
        seatFigure(npc.figure, does === 'sit');
        npc.figure.position.copy(spot.at);
        npc.figure.rotation.y = spot.facing;
        npc.figure.visible = true;
      }
    });
  };

  const lineFor = (npc: Npc) => {
    const here = npc.figure.position;
    const near = namesNear(here, 9);
    const rooms = (floor()?.plan.zones ?? []).filter((zone) => zone.centre.distanceTo(here) < 9).map((zone) => zone.department.name);
    const fits = (npc.def.lines ?? []).filter((line) => (!line.includes('{who}') || near.length) && (!line.includes('{room}') || rooms.length));
    if (!fits.length) return '';
    return sample(fits)
      .replaceAll('{who}', () => sample(near))
      .replaceAll('{room}', () => sample(rooms));
  };

  const move = (dt: number, now: number) => {
    const current = floor();
    for (const npc of npcs) {
      const { figure, def } = npc;
      if (!figure.visible) continue;
      if (def.does === 'serve' && npc.home) {
        if (now >= npc.nextLine) {
          npc.line = lineFor(npc);
          npc.sayUntil = Infinity;
          npc.nextLine = now + 7000;
        }
        if (!reducedMotion()) figure.rotation.y = npc.home.facing + Math.sin(now / 900) * 0.25;
      } else if (def.does === 'sit') {
        if (now >= npc.nextLine) {
          npc.line = lineFor(npc);
          npc.sayUntil = now + 5000;
          npc.nextLine = now + 14000 + Math.random() * 8000;
        }
      } else if (def.does === 'patrol' && current && !reducedMotion()) {
        if (now < npc.sayUntil) {
          figure.position.y = 0;
          continue;
        }
        if (!npc.target) {
          const others = current.plan.walkways.filter((p) => p.distanceTo(figure.position) > 0.5);
          npc.target = sample(sortBy(others, [(p) => p.distanceTo(figure.position)]).slice(0, 3)).clone();
        }
        if (stepToward(figure, npc.target, 1.4, dt, now, 0.04, 110)) {
          npc.target = null;
          if (Math.random() < 0.7) {
            npc.line = lineFor(npc);
            npc.sayUntil = now + 4500;
          }
        }
      }
      if (def.carries?.includes('cigarette') && !reducedMotion()) drawSmoke(figure, now);
    }
  };

  const label = (camera: THREE.Camera, width: number, height: number, now: number) => {
    for (const npc of npcs) {
      const feet = toScreen(at.copy(npc.figure.position).setY(0), camera, width, height);
      const visible = npc.figure.visible && feet.visible;
      show(npc.tag, visible);
      const talking = visible && now < npc.sayUntil && npc.line !== '';
      show(npc.bubble, talking);
      if (visible) placeTag(npc.tag, feet);
      if (!talking) continue;
      placeBubble(npc.bubble, toScreen(at.copy(npc.figure.position).setY(npc.def.does === 'sit' ? 1.5 : 1.9), camera, width, height));
      setBubble(npc.bubble, npc.line, true);
    }
  };

  return { place, move, label, dispose: drop };
}
