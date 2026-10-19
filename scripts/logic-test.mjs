// Plain-Node tests for the game rules (no browser, no Three.js).
// Run with:  npm test
import assert from 'node:assert/strict';
import {
  GameStore, createActions, createMemoryStorage, defaultProgress, sanitizeProgress,
  docCount, stagedCount, publicRecords, restrictedRecords, draftRecords, allRecords,
  objectiveFor, aishaTreeFor, progressLabel, canContribute, findSensitive, STORAGE_PREFIX, getBrowserStorage,
  loadSettings, attentionIds,
} from '../src/state/logic.js';
import { DIALOGUES, EXAMINE } from '../src/data/content.js';
import { Colliders } from '../src/world/collision.js';

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function fresh(profile = 'play') {
  const storage = createMemoryStorage();
  const store = new GameStore(storage);
  store.load(profile);
  const a = createActions(store, {});
  return { storage, store, a };
}

function completeM1(a) {
  a.flag('m1', 'spokeLim'); a.flag('m1', 'spokeMei');
  a.examine('m1_photo'); a.examine('m1_pot'); a.examine('m1_note');
  a.flag('m1', 'limConsent'); a.flag('m1', 'meiConsent');
  assert.ok(a.attachDetail('table').ok);
  assert.ok(a.attachDetail('burnt').ok);
  assert.ok(a.chooseRecollection('both').ok);
  assert.ok(a.chooseSharingM1('public').ok);
  return a.finalize('m1');
}
function completeM2(a) {
  a.examine('m2_photo'); a.flag('m2', 'spokeDevi'); a.flag('m2', 'spokeRahman');
  a.setName('devi', 'show'); a.setName('rahman', 'anonymous');
  assert.ok(a.keepPerspectives('both').ok);
  assert.ok(a.chooseDate('uncertain').ok);
  assert.ok(a.toggleNote('place').ok); assert.ok(a.toggleNote('devi').ok);
  return a.finalize('m2');
}
const completeM3 = (a) => a.m3Try('family');
const goodForm = { illus: 'market', title: 'Saturday market', story: 'We bought fruit every weekend.', year: '1990s', yearUnknown: false, people: 'Grandma', audience: 'public' };

test('fresh state is empty and objective starts with Aisha', () => {
  const { store } = fresh();
  assert.equal(docCount(store.p), 0);
  assert.match(objectiveFor(store.p), /Aisha/);
  assert.equal(aishaTreeFor(store.p), 'aisha_intro');
});

test('mission 1 end-to-end, reward only once', () => {
  const { store, a } = fresh();
  a.briefed();
  const r = completeM1(a);
  assert.ok(r.ok && r.firstTime);
  assert.equal(docCount(store.p), 1);
  assert.equal(a.finalize('m1').ok, false); // no repeated reward
  assert.equal(a.finalize('m1').reason, 'already');
  assert.equal(docCount(store.p), 1);
  assert.equal(publicRecords(store.p).length, 1);
});

test('mission 1 rejects unverified details and one-sided recollection', () => {
  const { a, store } = fresh();
  a.examine('m1_photo');
  const r = a.attachDetail('birthday');
  assert.equal(r.ok, false); assert.equal(r.reason, 'unverified');
  assert.equal(store.p.m1.details.length, 0);
  a.flag('m1', 'spokeLim'); a.flag('m1', 'spokeMei');
  assert.equal(a.chooseRecollection('lim').ok, false);
  assert.equal(store.p.m1.recollections, null);
  assert.equal(a.attachDetail('late').ok, true);
  assert.equal(a.attachDetail('late').attached, false); // toggles off
});

test('mission 1 detail locked until its source is found', () => {
  const { a } = fresh();
  const r = a.attachDetail('burnt');
  assert.equal(r.ok, false); assert.equal(r.reason, 'needs');
});

test('mission 1 sharing: must ask first, wrong choice can be corrected', () => {
  const { a, store } = fresh();
  assert.equal(a.chooseSharingM1('public').reason, 'ask-first');
  a.flag('m1', 'limConsent'); a.flag('m1', 'meiConsent');
  assert.equal(a.chooseSharingM1('family').reason, 'mismatch');
  assert.equal(store.p.m1.sharing, null);
  assert.equal(a.chooseSharingM1('public').ok, true);
  assert.equal(store.p.m1.sharing, 'public');
});

