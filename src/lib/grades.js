// Grades are stored as one difficulty number: the index into FONT. A V grade that spans two Font
// grades (V3 = 6A/6A+) is stored as the midpoint (4.5), so votes in either scale feed one median.
export const FONT = [
  '3',
  '4',
  '5',
  '5+',
  '6A',
  '6A+',
  '6B',
  '6B+',
  '6C',
  '6C+',
  '7A',
  '7A+',
  '7B',
  '7B+',
  '7C',
  '7C+',
  '8A',
  '8A+',
  '8B',
  '8B+',
  '8C',
  '8C+',
  '9A',
];
const V = [
  'VB',
  'V0',
  'V1',
  'V2',
  'V3',
  'V3',
  'V4',
  'V4',
  'V5',
  'V5',
  'V6',
  'V7',
  'V8',
  'V8',
  'V9',
  'V10',
  'V11',
  'V12',
  'V13',
  'V14',
  'V15',
  'V16',
  'V17',
];

export const SCALES = { font: 'Font', v: 'V' };

// Picker entries for a scale: [{ label, value }]
export function gradeOptions(scale) {
  if (scale !== 'v') return FONT.map((label, value) => ({ label, value }));
  const out = [];
  V.forEach((label, i) => {
    const last = out.at(-1);
    if (last?.label === label) last.idx.push(i);
    else out.push({ label, idx: [i] });
  });
  return out.map(({ label, idx }) => ({ label, value: idx.reduce((a, b) => a + b) / idx.length }));
}

export function gradeLabel(d, scale) {
  if (d == null) return '';
  const i = Math.min(FONT.length - 1, Math.max(0, Math.round(d)));
  return (scale === 'v' ? V : FONT)[i];
}

// '6b', '6B+' -> Font index; anything else -> null (used for old links with a typed grade)
export function parseFont(text) {
  const i = FONT.indexOf(String(text).trim().toUpperCase());
  return i < 0 ? null : i;
}

// Tape colour band, like gyms colour their route tape by difficulty (Font index):
// 3–5+ easy, 6A–6B+ mid, 6C–7A+ hard, 7B and up very hard.
export function tapeBand(d) {
  if (d == null) return 'none';
  if (d < 4) return 'easy';
  if (d < 8) return 'mid';
  if (d < 12) return 'hard';
  return 'top';
}
