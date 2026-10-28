import * as THREE from 'three';
import type { config, jobs } from '../../../wailsjs/go/models';
import { liveFace } from './build';

const W = 1024;
const H = 576;
const FONT = '"Archivo Variable", ui-sans-serif, sans-serif';
const ROWS = 5;
const STATES = [
  { state: 'working', label: 'Working', colour: '#3ddc84' },
  { state: 'needs_you', label: 'Needs you', colour: '#ffb020' },
  { state: 'waiting', label: 'Resting', colour: '#4aa3ff' },
] as const;

// The town hall's screen: how many jobs are working, need you or are resting between checks, overall and per
// department, in the server lights' colours. It glows whether the hall's lights are on or not.
export function townHallScreen(departments: config.Department[], name: string) {
  const face = liveFace(W, H);
  const material = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: face.material.map, roughness: 0.25 });

  const show = (list: jobs.Job[]) =>
    face.paint((ctx) => {
      const count = (state: string, department?: string) => list.filter((job) => job.state === state && (!department || job.department === department)).length;
      ctx.fillStyle = '#10141b';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 40px ${FONT}`;
      ctx.fillText(name || 'Town hall', 56, 58);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#8e9bb3';
      ctx.font = `600 28px ${FONT}`;
      ctx.fillText('Town hall', W - 56, 58);
      ctx.fillStyle = '#262e3d';
      ctx.fillRect(56, 96, W - 112, 2);

      const tile = (W - 112 - 48) / 3;
      STATES.forEach(({ state, label, colour }, i) => {
        const x = 56 + i * (tile + 24);
        ctx.fillStyle = '#1a2030';
        ctx.fillRect(x, 122, tile, 170);
        ctx.textAlign = 'left';
        ctx.fillStyle = colour;
        ctx.font = `800 96px ${FONT}`;
        ctx.fillText(`${count(state)}`, x + 28, 196);
        ctx.fillStyle = '#c9d1de';
        ctx.font = `600 28px ${FONT}`;
        ctx.fillText(label, x + 30, 262);
      });

      const shown = departments.slice(0, departments.length > ROWS ? ROWS - 1 : ROWS);
      shown.forEach((department, i) => {
        const y = 344 + i * 46;
        ctx.fillStyle = department.colour;
        ctx.fillRect(56, y - 11, 22, 22);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = `600 32px ${FONT}`;
        ctx.fillText(department.name, 94, y);
        const busy = STATES.map(({ state, label }) => ({ n: count(state, department.key), label: label.toLowerCase() })).filter(({ n }) => n > 0);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#8e9bb3';
        ctx.font = `500 30px ${FONT}`;
        ctx.fillText(busy.length ? busy.map(({ n, label }) => `${n} ${label}`).join(' · ') : 'Quiet', W - 56, y);
      });
      if (shown.length < departments.length) {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#8e9bb3';
        ctx.font = `500 30px ${FONT}`;
        ctx.fillText(`+${departments.length - shown.length} more`, 94, 344 + shown.length * 46);
      }
    });
  show([]);

  return {
    material,
    show,
    dispose: () => {
      face.dispose();
      material.dispose();
    },
  };
}
