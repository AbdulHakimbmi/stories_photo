// Tests for the game-side state (idempotent events, snapshots, progress). Plain Node, no browser.
import assert from 'node:assert/strict';
import { GardenState, normalizeMemory } from '../src/garden/state.js';
import { DEMO_MEMORIES } from '../src/data/content.js';

const mem = (id, category = 'everyday', extra = {}) => ({ id, title: 'T ' + id, story: 'S', name: '', year: null, yearUnknown: true, category, slot: 0, width: 800, height: 600, approvedAt: 1000, responses: [], ...extra });
const tests = [];
const test = (n, f) => tests.push([n, f]);

test('the same upsert event delivered twice creates one plant and one change notification', () => {
  const s = new GardenState(); const seen = [];
  s.subscribe((c) => seen.push(c));
  assert.equal(s.applyEvent('memory:upsert', { memory: mem('a') }), 'added');
  assert.equal(s.applyEvent('memory:upsert', { memory: mem('a') }), 'same');
  assert.equal(s.list.length, 1);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].added, ['a']);
});
test('a snapshot after reconnect keeps existing plants (no re-grow), adds missed ones and removes deleted ones', () => {
  const s = new GardenState();
  s.replaceAll({ session: { name: 'x', locked: false }, memories: [mem('a'), mem('b', 'places')] });
  const c = s.replaceAll({ session: { name: 'x', locked: true }, memories: [mem('b', 'places'), mem('c', 'celebrations')] });
  assert.deepEqual(c.added, ['c']); assert.deepEqual(c.removed, ['a']); assert.deepEqual(c.updated, []);
  assert.equal(c.meta, true); assert.equal(s.meta.locked, true);
  assert.deepEqual(s.list.map((m) => m.id).sort(), ['b', 'c']);
});
test('removal event removes; removing twice is harmless', () => {
  const s = new GardenState(); s.upsertMemory(mem('a'));
  assert.equal(s.applyEvent('memory:remove', { id: 'a' }), 'removed');
  assert.equal(s.applyEvent('memory:remove', { id: 'a' }), 'same');
  assert.equal(s.list.length, 0);
});
test('recollections: added once, duplicates ignored, removed, original story untouched', () => {
  const s = new GardenState(); s.upsertMemory(mem('a', 'everyday', { story: 'original' }));
  const r = { id: 'r1', name: 'Mei', text: 'I remember' };
  assert.equal(s.applyEvent('response:upsert', { memoryId: 'a', response: r }), 'added');
  assert.equal(s.applyEvent('response:upsert', { memoryId: 'a', response: r }), 'same');
  assert.equal(s.get('a').responses.length, 1);
  assert.equal(s.get('a').story, 'original');
  assert.equal(s.applyEvent('response:upsert', { memoryId: 'nope', response: r }), 'ignored');
  s.applyEvent('response:remove', { memoryId: 'a', id: 'r1' });
  assert.equal(s.get('a').responses.length, 0);
});
test('hostile or malformed network data is normalised or ignored, never trusted', () => {
  const s = new GardenState();
  assert.equal(s.upsertMemory(null), 'ignored');
  assert.equal(s.upsertMemory({ id: 5 }), 'ignored');
  assert.equal(s.upsertMemory({ id: 'x', category: '__proto__' }), 'ignored');
  s.upsertMemory({ id: 'ok', category: 'places', title: { toString() { return 'x'; } }, story: 'y'.repeat(5000), slot: -4, width: 'wide', responses: [null, 3, { id: 'r' }, { id: 'r' }] });
  const m = s.get('ok');
  assert.equal(m.title, ''); assert.equal(m.story.length, 800); assert.equal(m.slot, 0); assert.equal(m.width, 4); assert.equal(m.responses.length, 1);
  assert.equal(s.applyEvent('unknown:event', {}), 'ignored');
  assert.equal(normalizeMemory(JSON.parse('{"id":"a","category":"people","__proto__":{"x":1}}')).category, 'people');
});
test('activity progress counts approved memories only: everyday + celebration + place', () => {
  const s = new GardenState();
  assert.equal(s.progress().complete, false); assert.equal(s.progress().count, 0);
  s.upsertMemory(mem('a', 'everyday')); s.upsertMemory(mem('p', 'people'));
  assert.equal(s.progress().count, 1); assert.equal(s.progress().complete, false, 'people memories are not required');
  s.upsertMemory(mem('c', 'celebrations')); s.upsertMemory(mem('pl', 'places'));
  assert.equal(s.progress().complete, true);
  s.removeMemory('pl');
  assert.equal(s.progress().complete, false, 'removing a memory un-completes the activity');
});
test('plant importance never depends on popularity: no counts feed any memory field', () => {
  const s = new GardenState(); s.upsertMemory(mem('a')); s.upsertMemory(mem('b'));
  for (let i = 0; i < 9; i++) s.upsertResponse('a', { id: 'r' + i, text: 'x' });
  const a = s.get('a'); const b = s.get('b');
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  assert.equal(a.slot, b.slot);
});
test('demo memories are valid, fictional, and do not complete the activity on their own', () => {
  const s = new GardenState();
  for (const d of DEMO_MEMORIES) assert.equal(s.upsertMemory(d), 'added');
  assert.ok(s.list.every((m) => m.fictional));
  assert.equal(s.progress().complete, false);
});

let failed = 0;
for (const [n, f] of tests) {
  try { f(); console.log('  ok  ', n); } catch (e) { failed++; console.log('  FAIL', n, '\n      ', e.message); }
}
console.log(`\n${tests.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
