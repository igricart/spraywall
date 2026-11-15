import { expect, test } from 'vitest';
import { encode, decode, nextRole } from './route.js';

test('round-trips a route through the hash', () => {
  const r = {
    wall: 2,
    name: 'Crimp & Pray',
    grade: '6B+',
    holds: { 12: 's', 40: 'h', 88: 'f', 90: 't' },
  };
  expect(decode('#' + encode(r))).toEqual(r);
});

test('drops malformed hold tokens', () => {
  expect(decode('h=1s.junk.2x.3h').holds).toEqual({ 1: 's', 3: 'h' });
});

test('empty and pre-versioning links default to wall 1', () => {
  expect(decode('')).toEqual({ wall: 1, name: '', grade: '', holds: {} });
  expect(decode('#n=Old&h=5s').wall).toBe(1);
});

test('role cycle ends in off', () => {
  expect([undefined, 's', 'h', 'f', 't'].map(nextRole)).toEqual(['s', 'h', 'f', 't', undefined]);
});
