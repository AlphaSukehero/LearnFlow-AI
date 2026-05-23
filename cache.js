/**
 * cache.js — SQLite-backed LRU analysis cache for LearnFlow AI
 * Keyed by a hash of the input (URL or text), TTL = 7 days.
 */
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '.learnflow-cache.db');
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS analysis_cache (
        key       TEXT PRIMARY KEY,
        value     TEXT NOT NULL,
        created   INTEGER NOT NULL
      );
    `);
    // Prune expired entries on startup
    db.prepare('DELETE FROM analysis_cache WHERE created < ?').run(Date.now() - TTL_MS);
  }
  return db;
}

/**
 * Generate a stable cache key from URL or text body.
 */
function makeKey(body) {
  const raw = body.url ? `url:${body.url.trim()}` : `text:${(body.text || '').substring(0, 2000)}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function get(body) {
  try {
    const key = makeKey(body);
    const row = getDb().prepare('SELECT value, created FROM analysis_cache WHERE key = ?').get(key);
    if (!row) return null;
    if (Date.now() - row.created > TTL_MS) {
      getDb().prepare('DELETE FROM analysis_cache WHERE key = ?').run(key);
      return null;
    }
    return JSON.parse(row.value);
  } catch (e) {
    console.warn('[cache] get error:', e.message);
    return null;
  }
}

function set(body, value) {
  try {
    const key = makeKey(body);
    getDb().prepare(
      'INSERT OR REPLACE INTO analysis_cache (key, value, created) VALUES (?, ?, ?)'
    ).run(key, JSON.stringify(value), Date.now());
  } catch (e) {
    console.warn('[cache] set error:', e.message);
  }
}

module.exports = { get, set };
