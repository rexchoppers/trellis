import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Each piece's origin and facing: see the table at the top of assets/scenes/corporate-office/office.py.
export type KitPiece = 'workstation' | 'exec_desk' | 'plant' | 'kitchen' | 'lift_core' | 'ceiling_light' | 'pod_screen' | 'sofa' | 'low_table';

let loading: Promise<Map<string, THREE.Object3D>> | undefined;

function kit() {
  loading ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}scenes/corporate-office/office.glb`).then((gltf) => {
    const pieces = new Map<string, THREE.Object3D>();
    for (const piece of gltf.scene.children) {
      piece.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        // Every copy shares this geometry and these materials, so nothing holding a copy disposes them.
        object.userData.kit = true;
      });
      pieces.set(piece.name, piece);
    }
    return pieces;
  });
  return loading;
}

const felts = new Map<number, THREE.Material>();

export function placeKit(parent: THREE.Object3D, piece: KitPiece, x: number, z: number, rotationY = 0, felt?: number) {
  const holder = new THREE.Group();
  holder.position.set(x, 0, z);
  holder.rotation.y = rotationY;
  parent.add(holder);
  void kit().then((pieces) => {
    const model = pieces.get(piece);
    if (!model) return;
    const copy = model.clone();
    if (felt !== undefined)
      copy.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || (object.material as THREE.Material).name !== 'felt') return;
        let tinted = felts.get(felt);
        if (!tinted) {
          tinted = (object.material as THREE.MeshStandardMaterial).clone();
          (tinted as THREE.MeshStandardMaterial).color.setHex(felt);
          felts.set(felt, tinted);
        }
        object.material = tinted;
      });
    holder.add(copy);
  });
  return holder;
}

export type Spot = { x: number; y: number; z: number; rotationY?: number };

// An empty Blender tags with a "marker" property, in the piece's own coordinates.
type Marker = { kind: 'serve' | 'seat' | 'block'; x: number; z: number; rotationY: number; w: number; d: number };

export function kitMarkers(piece: KitPiece): Promise<Marker[]> {
  return kit().then((pieces) => {
    const markers: Marker[] = [];
    pieces.get(piece)?.traverse((object) => {
      const { marker, w = 0, d = 0 } = object.userData as { marker?: Marker['kind']; w?: number; d?: number };
      if (marker) markers.push({ kind: marker, x: object.position.x, z: object.position.z, rotationY: object.rotation.y, w, d });
    });
    return markers;
  });
}

// Instanced: one draw call per material however many copies there are.
export function placeKitMany(parent: THREE.Object3D, piece: KitPiece, spots: Spot[]) {
  const holder = new THREE.Group();
  parent.add(holder);
  void kit().then((pieces) => {
    const model = pieces.get(piece);
    if (!model || !spots.length) return;
    model.updateMatrixWorld(true);
    const toPiece = model.matrixWorld.clone().invert();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const local = toPiece.clone().multiply(object.matrixWorld);
      const mesh = new THREE.InstancedMesh(object.geometry, object.material, spots.length);
      const matrix = new THREE.Matrix4();
      const turn = new THREE.Quaternion();
      spots.forEach((spot, i) => {
        matrix.compose(new THREE.Vector3(spot.x, spot.y, spot.z), turn.setFromAxisAngle(up, spot.rotationY ?? 0), one).multiply(local);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.userData.kit = true;
      holder.add(mesh);
    });
  });
  return holder;
}
