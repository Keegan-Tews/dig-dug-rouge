import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, STEPS, parseTrack } from '../src/music.js';
import { ZONES } from '../src/constants.js';

test('every music track is two full bars of 16th notes', () => {
  for (const [id, track] of Object.entries(TRACKS)) {
    const t = parseTrack(track);
    assert.equal(t.notes.length, STEPS, `${id} lead`);
    assert.equal(t.bass.length, STEPS, `${id} bass`);
    assert.equal(t.drums.length, STEPS, `${id} drums`);
    for (const n of [...t.notes, ...t.bass]) assert.ok(n === null || Number.isInteger(n), `${id} note ${n}`);
    for (const d of t.drums) assert.ok(d === null || 'ksh'.includes(d), `${id} drum ${d}`);
  }
});

test('every zone has its own music track', () => {
  for (const id of Object.keys(ZONES)) assert.ok(TRACKS[id], id);
});
