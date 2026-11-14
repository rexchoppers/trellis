import * as THREE from 'three';
import { placeKit, type KitPiece } from './kit';
import type { Plan } from './plan';

// Past the reception counter's right end.
const treeAt = (plan: Plan) => new THREE.Vector3(plan.reception.x + 5.6, 0, plan.reception.z + 1.4);

export function decorations(plan: Plan): { key: string; piece: KitPiece; centre: THREE.Vector3; rotationY?: number }[] {
  const { reception, core, breakout } = plan;
  return [
    // Its presents toward the lifts.
    { key: 'xmas_tree', piece: 'xmas_tree', centre: treeAt(plan), rotationY: Math.PI },
    { key: 'xmas_garland', piece: 'xmas_garland', centre: reception },
    // On the lift core between the two lifts, above the call button.
    { key: 'xmas_wreath', piece: 'xmas_wreath', centre: new THREE.Vector3(core.x, 0, core.z + 2.005) },
    { key: 'xmas_treats', piece: 'xmas_treats', centre: breakout.centre },
  ];
}

const TINSEL = [0xd8b45a, 0xc9ccd1, 0xb3262d];
const tinted = new Map<number, THREE.Material>();

export function tinsel(parent: THREE.Object3D, pod: THREE.Vector3, n: number) {
  const colour = TINSEL[n % TINSEL.length];
  placeKit(parent, 'xmas_tinsel', pod.x, pod.z, 0, undefined, (model) =>
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || (object.material as THREE.Material).name !== 'tinsel') return;
      let material = tinted.get(colour);
      if (!material) {
        // Fully metallic reads near black here: the room reflects too little for it to shine.
        material = Object.assign((object.material as THREE.MeshStandardMaterial).clone(), { metalness: 0.4, roughness: 0.35 });
        (material as THREE.MeshStandardMaterial).color.setHex(colour);
        tinted.set(colour, material);
      }
      object.material = material;
    }),
  );
}