test('finalize reports what is missing', () => {
  const { a } = fresh();
  const r = a.finalize('m1');
  assert.equal(r.ok, false); assert.equal(r.reason, 'incomplete');
  assert.ok(r.missing.length >= 3);
});

test('mission 2: both perspectives, uncertain date, names from conversations', () => {
  const { a, store } = fresh();
  assert.equal(a.keepPerspectives('both').ok, false); // not heard yet
  a.examine('m2_photo'); a.flag('m2', 'spokeDevi'); a.flag('m2', 'spokeRahman');
  assert.equal(a.keepPerspectives('one').reason, 'one-sided');
  assert.equal(a.chooseDate('guess').reason, 'guess');
  assert.equal(store.p.m2.date, null);
  assert.ok(a.keepPerspectives('both').ok);
  assert.ok(a.chooseDate('uncertain').ok);
  a.toggleNote('place');
  assert.equal(a.finalize('m2').ok, false); // needs 2 notes + names
  a.toggleNote('devi');
  assert.equal(a.finalize('m2').ok, false); // names not asked
  a.setName('devi', 'show'); a.setName('rahman', 'anonymous');
  assert.ok(a.finalize('m2').ok);
  const rec = publicRecords(store.p)[0];
  assert.match(rec.contributors, /Madam Devi and a neighbour/);
  assert.match(rec.dateLabel, /uncertain/i);
  assert.equal(rec.perspectives.length, 2);
});

test('mission 3: public and "do not save" are gently refused, family saves restricted', () => {
  const { a, store } = fresh();
  const pub = a.m3Try('public');
  assert.equal(pub.ok, false);
  assert.equal(store.p.m3.done, false);
  assert.equal(a.m3Try('nosave').ok, false);
  assert.equal(store.p.m3.done, false);
  assert.ok(a.m3Try('family').ok);
  assert.equal(store.p.m3.audience, 'family');
  assert.equal(docCount(store.p), 1);
  assert.equal(publicRecords(store.p).length, 0, 'family record must never be public');
  assert.equal(restrictedRecords(store.p).length, 1);
  assert.equal(a.m3Try('public').reason, 'already'); // cannot be flipped to public afterwards
  assert.equal(publicRecords(store.p).length, 0);
});

test('contribution is locked until three stories are documented', () => {
  const { a } = fresh();
  assert.equal(a.submitContribution(goodForm).reason, 'locked');
});

test('contribution routing: public / family / draft stay separate', () => {
  const { a, store } = fresh();
  completeM1(a); completeM2(a); completeM3(a);
  assert.equal(docCount(store.p), 3);
  assert.ok(canContribute(store.p));
  assert.equal(publicRecords(store.p).length, 2);
  assert.equal(restrictedRecords(store.p).length, 1);

  const pub = a.submitContribution({ ...goodForm, title: 'Public one', audience: 'public' });
  const fam = a.submitContribution({ ...goodForm, title: 'Family one', audience: 'family' });
  const dr = a.submitContribution({ ...goodForm, title: 'Draft one', audience: 'draft' });
  assert.ok(pub.ok && fam.ok && dr.ok);
  const pubTitles = publicRecords(store.p).map((r) => r.title);
  assert.ok(pubTitles.includes('Public one'));
  assert.ok(!pubTitles.includes('Family one'));
  assert.ok(!pubTitles.includes('Draft one'));
  assert.deepEqual(restrictedRecords(store.p).map((r) => r.title).sort(), ['Family one', 'Learning Kueh in Mum’s Kitchen'].sort());
  assert.deepEqual(draftRecords(store.p).map((r) => r.title), ['Draft one']);
  assert.equal(allRecords(store.p).length, 6);
});

test('changing audience moves a record between lists immediately', () => {
  const { a, store } = fresh();
  completeM1(a); completeM2(a); completeM3(a);
  const r = a.submitContribution({ ...goodForm, audience: 'public' });
  assert.equal(publicRecords(store.p).some((x) => x.id === r.record.id), true);
  a.updateAudience(r.record.id, 'family');
  assert.equal(publicRecords(store.p).some((x) => x.id === r.record.id), false);
  assert.equal(restrictedRecords(store.p).some((x) => x.id === r.record.id), true);
  a.updateAudience(r.record.id, 'draft');
  assert.equal(restrictedRecords(store.p).some((x) => x.id === r.record.id), false);
  assert.equal(draftRecords(store.p).some((x) => x.id === r.record.id), true);
  assert.ok(a.deleteContribution(r.record.id));
  assert.equal(allRecords(store.p).some((x) => x.id === r.record.id), false);
});

