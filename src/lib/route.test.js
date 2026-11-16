import { expect, test } from 'vitest';
import { encode, decode } from './route.js';

const circles = [
  { x: 0.5, y: 0.312, r: 0.018, t: 's' },
  { x: 0.612, y: 0.4, r: 0.02, t: 'h' },
  { x: 0, y: 1, r: 0.005, t: 'f' },
  { x: 1, y: 0.999, r: 0.08, t: 't' },
];

test('round-trips a route with its circles through the hash', () => {
  const r = { id: 42, wall: 2, name: 'Crimp & Pray', difficulty: 7, feet: 'h', holds: circles };
  expect(decode('#' + encode(r))).toEqual(r);
});

test('positions are kept to 1/1000 of the photo', () => {
  const [h] = decode(encode({ holds: [{ x: 0.12345, y: 0.6789, r: 0.0213, t: 'h' }] })).holds;
  expect(h).toEqual({ x: 0.123, y: 0.679, r: 0.021, t: 'h' });
});

test('drops malformed circle tokens', () => {
  expect(decode('c=500.500.20s_junk_1.2.3x_2000.5.5h_5.5.0h_10.20.30t').holds).toEqual([
    { x: 0.5, y: 0.5, r: 0.02, t: 's' },
    { x: 0.01, y: 0.02, r: 0.03, t: 't' },
  ]);
});

test('empty links and pre-versioning links', () => {
  expect(decode('')).toEqual({
    id: null,
    wall: 1,
    name: '',
    difficulty: null,
    feet: 'm',
    holds: [],
  });
  expect(decode('#n=Old&h=5s').holds).toEqual([]); // old id-based links carry no circles
});

test('feet rule: default omitted from link, unknown value falls back', () => {
  expect(encode({ holds: [] })).not.toContain('ft=');
  expect(decode('ft=a').feet).toBe('a');
  expect(decode('ft=zz').feet).toBe('m');
});

test('difficulty: half steps survive, old typed grades convert', () => {
  expect(decode(encode({ difficulty: 4.5, holds: [] })).difficulty).toBe(4.5);
  expect(decode('g=6b').difficulty).toBe(6);
  expect(decode('g=hard').difficulty).toBeNull();
  expect(decode('d=0').difficulty).toBe(0);
});
