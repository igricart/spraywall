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
