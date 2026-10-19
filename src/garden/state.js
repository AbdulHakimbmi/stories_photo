// =============================================================================
//  state.js — the garden's public state on the game side. No DOM, no Three.js.
//  Everything that arrives (a snapshot or a live event) goes through here, and every operation
//  is idempotent: receiving the same event twice, or a snapshot after a reconnect, never creates
//  a duplicate memory (the key is the memory id).
// =============================================================================
import { AREA_IDS, ACTIVITY } from '../data/content.js';

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const int = (v) => (Number.isInteger(v) ? v : null);

export function normalizeResponse(r) {
  if (!r || typeof r !== 'object' || typeof r.id !== 'string') return null;
  return { id: str(r.id, 64), name: str(r.name, 40), text: str(r.text, 400), approvedAt: int(r.approvedAt) };
}

/** Defensive copy of a memory coming over the network (or from the demo set). */
export function normalizeMemory(m) {
  if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !AREA_IDS.includes(m.category)) return null;
  const seen = new Set();
  const responses = [];
  for (const r of Array.isArray(m.responses) ? m.responses : []) {
    const n = normalizeResponse(r);
    if (n && !seen.has(n.id)) { seen.add(n.id); responses.push(n); }
  }
  return {
    id: str(m.id, 64),
    title: str(m.title, 80),
    story: str(m.story, 800),
    name: str(m.name, 40),
    year: int(m.year),
    yearUnknown: !!m.yearUnknown,
    category: m.category,
    slot: int(m.slot) !== null && m.slot >= 0 ? m.slot : 0,
    width: Number(m.width) > 0 ? Number(m.width) : 4,
    height: Number(m.height) > 0 ? Number(m.height) : 3,
    approvedAt: int(m.approvedAt),
    fictional: !!m.fictional,
    illus: typeof m.illus === 'string' ? m.illus : null,
    responses,
  };
}

const sameMemory = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export class GardenState {
  constructor() {
    this.memories = new Map();
    this.meta = { name: '', locked: false, ended: false };
    this.subs = new Set();
  }

  subscribe(fn) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }
  emit(change) { for (const fn of [...this.subs]) fn(change); }

  get list() {
    return [...this.memories.values()].sort((a, b) => (a.approvedAt ?? 0) - (b.approvedAt ?? 0) || a.id.localeCompare(b.id));
  }
  get(id) { return this.memories.get(id) || null; }
  byCategory(category) { return this.list.filter((m) => m.category === category); }

  /** Replace everything with a server snapshot. Returns what changed. */
  replaceAll(snapshot) {
    const incoming = new Map();
    for (const raw of (snapshot && snapshot.memories) || []) {
      const m = normalizeMemory(raw);
      if (m) incoming.set(m.id, m);
    }
    const change = { added: [], removed: [], updated: [], meta: false, snapshot: true };
    for (const id of this.memories.keys()) if (!incoming.has(id)) change.removed.push(id);
    for (const [id, m] of incoming) {
      const old = this.memories.get(id);
      if (!old) change.added.push(id);
      else if (!sameMemory(old, m)) change.updated.push(id);
    }
    this.memories = incoming;
    if (snapshot && snapshot.session) change.meta = this.patchMeta(snapshot.session, false);
    this.emit(change);
    return change;
  }

  patchMeta(patch, emit = true) {
    let changed = false;
    for (const k of ['name', 'locked', 'ended']) {
      if (patch && k in patch) {
        const v = k === 'name' ? str(patch[k], 60) : !!patch[k];
        if (this.meta[k] !== v) { this.meta[k] = v; changed = true; }
      }
    }
    if (changed && emit) this.emit({ added: [], removed: [], updated: [], meta: true });
    return changed;
  }

  upsertMemory(raw) {
    const m = normalizeMemory(raw);
    if (!m) return 'ignored';
    const old = this.memories.get(m.id);
    if (old && sameMemory(old, m)) return 'same';
    this.memories.set(m.id, m);
    this.emit({ added: old ? [] : [m.id], removed: [], updated: old ? [m.id] : [], meta: false });
    return old ? 'updated' : 'added';
  }

  removeMemory(id) {
    if (!this.memories.delete(id)) return 'same';
    this.emit({ added: [], removed: [id], updated: [], meta: false });
    return 'removed';
  }

  upsertResponse(memoryId, raw) {
    const m = this.memories.get(memoryId);
    const r = normalizeResponse(raw);
    if (!m || !r) return 'ignored';
    const i = m.responses.findIndex((x) => x.id === r.id);
    if (i >= 0) {
      if (JSON.stringify(m.responses[i]) === JSON.stringify(r)) return 'same';
      m.responses[i] = r;
    } else {
      m.responses.push(r);
    }
    this.emit({ added: [], removed: [], updated: [memoryId], meta: false, newResponse: i < 0 ? r.id : null });
    return i >= 0 ? 'updated' : 'added';
  }

  removeResponse(memoryId, id) {
    const m = this.memories.get(memoryId);
    if (!m) return 'same';
    const n = m.responses.length;
    m.responses = m.responses.filter((r) => r.id !== id);
    if (m.responses.length === n) return 'same';
    this.emit({ added: [], removed: [], updated: [memoryId], meta: false });
    return 'removed';
  }

  /** Apply one live event from the server. */
  applyEvent(name, data) {
    switch (name) {
      case 'memory:upsert': return this.upsertMemory(data && data.memory);
      case 'memory:remove': return this.removeMemory(data && data.id);
      case 'response:upsert': return this.upsertResponse(data && data.memoryId, data && data.response);
      case 'response:remove': return this.removeResponse(data && data.memoryId, data && data.id);
      case 'session:update': this.patchMeta(data || {}); return 'meta';
      case 'session:ended': this.patchMeta({ ended: true }); return 'meta';
      default: return 'ignored';
    }
  }

  clear() {
    const removed = [...this.memories.keys()];
    this.memories = new Map();
    this.emit({ added: [], removed, updated: [], meta: false, snapshot: true });
  }

  /** Progress of the optional collaborative activity — based only on approved memories. */
  progress() {
    const items = ACTIVITY.needs.map((n) => ({ ...n, done: this.byCategory(n.category).length > 0 }));
    return { items, complete: items.every((i) => i.done), count: items.filter((i) => i.done).length };
  }
}