test('contribution validation', () => {
  const { a } = fresh();
  completeM1(a); completeM2(a); completeM3(a);
  assert.equal(a.submitContribution({ ...goodForm, title: '' }).reason, 'invalid');
  assert.equal(a.submitContribution({ ...goodForm, story: '' }).reason, 'invalid');
  assert.equal(a.submitContribution({ ...goodForm, year: '', yearUnknown: false }).reason, 'invalid');
  assert.equal(a.submitContribution({ ...goodForm, year: '', yearUnknown: true }).ok, true);
  assert.equal(a.submitContribution({ ...goodForm, illus: 'dinner' }).reason, 'invalid');
  assert.equal(a.submitContribution({ ...goodForm, audience: 'everyone' }).reason, 'invalid');
  const r = a.submitContribution({ ...goodForm, story: 'Call me on 91234567' });
  assert.equal(r.reason, 'invalid'); assert.ok(r.errors.story);
});

test('sensitive-information nudge', () => {
  assert.ok(findSensitive('my nric is S1234567A'));
  assert.ok(findSensitive('call 9123 4567'));
  assert.ok(findSensitive('me@example.com'));
  assert.ok(findSensitive('postal 123456'));
  assert.equal(findSensitive('We flew kites in 1998 at the field.'), null);
});

test('contribution count is capped', () => {
  const { a } = fresh();
  completeM1(a); completeM2(a); completeM3(a);
  for (let i = 0; i < 6; i++) assert.ok(a.submitContribution({ ...goodForm, title: `T${i}` }).ok);
  assert.equal(a.submitContribution(goodForm).reason, 'full');
});

test('objective and Aisha conversation follow progress', () => {
  const { a, store } = fresh();
  a.briefed();
  assert.equal(aishaTreeFor(store.p), 'aisha_hub');
  assert.match(objectiveFor(store.p), /Lim family home/);
  completeM1(a); completeM2(a); completeM3(a);
  assert.equal(aishaTreeFor(store.p), 'aisha_kiosk');
  assert.match(objectiveFor(store.p), /kiosk/);
  a.submitContribution(goodForm);
  assert.equal(aishaTreeFor(store.p), 'aisha_end');
  assert.match(objectiveFor(store.p), /Aisha/);
  a.endingSeen();
  assert.match(objectiveFor(store.p), /Explore freely/);
});

test('attention markers follow progress', () => {
  const { a, store } = fresh();
  assert.deepEqual(attentionIds(store.p), ['aisha']);
  a.briefed();
  assert.ok(attentionIds(store.p).includes('lim') && attentionIds(store.p).includes('salmah'));
  a.flag('m1', 'spokeLim');
  assert.ok(!attentionIds(store.p).includes('lim'));
  completeM1(a); completeM2(a); completeM3(a);
  assert.deepEqual(attentionIds(store.p), ['kiosk']);
  a.submitContribution(goodForm);
  assert.deepEqual(attentionIds(store.p), ['aisha']);
  a.endingSeen();
  assert.deepEqual(attentionIds(store.p), []);
});

test('persistence round trip and reset', () => {
  const { a, store, storage } = fresh();
  completeM1(a);
  const store2 = new GameStore(storage); store2.load('play');
  assert.equal(docCount(store2.p), 1);
  store.reset();
  assert.equal(docCount(store.p), 0);
  const store3 = new GameStore(storage); store3.load('play');
  assert.equal(docCount(store3.p), 0);
});

test('corrupted / hostile storage never crashes', () => {
  const bad = ['{not json', 'null', '42', '"str"', '[]', '{"v":1,"m1":"oops","m2":null,"m3":[],"contributions":"x"}',
    '{"v":999}', '{"v":1,"m1":{"done":true}}', '{"v":1,"contributions":[{"title":"x"},null,5,{"illus":"market","audience":"public","title":"ok","story":"ok"}]}',
    '{"v":1,"m2":{"deviName":"<script>","notes":["bogus","place"]}}'];
  for (const raw of bad) {
    const storage = createMemoryStorage();
    storage.setItem(`${STORAGE_PREFIX}.play`, raw);
    const store = new GameStore(storage);
    assert.doesNotThrow(() => store.load('play'), raw);
    assert.equal(typeof store.p.m1.done, 'boolean');
    assert.ok(Array.isArray(store.p.contributions));
  }
  // done without required fields is downgraded
  const p = sanitizeProgress({ v: 1, m1: { done: true } });
  assert.equal(p.m1.done, false);
  const p2 = sanitizeProgress({ v: 1, contributions: [{ title: 'x' }, { illus: 'market', audience: 'public', title: 'ok', story: 'ok' }] });
  assert.equal(p2.contributions.length, 1);
  const p3 = sanitizeProgress({ v: 1, m2: { deviName: '<script>', notes: ['bogus', 'place'] } });
  assert.equal(p3.m2.deviName, null);
  assert.deepEqual(p3.m2.notes, ['place']);
});

