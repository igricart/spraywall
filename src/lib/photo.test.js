import { expect, test } from 'vitest';
import { fitSize } from './photo.js';

test('big photos shrink to the max side, keeping the aspect ratio', () => {
  expect(fitSize(4000, 3000)).toEqual({ w: 2400, h: 1800 });
  expect(fitSize(3000, 4000)).toEqual({ w: 1800, h: 2400 });
});

test('small photos are left alone', () => {
  expect(fitSize(1600, 1200)).toEqual({ w: 1600, h: 1200 });
});
