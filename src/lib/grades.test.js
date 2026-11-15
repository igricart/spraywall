import { expect, test } from 'vitest';
import { FONT, gradeLabel, gradeOptions, parseFont } from './grades.js';

test('Font options are the scale in order', () => {
  expect(gradeOptions('font').map((o) => o.label)).toEqual(FONT);
});

test('V options merge Font grades they span into a midpoint value', () => {
  const v = Object.fromEntries(gradeOptions('v').map((o) => [o.label, o.value]));
  expect(v.V0).toBe(FONT.indexOf('4'));
  expect(v.V3).toBe((FONT.indexOf('6A') + FONT.indexOf('6A+')) / 2);
  expect(v.V6).toBe(FONT.indexOf('7A'));
  expect(new Set(gradeOptions('v').map((o) => o.label)).size).toBe(gradeOptions('v').length);
});

test('every V option labels back to itself', () => {
  for (const o of gradeOptions('v')) expect(gradeLabel(o.value, 'v')).toBe(o.label);
});

test('labels round to the nearest grade and clamp', () => {
  expect(gradeLabel(FONT.indexOf('6B'), 'font')).toBe('6B');
  expect(gradeLabel(FONT.indexOf('6B'), 'v')).toBe('V4');
  expect(gradeLabel(8.4, 'font')).toBe('6C');
  expect(gradeLabel(-3, 'font')).toBe('3');
  expect(gradeLabel(99, 'v')).toBe('V17');
  expect(gradeLabel(null, 'font')).toBe('');
});

test('parseFont accepts typed grades in any case', () => {
  expect(parseFont('6b')).toBe(FONT.indexOf('6B'));
  expect(parseFont(' 7a+ ')).toBe(FONT.indexOf('7A+'));
  expect(parseFont('V4')).toBeNull();
});

// Round trips. The stored value is a Font index; switching the display scale only changes labels.
const pick = (scale, label) => gradeOptions(scale).find((o) => o.label === label).value;

test('Font -> number -> Font is exact for every grade', () => {
  FONT.forEach((label, d) => {
    expect(pick('font', gradeLabel(d, 'font'))).toBe(d);
  });
});

test('Font -> V -> Font is exact wherever V has its own grade', () => {
  const vSiblings = ['6A', '6A+', '6B', '6B+', '6C', '6C+', '7B', '7B+']; // pairs V merges
  for (const label of FONT.filter((g) => !vSiblings.includes(g))) {
    const viaV = pick('v', gradeLabel(pick('font', label), 'v'));
    expect(gradeLabel(viaV, 'font')).toBe(label);
  }
});

test('Font -> V -> Font never moves more than half a grade, and keeps the V grade', () => {
  FONT.forEach((label, d) => {
    const viaV = pick('v', gradeLabel(d, 'v'));
    expect(Math.abs(viaV - d)).toBeLessThanOrEqual(0.5);
    expect(gradeLabel(viaV, 'v')).toBe(gradeLabel(d, 'v'));
  });
  // documented loss: V3 covers 6A and 6A+, so a 6A re-picked as V3 reads back as 6A+
  expect(gradeLabel(pick('v', 'V3'), 'font')).toBe('6A+');
});