test('storage that throws is survivable', () => {
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); } };
  const store = new GameStore(throwing);
  assert.doesNotThrow(() => store.load('play'));
  assert.ok(store.loadWarning);
  const a = createActions(store, {});
  assert.doesNotThrow(() => a.flag('m1', 'spokeLim'));
  assert.equal(store.p.m1.spokeLim, true); // still works in memory
  assert.equal(store.persistent, false);
  assert.doesNotThrow(() => store.reset());
  assert.doesNotThrow(() => store.resetAll());
  assert.deepEqual(loadSettings(throwing, true), { muted: false, reducedMotion: true });
  const { persistent } = getBrowserStorage(); // no localStorage in Node
  assert.equal(persistent, false);
});

test('presenter profile is separate and its staged missions are labelled', () => {
  const { storage, store, a } = fresh('play');
  completeM1(a);
  const pstore = new GameStore(storage); pstore.load('presenter');
  const pa = createActions(pstore, {});
  assert.equal(pstore.p.briefed, true);
  assert.equal(pstore.p.briefedStaged, true);
  assert.equal(docCount(pstore.p), 0, 'presenter mode starts with nothing completed');
  assert.equal(docCount(store.p), 1, 'play progress untouched');
  assert.equal(a.stageMission('m2'), false, 'staging is presenter-only');
  assert.ok(pa.stageMission('m1'));
  assert.equal(stagedCount(pstore.p), 1);
  assert.match(progressLabel(pstore.p), /1 staged for demo/);
  assert.match(publicRecords(pstore.p)[0].statusLabel, /staged for demo/);
  assert.equal(pa.stageMission('m1'), false); // not repeatable
  pa.stageMission('m2'); pa.stageMission('m3');
  assert.equal(docCount(pstore.p), 3);
  assert.ok(pa.submitContribution(goodForm).ok);
  pstore.reset();
  assert.equal(docCount(pstore.p), 0);
  assert.equal(pstore.p.briefed, true);
  // real play save is still intact
  const check = new GameStore(storage); check.load('play');
  assert.equal(docCount(check.p), 1);
});

test('resetAll clears both profiles but keeps settings', () => {
  const { storage, store, a } = fresh('play');
  completeM1(a);
  storage.setItem(`${STORAGE_PREFIX}.settings`, JSON.stringify({ muted: true, reducedMotion: true }));
  store.resetAll();
  const s = new GameStore(storage); s.load('play');
  assert.equal(docCount(s.p), 0);
  assert.deepEqual(loadSettings(storage), { muted: true, reducedMotion: true });
});

test('dialogue data: every route exists and nothing dangles', () => {
  for (const [treeId, tree] of Object.entries(DIALOGUES)) {
    assert.ok(tree.nodes[tree.start], `${treeId} start`);
    for (const [nodeId, node] of Object.entries(tree.nodes)) {
      assert.ok(node.speaker, `${treeId}.${nodeId} speaker`);
      assert.ok(node.text, `${treeId}.${nodeId} text`);
      if (node.next) assert.ok(tree.nodes[node.next], `${treeId}.${nodeId} -> ${node.next}`);
      if (node.choices) {
        assert.ok(node.choices.length >= 1 && node.choices.length <= 3, `${treeId}.${nodeId} has ${node.choices.length} choices`);
        for (const c of node.choices) {
          if (c.next) assert.ok(tree.nodes[c.next], `${treeId}.${nodeId} choice -> ${c.next}`);
        }
        assert.ok(!node.next, `${treeId}.${nodeId} has both next and choices`);
      }
      // every node must give the player a way forward or out
      assert.ok(node.next || node.choices || 'end' in node, `${treeId}.${nodeId} is a dead end without end marker`);
    }
  }
  for (const [id, item] of Object.entries(EXAMINE)) assert.ok(item.flag.length === 2, id);
});

