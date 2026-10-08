import * as THREE from 'three';

// visible allows a margin past the edges so a tag stays while its figure is partly in view.
type Screen = { x: number; y: number; visible: boolean; ahead: boolean };

const p = new THREE.Vector3();
export function toScreen(at: THREE.Vector3, camera: THREE.Camera, width: number, height: number): Screen {
  p.copy(at).project(camera);
  const ahead = p.z < 1;
  return { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height, visible: ahead && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1, ahead };
}

export function makeTag(name: string, onClick?: (e: MouseEvent) => void) {
  const tag = document.createElement('span');
  tag.className = `sign absolute top-0 left-0 ${onClick ? 'cursor-pointer' : 'pointer-events-none'} bg-[#0b0b0a] px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-[#f2f2ee]`;
  tag.textContent = name;
  if (onClick) tag.addEventListener('click', onClick);
  return tag;
}

export function makeBubble(onClick?: (e: MouseEvent) => void) {
  const bubble = document.createElement('span');
  bubble.className = 'thought';
  bubble.innerHTML = '<span class="thought-text"></span><span class="thought-dots"><i>.</i><i>.</i><i>.</i></span>';
  if (onClick) {
    bubble.style.pointerEvents = 'auto';
    bubble.style.cursor = 'pointer';
    bubble.addEventListener('click', onClick);
  }
  return bubble;
}

// With stops, a finished sentence drops its thinking dots.
export function setBubble(bubble: HTMLElement, text: string, stops = false) {
  const words = bubble.firstElementChild as HTMLSpanElement;
  if (words.textContent !== text) words.textContent = text;
  if (stops) (bubble.lastElementChild as HTMLElement).style.display = /[.?!]$/.test(text) ? 'none' : '';
}

export const show = (element: HTMLElement, shown: boolean) => {
  element.style.display = shown ? '' : 'none';
};

export const placeTag = (tag: HTMLElement, at: Screen) => {
  tag.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, 6px)`;
};
export const placeBubble = (bubble: HTMLElement, at: Screen) => {
  bubble.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, calc(-100% - 10px))`;
};
