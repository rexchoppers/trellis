import * as THREE from 'three';

export const STOREY = 3.3;

export type Obstacle = { x: number; z: number; hx: number; hz: number };

type Materials = {
  mat: (colour: number) => THREE.Material;
  pane: () => THREE.Material;
  frost: () => THREE.Material;
  surface: (name: 'concrete' | 'carpet', tint: number, roughness: number) => THREE.Material;
  // Unlit, so the ceiling reads bright from below.
  ceiling: () => THREE.Material;
  own: <T extends THREE.Material | THREE.Texture>(resource: T) => T;
  dispose: () => void;
};

export function materials(): Materials {
  const cache = new Map<string, THREE.Material>();
  const owned: (THREE.Material | THREE.Texture)[] = [];
  const cached = (key: string, make: () => THREE.Material) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key) as THREE.Material;
  };
  return {
    mat: (colour) => cached(`l${colour}`, () => new THREE.MeshStandardMaterial({ color: colour, roughness: 0.8 })),
    pane: () => cached('glass', () => new THREE.MeshStandardMaterial({ color: 0xdcecf5, transparent: true, opacity: 0.14, roughness: 0.05, depthWrite: false })),
    frost: () => cached('frost', () => new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 0.6, depthWrite: false })),
    ceiling: () => cached('ceiling', () => new THREE.MeshBasicMaterial({ map: surfaceTexture('ceiling'), color: 0xe9e6e0 })),
    surface: (name, tint, roughness) => cached(`s${name}${tint}`, () => new THREE.MeshStandardMaterial({ map: surfaceTexture(name), color: tint, roughness })),
    own: (resource) => {
      owned.push(resource);
      return resource;
    },
    dispose: () => {
      cache.forEach((material) => material.dispose());
      owned.forEach((resource) => resource.dispose());
    },
  };
}

