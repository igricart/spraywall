// Route <-> URL hash. Roles: s=start h=hand+foot f=foot only t=top/finish (Kilter's model).
// Hash shape: #w=1&n=Name&g=6B&ft=a&h=12s.40h.88f.90t
//   w  = wall version the hold ids belong to
//   ft = feet rule (omitted = 'm')
export const ROLES = ['s', 'h', 'f', 't'];
export const FEET = {
  m: 'Marked feet only',
  a: 'Any feet',
  h: 'Feet follow hands',
  n: 'Footless',
};

// undefined -> s -> h -> f -> t -> undefined (off).  Foot-only holds: undefined <-> f.
export const nextRole = (r, footOnly = false) =>
  footOnly ? (r ? undefined : 'f') : ROLES[ROLES.indexOf(r) + 1];

export function encode({ wall = 1, name = '', grade = '', feet = 'm', holds = {} }) {
  const p = new URLSearchParams();
  p.set('w', wall);
  if (name) p.set('n', name);
  if (grade) p.set('g', grade);
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
  return { wall: +p.get('w') || 1, name: p.get('n') || '', grade: p.get('g') || '', feet, holds };
}
