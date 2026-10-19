// =============================================================================
//  store.js — durable metadata in SQLite (Node's built-in node:sqlite module,
//  so there is nothing native to compile). Image files live on disk beside it.
//  Schema changes go through MIGRATIONS (tracked with PRAGMA user_version).
// =============================================================================
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = [
  // 1 — initial schema
  `
  CREATE TABLE sessions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    mode        TEXT NOT NULL DEFAULT 'live',
    join_token  TEXT NOT NULL UNIQUE,
    host_hash   TEXT NOT NULL UNIQUE,      -- SHA-256 of the host token; the token itself is never stored
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    locked      INTEGER NOT NULL DEFAULT 0,
    ended_at    INTEGER
  );
  CREATE TABLE memories (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    story        TEXT NOT NULL,
    author       TEXT,
    year         INTEGER,
    year_unknown INTEGER NOT NULL DEFAULT 0,
    category     TEXT NOT NULL,
    display_file TEXT,
    thumb_file   TEXT,
    width        INTEGER,
    height       INTEGER,
    status       TEXT NOT NULL,            -- pending | approved | hidden | removed
    slot         INTEGER,
    manage_hash  TEXT NOT NULL,            -- SHA-256 of the contributor's private management token
    created_at   INTEGER NOT NULL,
    approved_at  INTEGER
  );
  CREATE INDEX idx_memories_session ON memories(session_id, status);
  CREATE UNIQUE INDEX idx_memories_manage ON memories(manage_hash);
  CREATE TABLE responses (
    id          TEXT PRIMARY KEY,
    memory_id   TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    author      TEXT,
    text        TEXT NOT NULL,
    status      TEXT NOT NULL,             -- pending | approved | hidden | removed
    manage_hash TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    approved_at INTEGER
  );
  CREATE INDEX idx_responses_session ON responses(session_id, status);
  CREATE UNIQUE INDEX idx_responses_manage ON responses(manage_hash);
  `,
];

export function openStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const uploadsDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'garden.sqlite'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

  const version = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  const q = {
    insertSession: db.prepare('INSERT INTO sessions (id,name,mode,join_token,host_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?)'),
    sessionByJoin: db.prepare('SELECT * FROM sessions WHERE join_token = ?'),
    sessionByHost: db.prepare('SELECT * FROM sessions WHERE host_hash = ?'),
    sessionById: db.prepare('SELECT * FROM sessions WHERE id = ?'),
    allSessions: db.prepare('SELECT * FROM sessions ORDER BY created_at'),
    setLocked: db.prepare('UPDATE sessions SET locked = ? WHERE id = ?'),
    endSession: db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE id = ?'),
    insertMemory: db.prepare(`INSERT INTO memories
      (id,session_id,title,story,author,year,year_unknown,category,display_file,thumb_file,width,height,status,manage_hash,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
    memoryById: db.prepare('SELECT * FROM memories WHERE id = ?'),
    memoryByManage: db.prepare('SELECT * FROM memories WHERE manage_hash = ?'),
    memoriesBySession: db.prepare('SELECT * FROM memories WHERE session_id = ? ORDER BY created_at'),
    approveMemory: db.prepare("UPDATE memories SET status='approved', slot=?, approved_at=? WHERE id=?"),
    setMemoryStatus: db.prepare('UPDATE memories SET status=?, slot=NULL WHERE id=?'),
    removeMemory: db.prepare("UPDATE memories SET status='removed', title='', story='', author=NULL, year=NULL, display_file=NULL, thumb_file=NULL, slot=NULL WHERE id=?"),
    insertResponse: db.prepare('INSERT INTO responses (id,memory_id,session_id,author,text,status,manage_hash,created_at) VALUES (?,?,?,?,?,?,?,?)'),
    responseById: db.prepare('SELECT * FROM responses WHERE id = ?'),
    responseByManage: db.prepare('SELECT * FROM responses WHERE manage_hash = ?'),
    responsesBySession: db.prepare('SELECT * FROM responses WHERE session_id = ? ORDER BY created_at'),
    responsesByMemory: db.prepare('SELECT * FROM responses WHERE memory_id = ? ORDER BY created_at'),
    approveResponse: db.prepare("UPDATE responses SET status='approved', approved_at=? WHERE id=?"),
    setResponseStatus: db.prepare('UPDATE responses SET status=? WHERE id=?'),
    removeResponse: db.prepare("UPDATE responses SET status='removed', text='', author=NULL WHERE id=?"),
  };

  const tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  return {
    db,
    dataDir,
    uploadsDir,
    tx,
    close: () => db.close(),

    createSession: (s) => q.insertSession.run(s.id, s.name, s.mode || 'live', s.joinToken, s.hostHash, s.createdAt, s.expiresAt),
    sessionByJoin: (t) => q.sessionByJoin.get(t) || null,
    sessionByHost: (h) => q.sessionByHost.get(h) || null,
    sessionById: (id) => q.sessionById.get(id) || null,
    allSessions: () => q.allSessions.all(),
    setLocked: (id, locked) => q.setLocked.run(locked ? 1 : 0, id),
    endSession: (id, ts) => q.endSession.run(ts, id),
    deleteSession: (id) => q.deleteSession.run(id),

    insertMemory: (m) => q.insertMemory.run(m.id, m.sessionId, m.title, m.story, m.author, m.year, m.yearUnknown ? 1 : 0, m.category,
      m.displayFile, m.thumbFile, m.width, m.height, m.status, m.manageHash, m.createdAt),
    memory: (id) => q.memoryById.get(id) || null,
    memoryByManage: (h) => q.memoryByManage.get(h) || null,
    memories: (sessionId) => q.memoriesBySession.all(sessionId),
    approveMemory: (id, slot, ts) => q.approveMemory.run(slot, ts, id),
    setMemoryStatus: (id, status) => q.setMemoryStatus.run(status, id),
    removeMemory: (id) => q.removeMemory.run(id),

    insertResponse: (r) => q.insertResponse.run(r.id, r.memoryId, r.sessionId, r.author, r.text, r.status, r.manageHash, r.createdAt),
    response: (id) => q.responseById.get(id) || null,
    responseByManage: (h) => q.responseByManage.get(h) || null,
    responses: (sessionId) => q.responsesBySession.all(sessionId),
    responsesForMemory: (memoryId) => q.responsesByMemory.all(memoryId),
    approveResponse: (id, ts) => q.approveResponse.run(ts, id),
    setResponseStatus: (id, status) => q.setResponseStatus.run(status, id),
    removeResponse: (id) => q.removeResponse.run(id),
  };
}
