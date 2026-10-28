import { groupBy } from 'es-toolkit';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Person } from './people';

const W = 256;
const H = 64;
const FONT = '"Archivo Variable", ui-sans-serif, sans-serif';
// A wooden tent card on the front left corner of the desk, in the workstation's own frame (chair on -z).
const PLATE = { w: 0.26, h: 0.075, lean: 0.35 };
const AT = new THREE.Vector3(-0.5, 0.75, -0.3);

function tent() {
  const rise = PLATE.h * Math.cos(PLATE.lean);
  const run = PLATE.h * Math.sin(PLATE.lean);
  const faces = [-1, 1].map((side) => {
    const face = new THREE.PlaneGeometry(PLATE.w, PLATE.h);
    face.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(side * -PLATE.lean, side < 0 ? Math.PI : 0, 0)));
    face.translate(0, rise / 2, (side * run) / 2);
    return face;
  });
  const geometry = mergeGeometries(faces)!;
  for (const face of faces) face.dispose();
  return geometry;
}

// Every desk carries its agent's name, so names need not float over the floor.
export function nameplates(scene: THREE.Scene) {
  const group = new THREE.Group();
  scene.add(group);
  const geometry = tent();
  const faces = new Map<string, THREE.MeshStandardMaterial>();
  let shown = '';
  let last: Person[] = [];

  const face = (name: string) => {
    let material = faces.get(name);
    if (material) return material;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.fillStyle = '#b48a5f';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1d1405';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 40;
    do ctx.font = `800 ${size--}px ${FONT}`;
    while (ctx.measureText(name).width > W - 24 && size > 16);
    ctx.fillText(name, W / 2, H / 2 + 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6 });
    faces.set(name, material);
    return material;
  };

  const clear = () => {
    for (const mesh of [...group.children] as THREE.InstancedMesh[]) {
      group.remove(mesh);
      mesh.dispose();
    }
  };

  const set = (list: Person[]) => {
    last = list;
    const desks = new Map<string, { spot: THREE.Vector3; inward: THREE.Vector3; name: string }>();
    for (const person of list) desks.set(`${person.desk.spot.x},${person.desk.spot.z}`, { ...person.desk, name: person.name });
    const key = [...desks].map(([at, desk]) => `${at}:${desk.name}`).join('|');
    if (key === shown) return;
    shown = key;
    clear();
    const byName = groupBy([...desks.values()], (desk) => desk.name);
    const offset = new THREE.Matrix4().makeTranslation(AT);
    for (const [name, list] of Object.entries(byName)) {
      const mesh = new THREE.InstancedMesh(geometry, face(name), list.length);
      list.forEach((desk, i) => {
        const matrix = new THREE.Matrix4().makeRotationY(Math.atan2(desk.inward.x, desk.inward.z)).setPosition(desk.spot).multiply(offset);
        mesh.setMatrixAt(i, matrix);
      });
      group.add(mesh);
    }
  };

  const forget = () => {
    clear();
    for (const material of faces.values()) {
      material.map?.dispose();
      material.dispose();
    }
    faces.clear();
    shown = '';
  };

  return {
    set,
    // Names are painted on canvases; paint them again once their font has loaded.
    repaint: () => {
      forget();
      set(last);
    },
    dispose: () => {
      forget();
      scene.remove(group);
      geometry.dispose();
    },
  };
}
