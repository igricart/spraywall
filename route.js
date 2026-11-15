// Route <-> URL hash. Roles: s=start h=hand f=foot t=top/finish.
// Hash shape: #n=Name&g=6B&h=12s.40h.88f.90t
export const ROLES = ['s', 'h', 'f', 't'];

// undefined -> s -> h -> f -> t -> undefined (off)
export const nextRole = (r) => ROLES[ROLES.indexOf(r) + 1];

export function encode({ name = '', grade = '', holds = {} }) {
  const p = new URLSearchParams();
  if (name) p.set('n', name);
  if (grade) p.set('g', grade);
  p.set('h', Object.entries(holds).map(([id, r]) => id + r).join('.'));
  return p.toString();
}

export function decode(str) {
  const p = new URLSearchParams(str.replace(/^#/, ''));
  const holds = {};
  for (const tok of (p.get('h') || '').split('.')) {
    const m = /^(\d+)([shft])$/.exec(tok); // drop anything malformed
    if (m) holds[m[1]] = m[2];
  }
  return { name: p.get('n') || '', grade: p.get('g') || '', holds };
}
