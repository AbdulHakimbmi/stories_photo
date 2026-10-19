// =============================================================================
//  logic.js — game state, persistence and mission rules.
//  Pure JavaScript: no Three.js and no DOM, so it can be unit-tested in Node
//  (see scripts/logic-test.mjs, run with `npm test`).
// =============================================================================
import {
  MISSIONS,
  MISSION_IDS,
  AUDIENCES,
  AUDIENCE_IDS,
  ILLUSTRATIONS,
  SAMPLE_ILLUS,
  M1_DETAILS,
  M1_VERIFIED_NEEDED,
  M2_NOTES,
  M2_NOTES_NEEDED,
  RECORD_TEXT,
  EXAMINE,
} from '../data/content.js';

export const STORAGE_PREFIX = 'ourBlockOurStories.v1';
export const PROGRESS_VERSION = 1;
export const MAX_CONTRIBUTIONS = 6;

// ---------------------------------------------------------------------------
//  Default progress + validation of whatever is found in storage
// ---------------------------------------------------------------------------
export function defaultProgress() {
  return {
    v: PROGRESS_VERSION,
    started: false,
    introSeen: false,
    briefed: false,
    briefedStaged: false, // true when presenter mode skipped the briefing
    endingSeen: false,
    m1: {
      photo: false, pot: false, note: false,
      spokeLim: false, spokeMei: false, limConsent: false, meiConsent: false,
      details: [], recollections: null, sharing: null, sharingTries: 0,
      done: false, staged: false,
    },
    m2: {
      photo: false, spokeDevi: false, spokeRahman: false,
      deviName: null, rahmanName: null,
      perspectives: null, date: null, notes: [],
      done: false, staged: false,
    },
    m3: {
      spoke: false, wishHeard: false, triedPublic: false, triedNoSave: false,
      audience: null, done: false, staged: false,
    },
    contributions: [],
  };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const oneOf = (v, allowed, d) => (allowed.includes(v) ? v : d);
const strArr = (v, allowed) => (Array.isArray(v) ? [...new Set(v.filter((x) => allowed.includes(x)))] : []);
const clampStr = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

export function sanitizeContribution(c) {
  if (!isObj(c)) return null;
  const illus = SAMPLE_ILLUS.some((s) => s.key === c.illus) ? c.illus : null;
  const audience = AUDIENCE_IDS.includes(c.audience) ? c.audience : null;
  const title = clampStr(c.title, 60).trim();
  const story = clampStr(c.story, 400).trim();
  if (!illus || !audience || !title || !story) return null;
  return {
    id: clampStr(c.id, 40) || `c-${Math.random().toString(36).slice(2, 8)}`,
    illus,
    title,
    story,
    year: clampStr(c.year, 24).trim(),
    yearUnknown: bool(c.yearUnknown, false),
    people: clampStr(c.people, 80).trim(),
    audience,
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : 0,
  };
}

/** Merge untrusted stored data onto safe defaults. Never throws. */
export function sanitizeProgress(raw) {
  const d = defaultProgress();
  if (!isObj(raw) || raw.v !== PROGRESS_VERSION) return d;
  try {
    const out = d;
    for (const k of ['started', 'introSeen', 'briefed', 'briefedStaged', 'endingSeen']) out[k] = bool(raw[k], d[k]);

    const a = isObj(raw.m1) ? raw.m1 : {};
    for (const k of ['photo', 'pot', 'note', 'spokeLim', 'spokeMei', 'limConsent', 'meiConsent', 'done', 'staged']) {
      out.m1[k] = bool(a[k], false);
    }
    out.m1.details = strArr(a.details, M1_DETAILS.filter((x) => x.verified).map((x) => x.id));
    out.m1.recollections = oneOf(a.recollections, ['both'], null);
    out.m1.sharing = oneOf(a.sharing, ['public'], null);
    out.m1.sharingTries = Number.isFinite(a.sharingTries) ? Math.max(0, Math.min(99, a.sharingTries | 0)) : 0;

    const b = isObj(raw.m2) ? raw.m2 : {};
    for (const k of ['photo', 'spokeDevi', 'spokeRahman', 'done', 'staged']) out.m2[k] = bool(b[k], false);
    out.m2.deviName = oneOf(b.deviName, ['show', 'anonymous'], null);
    out.m2.rahmanName = oneOf(b.rahmanName, ['show', 'anonymous'], null);
    out.m2.perspectives = oneOf(b.perspectives, ['both'], null);
    out.m2.date = oneOf(b.date, ['uncertain'], null);
    out.m2.notes = strArr(b.notes, M2_NOTES.map((x) => x.id));

    const c = isObj(raw.m3) ? raw.m3 : {};
    for (const k of ['spoke', 'wishHeard', 'triedPublic', 'triedNoSave', 'done', 'staged']) out.m3[k] = bool(c[k], false);
    out.m3.audience = oneOf(c.audience, ['family'], null);

    out.contributions = Array.isArray(raw.contributions)
      ? raw.contributions.map(sanitizeContribution).filter(Boolean).slice(0, MAX_CONTRIBUTIONS)
      : [];

    // Consistency: a "done" mission must have its required fields, otherwise it is not done.
    if (out.m1.done && !(out.m1.details.length >= M1_VERIFIED_NEEDED && out.m1.recollections === 'both' && out.m1.sharing === 'public')) {
      out.m1.done = false;
    }
    if (out.m2.done && !(out.m2.perspectives === 'both' && out.m2.date === 'uncertain' && out.m2.notes.length >= M2_NOTES_NEEDED && out.m2.deviName && out.m2.rahmanName)) {
      out.m2.done = false;
    }
    if (out.m3.done && out.m3.audience !== 'family') out.m3.done = false;
    return out;
  } catch (e) {
    return defaultProgress();
  }
}

// ---------------------------------------------------------------------------
//  Storage helpers (localStorage can be missing, blocked or full — never crash)
// ---------------------------------------------------------------------------
export function createMemoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

export function getBrowserStorage() {
  try {
    const s = globalThis.localStorage;
    const probe = `${STORAGE_PREFIX}.probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return { storage: s, persistent: true };
  } catch (e) {
    return { storage: createMemoryStorage(), persistent: false };
  }
}

export function loadSettings(storage, prefersReducedMotion = false) {
  const d = { muted: false, reducedMotion: !!prefersReducedMotion };
  try {
    const raw = storage.getItem(`${STORAGE_PREFIX}.settings`);
    if (!raw) return d;
    const s = JSON.parse(raw);
    if (!isObj(s)) return d;
    return { muted: bool(s.muted, d.muted), reducedMotion: bool(s.reducedMotion, d.reducedMotion) };
  } catch (e) {
    return d;
  }
}

export function saveSettings(storage, settings) {
  try {
    storage.setItem(`${STORAGE_PREFIX}.settings`, JSON.stringify(settings));
    return true;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------------------
//  The store: holds one progress object per profile ("play" or "presenter").
//  Presenter mode has its OWN save slot, so it can never overwrite real progress.
// ---------------------------------------------------------------------------
export class GameStore {
  constructor(storage, { persistent = true } = {}) {
    this.storage = storage;
    this.persistent = persistent;
    this.profile = 'play';
    this.p = defaultProgress();
    this.loadWarning = null;
    this.listeners = new Set();
  }

  key(profile = this.profile) { return `${STORAGE_PREFIX}.${profile}`; }

  load(profile = this.profile) {
    this.profile = profile;
    this.loadWarning = null;
    let raw = null;
    try {
      raw = this.storage.getItem(this.key());
    } catch (e) {
      this.persistent = false;
      this.loadWarning = 'Saved progress could not be read in this browser.';
    }
    if (raw) {
      try {
        this.p = sanitizeProgress(JSON.parse(raw));
      } catch (e) {
        this.p = defaultProgress();
        this.loadWarning = 'Saved progress was unreadable, so the demo started fresh.';
      }
    } else {
      this.p = defaultProgress();
    }
    if (profile === 'presenter') this.ensurePresenterReady();
    this.emit();
    return this.p;
  }

  /** Presenter mode: briefing is skipped (and labelled as staged); no mission is completed. */
  ensurePresenterReady() {
    const p = this.p;
    if (!p.briefed) { p.briefed = true; p.briefedStaged = true; }
    p.started = true;
    p.introSeen = true;
  }

  save() {
    try {
      this.storage.setItem(this.key(), JSON.stringify(this.p));
      return true;
    } catch (e) {
      this.persistent = false;
      return false;
    }
  }

  commit(fn) {
    fn(this.p);
    this.save();
    this.emit();
  }

  /** Clear the current profile back to a fresh state. */
  reset() {
    this.p = defaultProgress();
    if (this.profile === 'presenter') this.ensurePresenterReady();
    try { this.storage.removeItem(this.key()); } catch (e) { /* ignore */ }
    this.save();
    this.emit();
  }

  /** Clear BOTH profiles (title-screen "Reset progress"). Settings are kept. */
  resetAll() {
    for (const profile of ['play', 'presenter']) {
      try { this.storage.removeItem(this.key(profile)); } catch (e) { /* ignore */ }
    }
    this.p = defaultProgress();
    if (this.profile === 'presenter') this.ensurePresenterReady();
    this.emit();
  }

  hasProgress(profile = 'play') {
    try { return !!this.storage.getItem(this.key(profile)); } catch (e) { return false; }
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of [...this.listeners]) {
      try { fn(this.p); } catch (e) { console.error(e); }
    }
  }
}

// ---------------------------------------------------------------------------
//  Selectors (read-only helpers)
// ---------------------------------------------------------------------------
export const docCount = (p) => MISSION_IDS.filter((m) => p[m].done).length;
export const stagedCount = (p) => MISSION_IDS.filter((m) => p[m].done && p[m].staged).length;
export const playerDocCount = (p) => docCount(p) - stagedCount(p);

export function progressLabel(p) {
  const n = docCount(p);
  const s = stagedCount(p);
  return `Stories documented: ${n} of 3${s ? ` (${s} staged for demo)` : ''}`;
}

export function missionStatus(p, id) {
  const m = p[id];
  if (m.done) return m.staged ? 'staged' : 'documented';
  const touched =
    id === 'm1' ? m.photo || m.pot || m.note || m.spokeLim || m.spokeMei
    : id === 'm2' ? m.photo || m.spokeDevi || m.spokeRahman
    : m.spoke;
  return touched ? 'in-progress' : 'undiscovered';
}

export const STATUS_LABEL = {
  undiscovered: 'Not yet discovered',
  'in-progress': 'In progress — needs documenting',
  documented: 'Documented',
  staged: 'Documented — staged for demo (not completed by player)',
};

export function nameDisplay(choice, fullName, anon = 'a neighbour') {
  return choice === 'show' ? fullName : anon;
}

/** Build the display record for a finished mission (null until it is done). */
export function missionRecord(p, id) {
  const m = p[id];
  if (!m.done) return null;
  const t = RECORD_TEXT[id];
  const status = m.staged ? STATUS_LABEL.staged : STATUS_LABEL.documented;
  if (id === 'm1') {
    return {
      id, origin: 'mission', missionId: id, title: t.title, illus: t.illus,
      contributors: t.contributors, dateLabel: t.dateLabel, story: t.story,
      perspectives: t.perspectives,
      details: M1_DETAILS.filter((d) => m.details.includes(d.id)).map((d) => `${d.text} (${d.source})`),
      notes: [],
      sharing: 'public', sharingLabel: t.sharingNote, statusLabel: status, staged: m.staged,
    };
  }
  if (id === 'm2') {
    const devi = nameDisplay(m.deviName, 'Madam Devi');
    const rahman = nameDisplay(m.rahmanName, 'Mr Rahman');
    return {
      id, origin: 'mission', missionId: id, title: t.title, illus: t.illus,
      contributors: `${devi} and ${rahman}`,
      dateLabel: t.dateLabel, story: t.story,
      perspectives: [
        { who: devi, text: 'A celebration! Everyone brought a dish and lined them along the corridor. The children ran up and down with paper lanterns, somebody’s radio was playing, and we danced a little.' },
        { who: rahman, text: 'The day the corridor looked after a family. People came with food, sat with them and took turns minding the little ones. What I remember is people showing up.' },
      ],
      details: [],
      notes: M2_NOTES.filter((n) => m.notes.includes(n.id)).map((n) => n.text.replace('Madam Devi', devi).replace('Mr Rahman', rahman)),
      sharing: 'public', sharingLabel: t.sharingNote, statusLabel: status, staged: m.staged,
    };
  }
  return {
    id, origin: 'mission', missionId: id, title: t.title, illus: t.illus,
    contributors: t.contributors, dateLabel: t.dateLabel, story: t.story,
    perspectives: [],
    details: [], notes: [],
    sharing: 'family', sharingLabel: t.sharingNote, statusLabel: status, staged: m.staged,
  };
}

export function contributionToRecord(c) {
  const a = AUDIENCES[c.audience];
  const statusLabel =
    c.audience === 'public' ? 'Contributed — public (demo)'
    : c.audience === 'family' ? 'Contributed — family-only (demo)'
    : 'Private draft — not shared';
  return {
    id: c.id, origin: 'contribution', title: c.title, illus: c.illus,
    contributors: c.people ? c.people : 'You (sample contribution)',
    dateLabel: c.yearUnknown ? 'Date unknown' : `Approximate year: ${c.year}`,
    story: c.story, perspectives: [], details: [], notes: [],
    sharing: c.audience, sharingLabel: a.help, statusLabel, staged: false,
  };
}

export function allRecords(p) {
  const out = [];
  for (const id of MISSION_IDS) {
    const r = missionRecord(p, id);
    if (r) out.push(r);
  }
  for (const c of p.contributions) out.push(contributionToRecord(c));
  return out;
}

// These three lists are the ONLY source for the board, the restricted list and drafts.
// The 3D board draws publicRecords() and nothing else.
export const publicRecords = (p) => allRecords(p).filter((r) => r.sharing === 'public');
export const restrictedRecords = (p) => allRecords(p).filter((r) => r.sharing === 'family');
export const draftRecords = (p) => allRecords(p).filter((r) => r.sharing === 'draft');

export const canContribute = (p) => docCount(p) >= 3;

/** Which Aisha conversation applies right now? */
export function aishaTreeFor(p) {
  if (!p.briefed) return 'aisha_intro';
  if (p.contributions.length > 0) return 'aisha_end';
  if (docCount(p) >= 3) return 'aisha_kiosk';
  return 'aisha_hub';
}

function missionObjective(p, id) {
  const m = p[id];
  if (id === 'm1') {
    if (missionStatus(p, 'm1') === 'undiscovered') return 'Visit the Lim family home (the open door along the corridor).';
    if (!m.spokeLim || !m.spokeMei) return 'In the Lim home, speak with both Uncle Lim and Mei.';
    if (!m.photo) return 'Examine the photograph on the sideboard.';
    return 'Open your journal (J) and document the dinner.';
  }
  if (id === 'm2') {
    if (missionStatus(p, 'm2') === 'undiscovered') return 'Find the old photograph on the corridor wall and the neighbours near the bench.';
    if (!m.photo) return 'Examine the old photograph on the corridor wall.';
    if (!m.spokeDevi || !m.spokeRahman) return 'Hear both Madam Devi’s and Mr Rahman’s accounts.';
    if (!m.deviName || !m.rahmanName) return 'Ask each neighbour whether they want their name shown.';
    return 'Open your journal (J) and document the corridor gathering.';
  }
  if (missionStatus(p, 'm3') === 'undiscovered') return 'Visit Auntie Salmah at the quiet corner, past the end of the corridor.';
  return 'Listen to Auntie Salmah and choose how her memory is kept.';
}

export function objectiveFor(p) {
  if (!p.briefed) return 'Talk to Aisha in the void deck.';
  const next = MISSION_IDS.find((id) => !p[id].done);
  if (next) {
    // prefer a mission already in progress
    const inProg = MISSION_IDS.find((id) => !p[id].done && missionStatus(p, id) === 'in-progress');
    return missionObjective(p, inProg || next);
  }
  if (p.contributions.length === 0) return 'Use the kiosk in the void deck to contribute a sample memory.';
  if (!p.endingSeen) return 'Return to Aisha.';
  return 'Explore freely, view the archive, or talk to Aisha to see your summary again.';
}


/** Which interactables should show the little floating marker ("something to do here")? */
export function attentionIds(p) {
  if (!p.briefed) return ['aisha'];
  const ids = [];
  if (!p.m1.done) {
    if (!p.m1.spokeLim) ids.push('lim');
    if (!p.m1.spokeMei) ids.push('mei');
    if (!p.m1.photo) ids.push('m1_photo');
    if (!p.m1.pot) ids.push('m1_pot');
    if (!p.m1.note) ids.push('m1_note');
  }
  if (!p.m2.done) {
    if (!p.m2.spokeDevi || !p.m2.deviName) ids.push('devi');
    if (!p.m2.spokeRahman || !p.m2.rahmanName) ids.push('rahman');
    if (!p.m2.photo) ids.push('m2_photo');
  }
  if (!p.m3.done) ids.push('salmah');
  if (docCount(p) >= 3 && p.contributions.length === 0) ids.push('kiosk');
  if (p.contributions.length > 0 && !p.endingSeen) ids.push('aisha');
  return ids;
}

export const getRecordById = (p, id) => allRecords(p).find((r) => r.id === id) || null;

// ---------------------------------------------------------------------------
//  Sensitive-info prompt for the demo form (a nudge, not a security feature)
// ---------------------------------------------------------------------------
const SENSITIVE = [
  { re: /\b[STFGM]\d{7}[A-Z]\b/i, what: 'an ID number' },
  { re: /(?:\+?65[\s-]?)?\b[3689]\d{3}[\s-]?\d{4}\b/, what: 'a phone number' },
  { re: /\S+@\S+\.\S+/, what: 'an email address' },
  { re: /\b\d{6}\b/, what: 'a postal code' },
];
export function findSensitive(text) {
  for (const s of SENSITIVE) if (s.re.test(text)) return s.what;
  return null;
}

// ---------------------------------------------------------------------------
//  Actions: every state change goes through here. Hooks let the UI play sounds/toasts.
// ---------------------------------------------------------------------------
export function createActions(store, hooks = {}) {
  const toast = hooks.toast || (() => {});
  const sfx = hooks.sfx || (() => {});
  const P = () => store.p;

  const a = {
    store,
    get p() { return store.p; },

    briefed() {
      if (P().briefed) return;
      store.commit((p) => { p.briefed = true; });
      sfx('chime');
      toast('Aisha has briefed you. Three stories to document.');
    },
    markIntroSeen() { store.commit((p) => { p.introSeen = true; p.started = true; }); },
    endingSeen() { if (!P().endingSeen) store.commit((p) => { p.endingSeen = true; }); },

    /** Generic dialogue/examine flag. Returns true the first time it flips. */
    flag(mission, key, value = true) {
      const m = P()[mission];
      if (!m || !(key in m) || m[key] === value) return false;
      store.commit((p) => { p[mission][key] = value; });
      return true;
    },

    /** Examine an item. Returns {first:boolean, item} */
    examine(itemId) {
      const item = EXAMINE[itemId];
      if (!item) return { first: false, item: null };
      const [m, key] = item.flag;
      const first = a.flag(m, key, true);
      if (first) sfx('chime');
      return { first, item };
    },

    setName(who, choice) {
      if (!['devi', 'rahman'].includes(who) || !['show', 'anonymous'].includes(choice)) return false;
      const key = who === 'devi' ? 'deviName' : 'rahmanName';
      if (P().m2[key] === choice) return false;
      store.commit((p) => { p.m2[key] = choice; });
      sfx('chime');
      toast(choice === 'show' ? 'Name preference noted: name shown.' : 'Name preference noted: shown as “a neighbour”.');
      return true;
    },

    // ----- Mission 1 journal steps
    attachDetail(id) {
      const d = M1_DETAILS.find((x) => x.id === id);
      if (!d) return { ok: false, reason: 'unknown' };
      if (P().m1.done) return { ok: false, reason: 'locked', message: 'This record is already documented.' };
      if (!d.needs(P())) return { ok: false, reason: 'needs', message: d.needsHint };
      if (!d.verified) {
        sfx('soft');
        return { ok: false, reason: 'unverified', message: 'Nobody who was there confirmed this. Leave it out unless a contributor confirms it.' };
      }
      const has = P().m1.details.includes(id);
      store.commit((p) => {
        p.m1.details = has ? p.m1.details.filter((x) => x !== id) : [...p.m1.details, id];
      });
      return { ok: true, attached: !has };
    },

    chooseRecollection(opt) {
      const m = P().m1;
      if (m.done) return { ok: false, reason: 'locked' };
      if (!(m.spokeLim && m.spokeMei)) return { ok: false, reason: 'needs', message: 'Talk to both Uncle Lim and Mei first.' };
      if (opt !== 'both') {
        sfx('soft');
        return {
          ok: false, reason: 'one-sided',
          message: 'Neither of them asked for their account to be left out. Uncle Lim remembers the rice; Mei remembers the talking. The archive can hold both.',
        };
      }
      store.commit((p) => { p.m1.recollections = 'both'; });
      sfx('chime');
      return { ok: true };
    },

    chooseSharingM1(opt) {
      const m = P().m1;
      if (m.done) return { ok: false, reason: 'locked' };
      if (!(m.limConsent && m.meiConsent)) {
        sfx('soft');
        return { ok: false, reason: 'ask-first', message: 'You haven’t asked both contributors yet. Ask Uncle Lim and Mei whether they are happy for this to be shared.' };
      }
      if (opt !== 'public') {
        store.commit((p) => { p.m1.sharingTries += 1; });
        sfx('soft');
        return {
          ok: false, reason: 'mismatch',
          message: 'That isn’t what they agreed. Uncle Lim and Mei both said the neighbourhood board is fine — first names only, no address. You can correct your choice.',
        };
      }
      store.commit((p) => { p.m1.sharing = 'public'; });
      sfx('chime');
      return { ok: true };
    },

    // ----- Mission 2 journal steps
    keepPerspectives(opt) {
      const m = P().m2;
      if (m.done) return { ok: false, reason: 'locked' };
      if (!(m.spokeDevi && m.spokeRahman)) return { ok: false, reason: 'needs', message: 'Hear both neighbours first.' };
      if (opt !== 'both') {
        sfx('soft');
        return {
          ok: false, reason: 'one-sided',
          message: 'These accounts don’t cancel each other out. Madam Devi describes the mood; Mr Rahman describes what neighbours did. Both belong in the record.',
        };
      }
      store.commit((p) => { p.m2.perspectives = 'both'; });
      sfx('chime');
      return { ok: true };
    },

    chooseDate(opt) {
      const m = P().m2;
      if (m.done) return { ok: false, reason: 'locked' };
      if (opt !== 'uncertain') {
        sfx('soft');
        return {
          ok: false, reason: 'guess',
          message: 'Neither neighbour could give a date. Writing a guess would make it look like a fact, so the record should say the date is uncertain.',
        };
      }
      store.commit((p) => { p.m2.date = 'uncertain'; });
      sfx('chime');
      return { ok: true };
    },

    toggleNote(id) {
      const n = M2_NOTES.find((x) => x.id === id);
      if (!n) return { ok: false, reason: 'unknown' };
      if (P().m2.done) return { ok: false, reason: 'locked' };
      if (!n.needs(P())) return { ok: false, reason: 'needs', message: n.needsHint };
      const has = P().m2.notes.includes(id);
      store.commit((p) => {
        p.m2.notes = has ? p.m2.notes.filter((x) => x !== id) : [...p.m2.notes, id];
      });
      return { ok: true, added: !has };
    },

    // ----- Mission 3 (conversation choice)
    m3Try(opt) {
      const m = P().m3;
      if (m.done) return { ok: true, reason: 'already' };
      if (opt === 'family') {
        store.commit((p) => { p.m3.audience = 'family'; p.m3.done = true; });
        sfx('chime');
        toast('Saved as family-only. It will appear in the restricted list, not on the board.');
        return { ok: true, firstTime: true };
      }
      store.commit((p) => {
        if (opt === 'public') p.m3.triedPublic = true;
        if (opt === 'nosave') p.m3.triedNoSave = true;
      });
      sfx('soft');
      return { ok: false, reason: opt === 'public' ? 'conflicts' : 'loses-memory' };
    },

    // ----- Finalising missions 1 and 2 (journal "Save" button)
    missingFor(mission) {
      const p = P();
      const miss = [];
      if (mission === 'm1') {
        if (p.m1.details.length < M1_VERIFIED_NEEDED) miss.push(`Attach ${M1_VERIFIED_NEEDED} verified details`);
        if (p.m1.recollections !== 'both') miss.push('Keep both recollections');
        if (p.m1.sharing !== 'public') miss.push('Choose the sharing the contributors agreed to');
      } else if (mission === 'm2') {
        if (p.m2.perspectives !== 'both') miss.push('Keep both perspectives');
        if (p.m2.date !== 'uncertain') miss.push('Mark the date as uncertain');
        if (p.m2.notes.length < M2_NOTES_NEEDED) miss.push(`Add ${M2_NOTES_NEEDED} context notes`);
        if (!p.m2.deviName || !p.m2.rahmanName) miss.push('Ask both neighbours about name display');
      } else {
        if (!p.m3.done) miss.push('Talk to Auntie Salmah and choose how her memory is kept');
      }
      return miss;
    },

    finalize(mission) {
      if (!['m1', 'm2'].includes(mission)) return { ok: false, reason: 'not-journal' };
      if (P()[mission].done) return { ok: false, reason: 'already' }; // no repeated rewards
      const missing = a.missingFor(mission);
      if (missing.length) return { ok: false, reason: 'incomplete', missing };
      store.commit((p) => { p[mission].done = true; p[mission].staged = false; });
      sfx('chime');
      toast(`${MISSIONS[mission].title}: documented. ${progressLabel(P())}.`);
      return { ok: true, firstTime: true };
    },

    // ----- Final activity
    validateContribution(form) {
      const errors = {};
      const title = (form.title || '').trim();
      const story = (form.story || '').trim();
      const year = (form.year || '').trim();
      const people = (form.people || '').trim();
      if (!SAMPLE_ILLUS.some((s) => s.key === form.illus)) errors.illus = 'Choose one of the three sample illustrations.';
      if (!title) errors.title = 'Add a short title.';
      else if (title.length > 60) errors.title = 'Keep the title under 60 characters.';
      if (!story) errors.story = 'Add a short story.';
      else if (story.length > 400) errors.story = 'Keep the story under 400 characters.';
      if (!form.yearUnknown && !year) errors.year = 'Add an approximate year, or tick “Date unknown”.';
      else if (year.length > 24) errors.year = 'Keep the year short (for example “around 1990s”).';
      if (people.length > 80) errors.people = 'Keep the list of people under 80 characters.';
      if (!AUDIENCE_IDS.includes(form.audience)) errors.audience = 'Choose who the memory is for.';
      for (const [field, text] of [['title', title], ['story', story], ['people', people], ['year', year]]) {
        if (!errors[field]) {
          const hit = findSensitive(text);
          if (hit) errors[field] = `This looks like it may contain ${hit}. This is a demo — please remove it.`;
        }
      }
      return errors;
    },

    submitContribution(form) {
      if (!canContribute(P())) return { ok: false, reason: 'locked' };
      if (P().contributions.length >= MAX_CONTRIBUTIONS) return { ok: false, reason: 'full' };
      const errors = a.validateContribution(form);
      if (Object.keys(errors).length) return { ok: false, reason: 'invalid', errors };
      const c = sanitizeContribution({
        id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        illus: form.illus, title: form.title, story: form.story,
        year: form.year, yearUnknown: !!form.yearUnknown, people: form.people,
        audience: form.audience, createdAt: Date.now(),
      });
      if (!c) return { ok: false, reason: 'invalid', errors: { title: 'Something was missing.' } };
      store.commit((p) => { p.contributions.push(c); });
      sfx('chime');
      return { ok: true, record: contributionToRecord(c) };
    },

    updateAudience(id, audience) {
      if (!AUDIENCE_IDS.includes(audience)) return false;
      const c = P().contributions.find((x) => x.id === id);
      if (!c || c.audience === audience) return false;
      store.commit(() => { c.audience = audience; });
      return true;
    },

    deleteContribution(id) {
      if (!P().contributions.some((x) => x.id === id)) return false;
      store.commit((p) => { p.contributions = p.contributions.filter((x) => x.id !== id); });
      return true;
    },

    // ----- Presenter mode only: clearly labelled as staged, never "completed by the player"
    stageMission(mission) {
      if (store.profile !== 'presenter') return false;
      if (!MISSION_IDS.includes(mission) || P()[mission].done) return false;
      store.commit((p) => {
        if (mission === 'm1') {
          Object.assign(p.m1, {
            photo: true, pot: true, note: true, spokeLim: true, spokeMei: true, limConsent: true, meiConsent: true,
            details: ['table', 'burnt'], recollections: 'both', sharing: 'public', done: true, staged: true,
          });
        } else if (mission === 'm2') {
          Object.assign(p.m2, {
            photo: true, spokeDevi: true, spokeRahman: true, deviName: 'show', rahmanName: 'anonymous',
            perspectives: 'both', date: 'uncertain', notes: ['place', 'devi'], done: true, staged: true,
          });
        } else {
          Object.assign(p.m3, { spoke: true, wishHeard: true, audience: 'family', done: true, staged: true });
        }
      });
      sfx('chime');
      return true;
    },
  };
  return a;
}
