import * as THREE from 'three';
import { kitMaterial } from './kit';

// The fire alarm: any call point raises it, any call point resets it. Strobes flash, a two-tone
// siren plays and a banner says how to stop it. Nothing else changes: jobs carry on.
export function fireAlarm(host: HTMLElement, scene: THREE.Scene) {
  let active = false;
  let faces: { mesh: THREE.Mesh; normal: THREE.Material; pressed: THREE.Material }[] = [];
  let strobe: THREE.MeshStandardMaterial | undefined;
  void kitMaterial('strobe').then((material) => (strobe = material as THREE.MeshStandardMaterial | undefined));

  // A red wash over the whole floor in time with the beacons, so the alarm reads from bird's eye too.
  const wash = new THREE.AmbientLight(0xff2a1a, 0);
  scene.add(wash);

  const banner = document.createElement('div');
  banner.className = 'sign pointer-events-none absolute top-14 left-1/2 hidden -translate-x-1/2 bg-[#c8102e] px-4 py-2 text-[13px] font-bold text-white';
  banner.textContent = 'Fire alarm · click any call point to reset';
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

  const show = () => {
    for (const face of faces) face.mesh.material = active ? face.pressed : face.normal;
    banner.classList.toggle('hidden', !active);
    if (!active) {
      if (strobe) strobe.emissiveIntensity = 0;
      wash.intensity = 0;
    }
  };

  return {
    attach: (next: typeof faces) => {
      faces = next;
      show();
    },
    toggle: () => {
      active = !active;
      sound(active);
      show();
    },
    update: (now: number) => {
      if (!active) return;
      const on = now % 1000 < 320;
      wash.intensity = on ? 1.4 : 0;
      if (!strobe) return;
      strobe.emissive.setHex(0xff2a1a);
      strobe.emissiveIntensity = on ? 12 : 0;
    },
    dispose: () => {
      sound(false);
      void audio?.close();
      banner.remove();
      scene.remove(wash);
      if (strobe) strobe.emissiveIntensity = 0;
    },
  };
}
