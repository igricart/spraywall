import { parseFont } from './grades.js';

// Route <-> URL hash. Roles: s=start h=hand+foot f=foot only t=top/finish (Kilter's model).
// Hash shape: #w=1&n=Name&d=6&ft=a&h=12s.40h.88f.90t
//   i  = id of the saved route in the shared list (dropped on any edit)
//   w  = wall version the hold ids belong to
//   d  = setter's difficulty (see grades.js); old links had g=<typed Font grade>
//   ft = feet rule (omitted = 'm')
export const FEET = {
  m: 'Marked feet only',
  a: 'Any feet',
  h: 'Feet follow hands',
  n: 'Footless',
};

export function encode({
  id = null,
  wall = 1,
  name = '',
  difficulty = null,
  feet = 'm',
  holds = {},
}) {
  const p = new URLSearchParams();
  if (id != null) p.set('i', id);
  p.set('w', wall);
  if (name) p.set('n', name);
  if (difficulty != null) p.set('d', difficulty);
  if (feet !== 'm') p.set('ft', feet);
  p.set(
    'h',
    Object.entries(holds)
      .map(([id, r]) => id + r)
      .join('.'),
  );
  return p.toString();
}

export function decode(str) {
  const p = new URLSearchParams(str.replace(/^#/, ''));
  const holds = {};
  for (const tok of (p.get('h') || '').split('.')) {
    const m = /^(\d+)([shft])$/.exec(tok); // drop anything malformed
    if (m) holds[m[1]] = m[2];
  }
  // links from before wall versioning have no w -> they were made on wall 1
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
