import { clamp } from 'es-toolkit';
import * as THREE from 'three';
import { doorSign, gasSign, lockFace, STOREY, type Materials, type Obstacle } from './build';
import { kitMarkers, placeKit, type KitPiece, type Spot } from './kit';

const OPEN_S = 0.8;
const STAYS_MS = 6000;
const SWING = 1.5;
const DRYER_S = 8;
const TAP_S = 4;
const PRINT_S = 4;
const REACH = 60;
const LEAF: Partial<Record<KitPiece, number>> = { wc_door: 0.814, wc_door_accessible: 0.914, cubicle_door: 0.6, pod_door: 0.8, locker_door: 0.58 };

type Door = {
  leaf: THREE.Group;
  // The way the leaf faces when shut; -1 swings it in (toward its +z), 1 out.
  base: number;
  swing: number;
  closer: boolean;
  open: number;
  held: boolean;
  heldAt: number;
  locked: boolean;
  turns: THREE.Mesh[];
  faces: THREE.Mesh[];
  // What it blocks when shut; lockers block nothing.
  block?: Obstacle;
};

type Lit = { mesh: THREE.Mesh; off: THREE.Material | THREE.Material[] };

// Filtered white noise, shaped per sound; made on first use, as browsers only allow audio after a click.
function noises() {
  let audio: AudioContext | undefined;
  let buffer: AudioBuffer | undefined;
  const play = (seconds: number, type: BiquadFilterType, shape: (filter: BiquadFilterNode, gain: AudioParam, t: number) => void) => {
    audio ??= new AudioContext();
    if (!buffer) {
      buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = audio.createBiquadFilter();
    filter.type = type;
    const gain = audio.createGain();
    source.connect(filter).connect(gain).connect(audio.destination);
    const t = audio.currentTime;
    shape(filter, gain.gain, t);
    source.start(t);
    source.stop(t + seconds);
  };
  const steady = (level: number, seconds: number) => (gain: AudioParam, t: number) => {
    gain.setValueAtTime(0, t);
    gain.linearRampToValueAtTime(level, t + 0.3);
    gain.setValueAtTime(level, t + seconds - 0.5);
    gain.linearRampToValueAtTime(0, t + seconds);
  };
  // The accessible WC's alarm: a pulsing buzzer from the unit over its door, until it is reset.
  let buzzing: { osc: OscillatorNode; timer: number } | undefined;
  const buzzer = (on: boolean) => {
    if (on && !buzzing) {
      const context = (audio ??= new AudioContext());
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'square';
      osc.frequency.value = 1800;
      gain.gain.value = 0;
      osc.connect(gain).connect(context.destination);
      osc.start();
      let high = false;
      const timer = window.setInterval(() => {
        high = !high;
        gain.gain.setValueAtTime(high ? 0.04 : 0, context.currentTime);
      }, 350);
      buzzing = { osc, timer };
    } else if (!on && buzzing) {
      window.clearInterval(buzzing.timer);
      buzzing.osc.stop();
      buzzing.osc.disconnect();
      buzzing = undefined;
    }
  };
  return {
    buzzer,
    dryer: () =>
      play(DRYER_S, 'bandpass', (filter, gain, t) => {
        filter.frequency.value = 1400;
        filter.Q.value = 0.5;
        steady(0.35, DRYER_S)(gain, t);
      }),
    tap: () =>
      play(TAP_S, 'highpass', (filter, gain, t) => {
        filter.frequency.value = 2200;
        steady(0.08, TAP_S)(gain, t);
      }),
    // A printer's whirr: paper feeding in short pulses.
    printer: () =>
      play(PRINT_S, 'bandpass', (filter, gain, t) => {
        filter.frequency.value = 900;
        filter.Q.value = 1.2;
        gain.setValueAtTime(0, t);
        for (let k = 0; k < PRINT_S * 4 - 2; k++) gain.setValueAtTime(k % 2 ? 0.05 : 0.16, t + 0.25 + k * 0.25);
        gain.setValueAtTime(0, t + PRINT_S - 0.2);
      }),
    // A rush that drains away: the filter closes as it fades.
    flush: () =>
      play(5, 'lowpass', (filter, gain, t) => {
        filter.frequency.setValueAtTime(2600, t);
        filter.frequency.exponentialRampToValueAtTime(300, t + 4);
        gain.setValueAtTime(0, t);
        gain.linearRampToValueAtTime(0.4, t + 0.15);
        gain.exponentialRampToValueAtTime(0.001, t + 5);
      }),
    dispose: () => {
      buzzer(false);
      void audio?.close();
    },
  };
}

type Room = 'toilets' | 'plant_room' | 'server_room' | 'print_room' | 'phone_pods' | 'arrival_hub';
// Rows on the distribution board (breakers) and in the server room (racks): where the first goes, the way the
// row faces, and its length.
export type Row = { x: number; y: number; z: number; rotationY: number; w: number };

// Meshes the scene hands to other parts of it, by their material.
const FOUND = ['fire_screen', 'panel_reset', 'board_chart'];

// The fitted rooms: the toilets, plant room and server room beside the fire stair, the print room, phone pods
// and the arrival hub's lockers. Doors open and close on a click (the
// outer ones on closers), cubicles and the accessible WC lock from inside, dryers and taps run for a while, plates
// flush, and the accessible WC's pull cord flashes the lamp and sounds the buzzer over its door until the reset
// button inside is pressed.
export function fittings(parent: THREE.Object3D, m: Materials, obstacles: Obstacle[]) {
  const sound = noises();
  const actions = new Map<THREE.Object3D, () => void>();
  const doors: Door[] = [];
  const dryers: { lights: Lit[]; until: number }[] = [];
  const taps: { stream: THREE.Mesh; until: number }[] = [];
  const lamps: Lit[] = [];
  const lights: Spot[] = [];
  const rows: Row[] = [];
  const racks: Row[] = [];
  const found = new Map<string, THREE.Mesh[]>(FOUND.map((name) => [name, []]));
  const models: THREE.Object3D[] = [];
  const rooms: Promise<void>[] = [];
  let alarm = false;
  let now = performance.now();
  const raiseAlarm = () => {
    alarm = true;
    sound.buzzer(true);
  };
  const resetAlarm = () => {
    alarm = false;
    sound.buzzer(false);
  };

  const vacant = lockFace(m, false);
  const engaged = lockFace(m, true);
  const signs: Record<string, THREE.Material> = { door_ladies: doorSign(m, 'ladies'), door_gents: doorSign(m, 'gents'), door_accessible: doorSign(m, 'accessible'), door_plant: doorSign(m, 'plant'), door_server: doorSign(m, 'server') };
  const running = m.own(new THREE.MeshStandardMaterial({ color: 0x7fd4ff, emissive: 0x7fd4ff, emissiveIntensity: 2 }));
  const lampOn = m.own(new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 4 }));
  const water = m.own(new THREE.MeshStandardMaterial({ color: 0xd6ecff, transparent: true, opacity: 0.55, roughness: 0.05 }));
  // The pull cord is a few millimetres thick; this clear box around it is what a click has to land on.
  const clear = m.own(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));


  const toggleDoor = (door: Door) => {
    if (door.locked) return;
    door.held = !door.held;
    door.heldAt = now;
  };
  const toggleLock = (door: Door) => {
    if (door.held || door.open > 0.01) return;
    door.locked = !door.locked;
    for (const face of door.faces) face.material = door.locked ? engaged : vacant;
    for (const turn of door.turns) turn.rotation.z = door.locked ? Math.PI / 2 : 0;
  };

  // A door hung on its hinge at x, z. Doors in walls block their opening (width wide) when shut; a locker door,
  // hung at a height y and turned by base, blocks nothing.
  const addDoor = (piece: KitPiece, x: number, z: number, width: number, swing: number, closer: boolean, sign?: THREE.Material, hung?: { y: number; base: number }) => {
    const leaf = LEAF[piece] ?? 0;
    const base = hung?.base ?? 0;
    const door: Door = { leaf: new THREE.Group(), base, swing, closer, open: 0, held: false, heldAt: 0, locked: false, turns: [], faces: [], block: hung ? undefined : { x: x + leaf / 2, z, hx: width / 2, hz: 0.12 } };
    door.leaf = placeKit(parent, piece, x, z, base, undefined, (copy) =>
      copy.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const name = (object.material as THREE.Material).name;
        if (name === 'pod_glass') object.material = m.pane();
        if (name === 'wc_sign' && sign) object.material = sign;
        if (name === 'wc_indicator') {
          object.material = vacant;
          door.faces.push(object);
        }
        if (name === 'thumb_turn') {
          door.turns.push(object);
          actions.set(object, () => toggleLock(door));
        }
      }),
    );
    if (hung) door.leaf.position.y = hung.y;
    actions.set(door.leaf, () => toggleDoor(door));
    doors.push(door);
  };

  // A printer that, clicked, whirrs for a few seconds while a sheet slides out onto its tray.
  const printers: { sheet: THREE.Mesh; started: number }[] = [];
  const paper = m.own(new THREE.MeshStandardMaterial({ color: 0xf7f7f4, roughness: 0.8 }));
  const addPrinter = (x: number, z: number, facing: number) => {
    const unit = placeKit(parent, 'printer', x, z, facing);
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.002, 0.297), paper);
    sheet.position.set(0, 0.756, -0.2);
    sheet.visible = false;
    unit.add(sheet);
    const printer = { sheet, started: -Infinity };
    actions.set(unit, () => {
      if (now - printer.started < PRINT_S * 1000) return;
      printer.started = now;
      sound.printer();
    });
    printers.push(printer);
  };

  const addDryer = (x: number, z: number, facing: number) => {
    const dryer = { lights: [] as Lit[], until: 0 };
    const unit = placeKit(parent, 'hand_dryer', x, z, facing, undefined, (copy) =>
      copy.traverse((object) => {
        if (object instanceof THREE.Mesh && (object.material as THREE.Material).name === 'dryer_light') dryer.lights.push({ mesh: object, off: object.material });
      }),
    );
    actions.set(unit, () => {
      if (dryer.until > now) return;
      dryer.until = now + DRYER_S * 1000;
      sound.dryer();
    });
    dryers.push(dryer);
  };

  // y is the counter the tap stands on, level the water it falls to.
  const addTap = (x: number, y: number, z: number, facing: number, level: number) => {
    const unit = placeKit(parent, 'tap', x, z, facing);
    unit.position.y = y;
    const drop = y + 0.189 - level;
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, drop, 8), water);
    stream.position.set(0, 0.189 - drop / 2, 0.14);
    stream.visible = false;
    unit.add(stream);
    const tap = { stream, until: 0 };
    actions.set(unit, () => {
      if (tap.until > now) return;
      tap.until = now + TAP_S * 1000;
      sound.tap();
    });
    taps.push(tap);
  };

  const room = (piece: Room, centre: THREE.Vector3) => {
    models.push(
      placeKit(parent, piece, centre.x, centre.z, 0, undefined, (copy) =>
        copy.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const name = (object.material as THREE.Material).name;
          if (name === 'flush_plate') actions.set(object, sound.flush);
          if (name === 'pull_cord') actions.set(object, raiseAlarm);
          if (name === 'alarm_reset') actions.set(object, resetAlarm);
          if (name === 'alarm_lamp') lamps.push({ mesh: object, off: object.material });
          if (name === 'gas_sign') object.material = gasSign(m);
          if (name === 'pod_glass') object.material = m.pane();
          found.get(name)?.push(object);
        }),
      ),
    );
    rooms.push(kitMarkers(piece).then((marks) => {
    for (const mark of marks) {
      const x = centre.x + mark.x;
      const z = centre.z + mark.z;
      if (mark.kind === 'block') obstacles.push({ x, z, hx: mark.w / 2, hz: mark.d / 2 });
      else if (mark.kind === 'light') lights.push({ x, y: STOREY - 0.075, z });
      else if (mark.kind === 'door_ladies' || mark.kind === 'door_gents' || mark.kind === 'door_plant' || mark.kind === 'door_server') addDoor('wc_door', x, z, mark.w, -1, true, signs[mark.kind]);
      // Approved Document M: the accessible WC's door opens outwards.
      else if (mark.kind === 'door_accessible') addDoor('wc_door_accessible', x, z, mark.w, 1, true, signs[mark.kind]);
      else if (mark.kind === 'cubicle') addDoor('cubicle_door', x, z, mark.w, -1, false);
      // Pod doors open out, toward you, and close behind you.
      else if (mark.kind === 'door_pod') addDoor('pod_door', x, z, mark.w, 1, true);
      else if (mark.kind === 'locker') addDoor('locker_door', x, z, 0, -1, false, undefined, { y: mark.y, base: mark.rotationY });
      else if (mark.kind === 'printer') addPrinter(x, z, mark.rotationY);
      else if (mark.kind === 'dryer') addDryer(x, z, mark.rotationY);
      else if (mark.kind === 'tap') addTap(x, mark.y, z, mark.rotationY, mark.h);
      else if (mark.kind === 'breakers') rows.push({ x, y: mark.y, z, rotationY: mark.rotationY, w: mark.w });
      else if (mark.kind === 'racks') racks.push({ x, y: mark.y, z, rotationY: mark.rotationY, w: mark.w });
      else if (mark.kind === 'pane') {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(mark.w, mark.d), m.pane());
        pane.position.set(x, mark.y, z);
        pane.rotation.y = mark.rotationY;
        parent.add(pane);
      }
      else if (mark.kind === 'cord') {
        const hold = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.8, 0.12), clear);
        hold.position.set(x, 1.45, z);
        parent.add(hold);
        actions.set(hold, raiseAlarm);
      }
    }
    }));
  };

  // The first thing a ray meets among the rooms' walls and fittings and the given objects.
  const first = (ray: THREE.Raycaster, extra: THREE.Object3D[] = []) => {
    const hit = ray.intersectObjects([...models, ...actions.keys(), ...extra], true)[0];
    return hit && hit.distance <= REACH ? hit.object : undefined;
  };

  return {
    room,
    ready: () => Promise.all(rooms).then(() => undefined),
    lights,
    rows,
    racks,
    found,
    first,
    add: (object: THREE.Object3D, action: () => void) => actions.set(object, action),
    // Whether the ray lands on one of these objects before any wall.
    aimed: (ray: THREE.Raycaster, objects: THREE.Object3D[]) => {
      for (let object = first(ray, objects) ?? null; object; object = object.parent) if (objects.includes(object)) return true;
      return false;
    },
    // Closed doors block the way; a door must be most of the way open to get past it.
    blocking: () => doors.flatMap((door) => (door.block && door.open < 0.9 ? [door.block] : [])),
    // What a click on this ray would do. The walls count as hits too, so nothing works through them.
    target: (ray: THREE.Raycaster) => {
      for (let object = first(ray) ?? null; object; object = object.parent) {
        const action = actions.get(object);
        if (action) return action;
      }
      return undefined;
    },
    update: (time: number) => {
      const dt = clamp((time - now) / 1000, 0, 0.1);
      now = time;
      for (const door of doors) {
        if (door.closer && door.held && now - door.heldAt > STAYS_MS) door.held = false;
        door.open = clamp(door.open + (door.held ? dt : -dt) / OPEN_S, 0, 1);
        door.leaf.rotation.y = door.base + door.swing * door.open * door.open * (3 - 2 * door.open) * SWING;
      }
      for (const printer of printers) {
        const out = clamp((now - printer.started - 800) / 2500, 0, 1);
        printer.sheet.visible = Number.isFinite(printer.started) && now - printer.started > 800;
        printer.sheet.position.z = -0.2 + out * 0.26;
      }
      for (const dryer of dryers) for (const light of dryer.lights) light.mesh.material = dryer.until > now ? running : light.off;
      for (const tap of taps) tap.stream.visible = tap.until > now;
      const lit = alarm && now % 1000 < 600;
      for (const lamp of lamps) lamp.mesh.material = lit ? lampOn : lamp.off;
    },
    dispose: () => sound.dispose(),
  };
}
