import { expect, test } from 'vitest';
import { encode, decode } from './route.js';

test('round-trips a route through the hash', () => {
  const r = {
    id: 42,
    wall: 2,
    name: 'Crimp & Pray',
    difficulty: 7,
    feet: 'h',
    holds: { 12: 's', 40: 'h', 88: 'f', 90: 't' },
  };
  expect(decode('#' + encode(r))).toEqual(r);
});

test('drops malformed hold tokens', () => {
  expect(decode('h=1s.junk.2x.3h').holds).toEqual({ 1: 's', 3: 'h' });
});

test('empty and pre-versioning links default to wall 1', () => {
  expect(decode('')).toEqual({
    id: null,
    wall: 1,
    name: '',
    difficulty: null,
    feet: 'm',
    holds: {},
  });
  expect(decode('#n=Old&h=5s').wall).toBe(1);
});

test('feet rule: default omitted from link, unknown value falls back', () => {
  expect(encode({ holds: {} })).not.toContain('ft=');
  expect(decode('ft=a').feet).toBe('a');
  expect(decode('ft=zz').feet).toBe('m');
});

test('difficulty: half steps survive, old typed grades convert', () => {
  expect(decode(encode({ difficulty: 4.5, holds: {} })).difficulty).toBe(4.5);
  expect(decode('g=6b&h=1s').difficulty).toBe(6);
  expect(decode('g=hard&h=1s').difficulty).toBeNull();
  expect(decode('d=0').difficulty).toBe(0);
});
