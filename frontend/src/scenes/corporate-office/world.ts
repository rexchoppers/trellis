import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { disposeGeometry, glassWalls, materials, shadows, slabIn, type Obstacle } from './build';
import { figureBody, seatFigure } from './figure';
import { placeKit } from './kit';
import { DESK_Z, OFFICE } from './plan';

export const SKY = '#9cc8ec';

export const SEAT = { x: 0, z: DESK_Z + 1.18, yaw: Math.PI, pitch: -0.12 };

type World = {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  you: THREE.Group;
  obstacles: Obstacle[];
  dispose: () => void;
};

export function buildWorld(): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(0xc9dff0, 80, 320);
  const m = materials();
  const glass: THREE.Mesh[] = [];

  scene.add(new THREE.HemisphereLight(0xe6f2ff, 0x8a7f70, 1.8));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.set(40, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  let disposed = false;
  let city: THREE.Object3D | undefined;
  new GLTFLoader().load(`${import.meta.env.BASE_URL}scenes/corporate-office/city.glb`, (gltf) => {
    if (disposed) return disposeAll(gltf.scene);
    city = gltf.scene;
    city.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const map = (object.material as THREE.MeshStandardMaterial).map;
      // Facades are seen at a slant from the tower, so sharpen them.
      if (map) map.anisotropy = 8;
    });
    scene.add(city);
  });

  const { hx, hz } = OFFICE;
  slabIn(scene, -hx, hx, -hz, hz, m.surface('carpet', 0xd8c4a8, 1), 0.02, 1);
  slabIn(scene, -1.7, 1.7, DESK_Z - 1.6, DESK_Z + 0.8, m.mat(0x7a4b3a), 0.03);
  const obstacles = glassWalls(scene, m, -hx, hx, -hz, hz, 0, 0x2b303b, glass);
  placeKit(scene, 'exec_desk', 0, DESK_Z);
  obstacles.push({ x: 0, z: DESK_Z, hx: 1.3, hz: 0.5 });
  const lounge = { x: hx - 2.6, z: -hz + 1.6 };
  placeKit(scene, 'sofa', lounge.x + 0.3, lounge.z, Math.PI / 2);
  placeKit(scene, 'low_table', lounge.x - 0.8, lounge.z, Math.PI / 2);
  obstacles.push({ x: lounge.x, z: lounge.z, hx: 1.1, hz: 1.2 });
  for (const x of [-hx + 0.6, hx - 0.6]) placeKit(scene, 'plant', x, hz - 0.6);

  const you = figureBody('#ffc861', 'you');
  seatFigure(you, true);
  you.position.set(0, 0, DESK_Z + 1.2);
  you.rotation.y = Math.PI;
  scene.add(you);

  shadows(scene, new Set(glass));
  return {
    scene,
    sun,
    you,
    obstacles,
    dispose: () => {
      disposed = true;
      if (city) {
        scene.remove(city);
        disposeAll(city);
      }
      disposeGeometry(scene);
      m.dispose();
    },
  };
}

function disposeAll(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of [object.material].flat() as THREE.MeshStandardMaterial[]) {
      material.map?.dispose();
      material.dispose();
    }
  });
}
