import { expect, test } from 'vitest';
import { clamp01, nearest, nextId, parseHoldsFile } from './holds.js';

const holds = [
  { id: 1, x: 0.5, y: 0.5, r: 0.01 },
  { id: 2, x: 0.52, y: 0.5, r: 0.01 },
  { id: 7, x: 0.9, y: 0.1, r: 0.05 },
];

test('nearest picks the closest hold inside the halo', () => {
  expect(nearest(holds, { x: 0.515, y: 0.5 }, 0.02, 1).id).toBe(2);
  expect(nearest(holds, { x: 0.504, y: 0.5 }, 0.02, 1).id).toBe(1);
});

test('nearest returns null outside every circle and halo', () => {
  expect(nearest(holds, { x: 0.2, y: 0.8 }, 0.02, 1)).toBeNull();
});

test('big holds are hit anywhere inside their radius', () => {
  expect(nearest(holds, { x: 0.94, y: 0.1 }, 0.01, 1).id).toBe(7);
});

test('aspect scales vertical distance', () => {
  // 0.03 apart vertically: inside halo when the image is wide (aspect .5), outside when tall (2)
  expect(nearest(holds, { x: 0.5, y: 0.53 }, 0.02, 0.5)?.id).toBe(1);
  expect(nearest(holds, { x: 0.5, y: 0.53 }, 0.02, 2)).toBeNull();
});

test('helpers', () => {
  expect(nextId([])).toBe(1);
  expect(nextId(holds)).toBe(8);
  expect([clamp01(-1), clamp01(0.123456), clamp01(2)]).toEqual([0, 0.1235, 1]);
  expect(parseHoldsFile([holds[0]])).toEqual({ wall: 1, holds: [holds[0]] });
  expect(parseHoldsFile({ wall: 3, holds: [] })).toEqual({ wall: 3, holds: [] });
});
