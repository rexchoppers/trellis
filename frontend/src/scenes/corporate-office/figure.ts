import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let alertTexture: THREE.CanvasTexture | undefined;
function alertMarker() {
  if (!alertTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f5b942';
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1300';
    ctx.font = '700 44px "Pixelify Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 32, 35);
    alertTexture = new THREE.CanvasTexture(canvas);
    alertTexture.colorSpace = THREE.SRGBColorSpace;
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: alertTexture, depthTest: false }));
  sprite.name = 'alert';
  sprite.scale.setScalar(0.8);
  sprite.position.y = 1.85;
  sprite.renderOrder = 10;
  sprite.visible = false;
  return sprite;
}

// Shared by every figure (userData.shared, never disposed). Facing +z.
let figureShapes: { body: THREE.BufferGeometry; head: THREE.BufferGeometry; hair: THREE.BufferGeometry; eye: THREE.BufferGeometry } | undefined;
const figureMaterials = new Map<string, THREE.Material>();
const SKIN = ['#e2b98f', '#c68d63', '#8d5a3b', '#f0c9a4'];
const HAIR = ['#2a1d14', '#6b4428', '#111111', '#a0703c'];

function figureMaterial(colour: string, roughness = 0.55) {
  let material = figureMaterials.get(colour);
  if (!material) figureMaterials.set(colour, (material = new THREE.MeshStandardMaterial({ color: colour, roughness })));
  return material;
}

// Deterministic, so every copy of an agent gets the same skin and hair.
function pick<T>(list: T[], seed: string, salt: number) {
  let h = salt;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

export function figureBody(colour: string, seed: string) {
  figureShapes ??= {
    body: new RoundedBoxGeometry(0.5, 0.95, 0.38, 2, 0.035),
    head: new RoundedBoxGeometry(0.42, 0.42, 0.4, 2, 0.03),
    hair: new RoundedBoxGeometry(0.44, 0.1, 0.42, 2, 0.02),
    eye: new THREE.SphereGeometry(0.032, 12, 8).scale(1, 1, 0.5),
  };
  const figure = new THREE.Group();
  const part = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    // Standing height, for seatFigure to raise it from.
    mesh.userData.y = y;
    mesh.castShadow = true;
    mesh.userData.shared = true;
    figure.add(mesh);
  };
  part('body', figureShapes.body, figureMaterial(colour), 0, 0.475, 0);
  part('head', figureShapes.head, figureMaterial(pick(SKIN, seed, 7)), 0, 1.16, 0);
  part('hair', figureShapes.hair, figureMaterial(pick(HAIR, seed, 13), 0.7), 0, 1.38, -0.01);
  for (const x of [-0.08, 0.08]) part('eye', figureShapes.eye, figureMaterial('#15171c', 0.25), x, 1.19, 0.2);
  return figure;
}

const SEAT_TOP = 0.52;
const SEATED_BODY = 0.6;
export function seatFigure(figure: THREE.Object3D, seated: boolean) {
  const rise = seated ? SEAT_TOP + SEATED_BODY - 0.95 : 0;
  for (const child of figure.children) {
    if (child.userData.y === undefined) continue;
    if (child.name === 'body') {
      child.scale.y = seated ? SEATED_BODY / 0.95 : 1;
      child.position.y = seated ? SEAT_TOP + SEATED_BODY / 2 : child.userData.y;
    } else child.position.y = child.userData.y + rise;
  }
}

export function buildFigure(colour: string, seed = colour) {
  const figure = figureBody(colour, seed);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'hit';
  hit.position.y = 1;
  figure.add(hit, alertMarker());
  return figure;
}

export function disposeFigure(figure: THREE.Group) {
  figure.traverse((object) => {
    if ((object instanceof THREE.Mesh || object instanceof THREE.LineSegments) && !object.userData.shared) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
    if (object instanceof THREE.Sprite) object.material.dispose();
  });
}

export function stepToward(figure: THREE.Object3D, target: THREE.Vector3, speed: number, dt: number, now: number, bob: number, stride: number) {
  const to = target.clone().sub(figure.position).setY(0);
  const step = speed * dt;
  if (to.length() <= step) {
    figure.position.set(target.x, 0, target.z);
    return true;
  }
  figure.position.addScaledVector(to.normalize(), step);
  figure.position.y = Math.abs(Math.sin(now / stride)) * bob;
  figure.rotation.y = Math.atan2(to.x, to.z);
  return false;
}

export function addCup(figure: THREE.Group) {
  const cup = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.13), new THREE.MeshLambertMaterial({ color: 0xf2efe6 }));
  cup.position.set(0.2, 0.85, 0.27);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.14), new THREE.MeshLambertMaterial({ color: 0x5a3d2b }));
  lid.position.set(0.2, 0.96, 0.27);
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.07, 0.135), new THREE.MeshLambertMaterial({ color: 0xc08a4a }));
  sleeve.position.set(0.2, 0.85, 0.27);
  figure.add(cup, lid, sleeve);
}

export function addCigarette(figure: THREE.Group) {
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.22), new THREE.MeshLambertMaterial({ color: 0xf4f1ea }));
  stick.position.set(0.07, 1.07, 0.28);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
  tip.position.set(0.07, 1.07, 0.41);
  tip.name = 'cigarette-tip';
  figure.add(stick, tip);
  for (let n = 0; n < 3; n++) {
    const puff = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xd9d9d4, transparent: true, opacity: 0.6, depthWrite: false }));
    puff.name = 'smoke';
    figure.add(puff);
  }
}

export function drawSmoke(figure: THREE.Group, now: number) {
  const puffs = figure.children.filter((child) => child.name === 'smoke') as THREE.Mesh[];
  puffs.forEach((puff, n) => {
    const t = (((now / 2200 + n / puffs.length) % 1) + 1) % 1;
    puff.position.set(0.07 + Math.sin(t * 6 + n) * 0.05, 1.12 + t * 0.8, 0.41);
    puff.scale.setScalar(0.6 + t * 1.4);
    (puff.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - t);
  });
  const tip = figure.getObjectByName('cigarette-tip') as THREE.Mesh | undefined;
  if (tip) (tip.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(now / 300) > 0.6 ? 0xffb02e : 0xff6a1a);
}
