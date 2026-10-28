import * as THREE from 'three';
import { liveFace } from './build';
import type { Floor } from './floor';
import { kitMaterial } from './kit';

// The fire alarm: any call point raises it, and only the panel in the plant room resets it. The panel's screen
// names each call point pressed; strobes flash, a two-tone siren plays and a banner says where to reset it.
// Nothing else changes: jobs carry on.
export function fireAlarm(host: HTMLElement, scene: THREE.Scene) {
  let pressed: number[] = [];
  let faces: Floor['callFaces'] = [];
  let names: string[] = [];
  let screens: THREE.Mesh[] = [];
  const screen = liveFace(512, 307);
  let strobe: THREE.MeshStandardMaterial | undefined;
  void kitMaterial('strobe').then((material) => (strobe = material as THREE.MeshStandardMaterial | undefined));

  // A red wash over the whole floor in time with the beacons, so the alarm reads from bird's eye too.
  const wash = new THREE.AmbientLight(0xff2a1a, 0);
  scene.add(wash);

  const banner = document.createElement('div');
  banner.className = 'sign pointer-events-none absolute top-14 left-1/2 hidden -translate-x-1/2 bg-[#c8102e] px-4 py-2 text-[13px] font-bold text-white';
  banner.textContent = 'Fire alarm · reset it at the fire alarm panel in the plant room';
  host.append(banner);

  let audio: AudioContext | undefined;
  let siren: { osc: OscillatorNode; gain: GainNode; timer: number } | undefined;
  const sound = (on: boolean) => {
    if (on) {
      audio ??= new AudioContext();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'square';
      gain.gain.value = 0.05;
      osc.connect(gain).connect(audio.destination);
      osc.start();
      let high = false;
      // UK two-tone: alternating tones every half second.
      const timer = window.setInterval(() => {
        high = !high;
        osc.frequency.setValueAtTime(high ? 970 : 800, audio!.currentTime);
      }, 500);
      siren = { osc, gain, timer };
    } else if (siren) {
      window.clearInterval(siren.timer);
      siren.osc.stop();
      siren.osc.disconnect();
      siren = undefined;
    }
  };

  const paint = () =>
    screen.paint((ctx) => {
      const font = (weight: number, size: number) => `${weight} ${size}px "Archivo Variable", ui-sans-serif, sans-serif`;
      if (!pressed.length) {
        ctx.fillStyle = '#0c1a10';
        ctx.fillRect(0, 0, 512, 307);
        ctx.fillStyle = '#8fd6a4';
        ctx.font = font(700, 22);
        ctx.fillText('FIRE ALARM CONTROL PANEL', 24, 32);
        ctx.fillStyle = '#7cfc9a';
        ctx.font = font(800, 48);
        ctx.fillText('SYSTEM NORMAL', 24, 150);
        ctx.fillStyle = '#8fd6a4';
        ctx.font = font(500, 24);
        ctx.fillText(`${names.length} call points · all clear`, 24, 270);
        return;
      }
      ctx.fillStyle = '#1a0505';
      ctx.fillRect(0, 0, 512, 307);
      ctx.fillStyle = '#c8102e';
      ctx.fillRect(0, 0, 512, 74);
      ctx.fillStyle = '#ffffff';
      ctx.font = font(800, 54);
      ctx.fillText('FIRE', 24, 40);
      ctx.font = font(600, 28);
      pressed.slice(0, 4).forEach((point, i) => ctx.fillText(`Call point ${point + 1} · ${names[point] ?? ''}`, 24, 112 + i * 38));
      if (pressed.length > 4) ctx.fillText(`and ${pressed.length - 4} more`, 24, 112 + 4 * 38);
      ctx.fillStyle = '#ffd1d1';
      ctx.font = font(500, 22);
      ctx.fillText('Press RESET to clear', 24, 285);
    });

  const show = () => {
    const active = pressed.length > 0;
    for (const face of faces) face.mesh.material = pressed.includes(face.point) ? face.pressed : face.normal;
    for (const mesh of screens) mesh.material = screen.material;
    paint();
    banner.classList.toggle('hidden', !active);
    if (!active) {
      if (strobe) strobe.emissiveIntensity = 0;
      wash.intensity = 0;
    }
  };

  return {
    attach: (floor: Pick<Floor, 'callFaces' | 'callNames' | 'firePanel'>) => {
      faces = floor.callFaces;
      names = floor.callNames;
      screens = floor.firePanel.screens;
      show();
    },
    trigger: (point: number) => {
      if (pressed.includes(point)) return;
      if (!pressed.length) sound(true);
      pressed = [...pressed, point];
      show();
    },
    reset: () => {
      if (!pressed.length) return;
      pressed = [];
      sound(false);
      show();
    },
    update: (now: number) => {
      if (!pressed.length) return;
      const on = now % 1000 < 320;
      wash.intensity = on ? 1.4 : 0;
      if (!strobe) return;
      strobe.emissive.setHex(0xff2a1a);
      strobe.emissiveIntensity = on ? 12 : 0;
    },
    dispose: () => {
      sound(false);
      void audio?.close();
      screen.dispose();
      banner.remove();
      scene.remove(wash);
      if (strobe) strobe.emissiveIntensity = 0;
    },
  };
}