test('scripted dialogue walk-through reaches every mission flag', () => {
  // Drive each tree's effects without any UI to prove the story can be completed by dialogue alone.
  const { a, store } = fresh();
  const run = (treeId, nodeIds) => {
    for (const id of nodeIds) {
      const node = DIALOGUES[treeId].nodes[id];
      assert.ok(node, `${treeId}.${id}`);
      node.effect?.(a);
    }
  };
  run('aisha_intro', ['a3']);
  run('lim', ['dinner', 'consent']);
  run('mei', ['mem', 'consent']);
  run('devi', ['mem', 'name']);
  run('rahman', ['mem', 'name']);
  assert.equal(store.p.briefed, true);
  assert.ok(store.p.m1.spokeLim && store.p.m1.spokeMei && store.p.m1.limConsent && store.p.m1.meiConsent);
  assert.ok(store.p.m2.spokeDevi && store.p.m2.spokeRahman && store.p.m2.deviName && store.p.m2.rahmanName);
  // Salmah: choose each branch through the actual choice effects
  const choose = DIALOGUES.salmah.nodes.choose;
  DIALOGUES.salmah.nodes.s2.effect(a);
  DIALOGUES.salmah.nodes.s3.effect(a);
  assert.ok(store.p.m3.spoke && store.p.m3.wishHeard);
  assert.ok(choose.choices.find((c) => c.badge), 'the permitted option is marked');
  choose.choices[0].effect(a); // public
  assert.equal(store.p.m3.done, false);
  choose.choices[2].effect(a); // do not save
  assert.equal(store.p.m3.done, false);
  choose.choices[1].effect(a); // family
  assert.equal(store.p.m3.done, true);
});


test('collision: player is pushed out of walls, bounds clamp, no tunnelling at game speed', () => {
  const c = new Colliders({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
  c.addSolid(-1, 1, -5.15, -4.85); // a 0.3 m thin wall across the way, like the real walls
  const pos = { x: 0, z: 0 };
  // walk north at 4.2 m/s in 1/60 s steps for 3 s: must never cross the wall
  for (let i = 0; i < 180; i++) { pos.z -= 4.2 / 60; c.resolve(pos, 0.34); }
  assert.ok(pos.z >= -4.85 + 0.34 - 1e-6, `stopped at ${pos.z}`);
  // even at the worst-case dt (0.05 s) it cannot pass
  const p2 = { x: 0, z: -4.0 };
  for (let i = 0; i < 40; i++) { p2.z -= 4.2 * 0.05; c.resolve(p2, 0.34); }
  assert.ok(p2.z >= -4.85 + 0.34 - 1e-6, `dt=0.05 stopped at ${p2.z}`);
  // spawn inside a box -> pushed to the nearest side
  const p3 = { x: 0.2, z: -5.0 };
  c.resolve(p3, 0.34);
  assert.ok(Math.abs(p3.z + 5) >= 0.15 + 0.34 - 1e-6);
  // out of bounds -> clamped
  const p4 = { x: 99, z: -99 };
  c.resolve(p4, 0.34);
  assert.deepEqual([p4.x, p4.z], [10, -10]);
  // sliding along a wall keeps the tangential motion
  const p5 = { x: -3, z: -4.4 };
  c.resolve(p5, 0.34);
  p5.x += 1; p5.z -= 0.5; // diagonal move into the (offset) wall
  c.resolve(p5, 0.34);
  assert.ok(p5.x > -3);
});

test('collision: camera ray is shortened by walls and ceilings', () => {
  const c = new Colliders(null);
  c.addSolid(-5, 5, 2, 2.3, { y0: 0, y1: 3 });                 // wall behind the player
  c.addSolid(-5, 5, -5, 5, { y0: 3.2, y1: 3.55, walk: false }); // ceiling
  const o = { x: 0, y: 1.5, z: 0 };
  assert.ok(Math.abs(c.camDistance(o, { x: 0, y: 0, z: 1 }, 5) - 2) < 1e-6);
  assert.equal(c.camDistance(o, { x: 0, y: 0, z: -1 }, 5), 5);
  const up = c.camDistance(o, { x: 0, y: 1, z: 0 }, 5);
  assert.ok(Math.abs(up - 1.7) < 1e-6, `ceiling hit at ${up}`);
  assert.equal(c.walk.length, 1, 'ceilings never block walking');
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); if (process.env.VERBOSE) console.log(e.stack); }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
