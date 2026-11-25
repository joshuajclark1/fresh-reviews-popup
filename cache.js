'use strict';

/**
 * TtlCache — tiny per-key TTL cache with in-memory storage plus best-effort
 * JSON file persistence, so a server restart does not immediately re-bill
 * Google for every place. Standard library only.
 *
 * Entries: { value, expiresAt }. Expired entries are pruned lazily on get()
 * and on load. Persistence failures are swallowed: caching is a cost
 * optimization, never a reason to fail a request.
 */

const fs = require('node:fs');
const path = require('node:path');

class TtlCache {
  constructor({ file, ttlMs }) {
    this.file = file || null;
    this.ttlMs = ttlMs;
    this.map = new Map();
    this.load();
  }

  load() {
    if (!this.file) return;
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const obj = JSON.parse(raw);
      for (const [key, entry] of Object.entries(obj)) {
        if (entry && typeof entry.expiresAt === 'number' && 'value' in entry) {
          this.map.set(key, entry);
        }
      }
    } catch (e) {
      // Missing or unreadable cache file: start empty.
    }
    this.prune();
  }

  prune() {
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (entry.expiresAt <= now) this.map.delete(key);
    }
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value) {
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    this.persist();
  }

  delete(key) {
    if (this.map.delete(key)) this.persist();
  }

  persist() {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const obj = {};
      for (const [key, entry] of this.map) obj[key] = entry;
      fs.writeFileSync(this.file, JSON.stringify(obj));
    } catch (e) {
      // Best effort only.
    }
  }
}

module.exports = { TtlCache };