const surfaces = new Map<string, THREE.Texture>();
function surfaceTexture(name: string) {
  let texture = surfaces.get(name);
  if (!texture) {
    texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}scenes/corporate-office/${name}.png`);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    surfaces.set(name, texture);
  }
  return texture;
}

export function boxIn(parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export function slabIn(parent: THREE.Object3D, x0: number, x1: number, z0: number, z1: number, material: THREE.Material, y: number, tile = 0) {
  const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  if (tile) {
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (x1 - x0)) / tile, (uv.getY(i) * (z1 - z0)) / tile);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  parent.add(mesh);
  return mesh;
}

// No wall on the z1 edge: the building's windows stand there.
export function glassWalls(parent: THREE.Object3D, m: Materials, x0: number, x1: number, z0: number, z1: number, doorX: number, frame: number, glass: THREE.Mesh[]) {
  const gap = 0.95;
  const segs: [number, number, number, number][] = [
    [x0, z0, doorX - gap, z0],
    [doorX + gap, z0, x1, z0],
    [x0, z0, x0, z1],
    [x1, z0, x1, z1],
  ];
  const obstacles: Obstacle[] = [];
  for (const [ax, az, bx, bz] of segs) {
    const len = Math.hypot(bx - ax, bz - az);
    const alongX = Math.abs(bx - ax) > 0.01;
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    glass.push(boxIn(parent, alongX ? len : 0.03, 2.7, alongX ? 0.03 : len, m.pane(), cx, 1.35, cz));
    glass.push(boxIn(parent, alongX ? len : 0.035, 0.2, alongX ? 0.035 : len, m.frost(), cx, 1.25, cz));
    boxIn(parent, alongX ? len + 0.06 : 0.06, 0.06, alongX ? 0.06 : len + 0.06, m.mat(frame), cx, 2.73, cz);
    boxIn(parent, alongX ? len + 0.06 : 0.06, 0.06, alongX ? 0.06 : len + 0.06, m.mat(frame), cx, 0.03, cz);
    boxIn(parent, 0.06, 2.76, 0.06, m.mat(frame), ax, 1.38, az);
    boxIn(parent, 0.06, 2.76, 0.06, m.mat(frame), bx, 1.38, bz);
    obstacles.push({ x: cx, z: cz, hx: alongX ? len / 2 + 0.05 : 0.05, hz: alongX ? 0.05 : len / 2 + 0.05 });
  }
  return obstacles;
}

function textTexture(m: Materials, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  paint(ctx);
  const texture = m.own(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, max: number, room: number) {
  let size = max;
  do ctx.font = `700 ${size--}px "Archivo Variable", ui-sans-serif, sans-serif`;
  while (ctx.measureText(text).width > room && size > 24);
}

export function plaque(parent: THREE.Object3D, m: Materials, door: THREE.Vector3, facing: THREE.Vector3, title: string, subtitle: string | null, bg: string, fg: string) {
  const w = 512;
  const h = subtitle ? 168 : 116;
  const texture = textTexture(m, w, h, (ctx) => {
    ctx.fillStyle = '#1b1f29';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = fg;
    fitFont(ctx, title, 68, w - 48);
    ctx.fillText(title, w / 2, subtitle ? 64 : h / 2 + 2);
    if (subtitle) {
      ctx.globalAlpha = 0.85;
      ctx.font = '600 30px "Geist Variable", ui-sans-serif, sans-serif';
      ctx.fillText(subtitle, w / 2, 126);
    }
  });
  const width = 2.6;
  const height = (width * h) / w;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(width, height), m.own(new THREE.MeshBasicMaterial({ map: texture })));
  board.position
    .copy(door)
    .setY(2.75 - height / 2 - 0.05)
    .addScaledVector(facing, 0.08);
  board.rotation.y = Math.atan2(facing.x, facing.z);
  parent.add(board);
  const along = Math.abs(facing.x) > 0.5;
  boxIn(parent, along ? 0.1 : 2.0, 0.1, along ? 2.0 : 0.1, m.mat(0x2b303b), door.x, 2.75, door.z);
  return board;
}

// So zones can be told apart from bird's eye where their signs face away.
// The face of a department's sign pillar: name large, agents and desks below, a strip in the department's colour.
export function signFace(m: Materials, title: string, subtitle: string, colour: string) {
  const w = 1024;
  const h = 326;
  const texture = textTexture(m, w, h, (ctx) => {
    ctx.fillStyle = '#16181d';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = colour;
    ctx.fillRect(0, h - 26, w, 26);
    ctx.fillStyle = '#ffffff';
    fitFont(ctx, title, 128, w - 96);
    ctx.fillText(title, w / 2, 118);
    ctx.fillStyle = '#b9bdc6';
    ctx.font = '500 52px "Archivo Variable", ui-sans-serif, sans-serif';
    ctx.fillText(subtitle, w / 2, 228);
  });
  texture.anisotropy = 8;
  // The face comes from the glTF kit, whose UVs run top-down.
  texture.flipY = false;
  return m.own(new THREE.MeshBasicMaterial({ map: texture }));
}

// The face of a UK manual call point: a white push element on red, carrying the house-and-flame
// symbol and PUSH HERE; pressed, the element shows yellow and black stripes as the real ones do.
export function callFace(m: Materials, pressed: boolean) {
  const size = 256;
  const texture = textTexture(m, size, size, (ctx) => {
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(0, 0, size, size);
    const x = 30;
    const y = 30;
    const w = 196;
    const h = 196;
    if (pressed) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.fillStyle = '#ffd100';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#111111';
      for (let k = -h; k < w; k += 36) {
        ctx.beginPath();
        ctx.moveTo(x + k, y + h);
        ctx.lineTo(x + k + 18, y + h);
        ctx.lineTo(x + k + 18 + h, y);
        ctx.lineTo(x + k + h, y);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);
    // The house with a flame inside it, in red on the element.
    ctx.strokeStyle = '#c8102e';
    ctx.fillStyle = '#c8102e';
    ctx.lineWidth = 9;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(78, 108);
    ctx.lineTo(128, 52);
    ctx.lineTo(178, 108);
    ctx.lineTo(178, 132);
    ctx.lineTo(78, 132);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(128, 72);
    ctx.bezierCurveTo(152, 92, 150, 122, 128, 126);
    ctx.bezierCurveTo(106, 122, 104, 94, 128, 72);
    ctx.fill();
    ctx.font = '800 30px "Archivo Variable", ui-sans-serif, sans-serif';
    ctx.fillText('PUSH HERE', size / 2, 184);
  });
  // The face comes from the glTF kit, whose UVs run top-down.
  texture.flipY = false;
  return m.own(new THREE.MeshBasicMaterial({ map: texture }));
}

// A green fire exit sign: a running figure heading through a door, an arrow and FIRE EXIT.
export function exitSign(m: Materials) {
  const w = 512;
  const h = 188;
  const texture = textTexture(m, w, h, (ctx) => {
    ctx.fillStyle = '#00843d';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // The door, then the figure running into it.
    ctx.lineWidth = 8;
    ctx.strokeRect(150, 28, 74, 132);
    ctx.beginPath();
    ctx.arc(102, 46, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(96, 66);
    ctx.lineTo(84, 112);
    ctx.lineTo(112, 134);
    ctx.lineTo(118, 160);
    ctx.moveTo(84, 112);
    ctx.lineTo(60, 138);
    ctx.lineTo(40, 140);
    ctx.moveTo(94, 76);
    ctx.lineTo(120, 92);
    ctx.lineTo(140, 80);
    ctx.moveTo(94, 76);
    ctx.lineTo(70, 88);
    ctx.lineTo(56, 108);
    ctx.stroke();
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(250, 94);
    ctx.lineTo(300, 94);
    ctx.moveTo(284, 76);
    ctx.lineTo(304, 94);
    ctx.lineTo(284, 112);
    ctx.stroke();
    ctx.font = '800 46px "Archivo Variable", ui-sans-serif, sans-serif';
    ctx.fillText('FIRE', 400, 70);
    ctx.fillText('EXIT', 400, 122);
  });
  // The face comes from the glTF kit, whose UVs run top-down.
  texture.flipY = false;
  return m.own(new THREE.MeshBasicMaterial({ map: texture }));
}

export function floorName(parent: THREE.Object3D, m: Materials, door: THREE.Vector3, inward: THREE.Vector3, depth: number, across: number, name: string, colour: string) {
  const texture = textTexture(m, 512, 128, (ctx) => {
    ctx.fillStyle = colour;
    fitFont(ctx, name, 84, 512 - 24);
    ctx.fillText(name, 512 / 2, 128 / 2 + 4);
  });
  const width = Math.min(across - 1, 9);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), m.own(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })));
  mesh.position
    .copy(door)
    .addScaledVector(inward, depth - width / 8 - 0.3)
    .setY(0.035);
  mesh.rotation.set(-Math.PI / 2, 0, Math.atan2(-inward.x, -inward.z));
  parent.add(mesh);
  return mesh;
}

export function shadows(root: THREE.Object3D, skip: Set<THREE.Object3D>) {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && !skip.has(object)) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
}

export function disposeGeometry(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) object.dispose();
    if ((object instanceof THREE.Mesh || object instanceof THREE.LineSegments) && !object.userData.kit && !object.userData.shared) object.geometry.dispose();
  });
}
