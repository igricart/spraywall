import { parseFont } from './grades.js';

// Route <-> URL hash. A route carries its own circles (model B, docs/SPEC.md):
//   #i=7&w=2&n=Name&d=6&ft=a&c=500.312.18s_612.400.20h
//   c  = circles: x.y.r in 1/1000 of the photo (r relative to width) + type
//        s start, h hand+foot, f foot only, t top
//   i  = id of the saved route (dropped on any edit); w = wall photo version
//   d  = setter's difficulty (grades.js); old links had g=<typed Font grade>
//   ft = feet rule (omitted = 'm')
export const FEET = {
  m: 'Marked feet only',
  a: 'Any feet',
  h: 'Feet follow hands',
  n: 'Footless',
};
export const TYPES = ['s', 'h', 'f', 't'];

const k = (v) => Math.round(v * 1000);

export function encode({
  id = null,
  wall = 1,
  name = '',
  difficulty = null,
  feet = 'm',
  holds = [],
}) {
  const p = new URLSearchParams();
  if (id != null) p.set('i', id);
  p.set('w', wall);
  if (name) p.set('n', name);
  if (difficulty != null) p.set('d', difficulty);
  if (feet !== 'm') p.set('ft', feet);
  p.set('c', holds.map((h) => `${k(h.x)}.${k(h.y)}.${k(h.r)}${h.t}`).join('_'));
  return p.toString();
}

export function decode(str) {
  const p = new URLSearchParams(str.replace(/^#/, ''));
  const holds = [];
  for (const tok of (p.get('c') || '').split('_')) {
    const m = /^(\d{1,4})\.(\d{1,4})\.(\d{1,3})([shft])$/.exec(tok); // drop anything malformed
    if (m && +m[1] <= 1000 && +m[2] <= 1000 && +m[3] > 0)
      holds.push({ x: m[1] / 1000, y: m[2] / 1000, r: m[3] / 1000, t: m[4] });
  }
  const feet = FEET[p.get('ft')] ? p.get('ft') : 'm';
  const d = p.get('d');
  const difficulty =
    d !== null && d !== '' && isFinite(d) ? +d : p.get('g') ? parseFont(p.get('g')) : null;
  return {
    id: +p.get('i') || null,
    wall: +p.get('w') || 1,
    name: p.get('n') || '',
    difficulty,
    feet,
    holds,
  };
}
