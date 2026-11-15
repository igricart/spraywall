// run: node route.test.mjs
import assert from 'node:assert/strict';
import { encode, decode, nextRole } from './route.js';

const r = { name: 'Crimp & Pray', grade: '6B+', holds: { 12: 's', 40: 'h', 88: 'f', 90: 't' } };
assert.deepEqual(decode('#' + encode(r)), { ...r, holds: { 12: 's', 40: 'h', 88: 'f', 90: 't' } });
assert.deepEqual(decode('h=1s.junk.2x.3h').holds, { 1: 's', 3: 'h' });
assert.deepEqual(decode(''), { name: '', grade: '', holds: {} });
assert.deepEqual([undefined, 's', 'h', 'f', 't'].map(nextRole), ['s', 'h', 'f', 't', undefined]);
console.log('ok');
