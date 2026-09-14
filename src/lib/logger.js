"use strict";

// In-memory ring buffer for debug entries. Pure and UI-agnostic: the plugin
// mirrors entries to the console and the settings panel subscribes for live view.
const LEVELS = ["debug", "info", "warn", "error"];

class DebugLog {
  constructor({ limit = 300 } = {}) {
    this.limit = Math.max(1, Number(limit) || 300);
    this.entries = [];
    this.seq = 0;
    this.listeners = new Set();
  }

  push(level, tag, message) {
    const entry = {
      level: LEVELS.includes(level) ? level : "info",
      message: String(message ?? ""),
      seq: this.seq + 1,
      tag: String(tag ?? ""),
      time: new Date().toISOString()
    };
    this.seq = entry.seq;
    this.entries.push(entry);
    while (this.entries.length > this.limit) this.entries.shift();
    for (const fn of [...this.listeners]) {
      try {
        fn(entry);
      } catch { /* listener must not break logging */ }
    }
    return entry;
  }

  debug(tag, message) { return this.push("debug", tag, message); }
  info(tag, message) { return this.push("info", tag, message); }
  warn(tag, message) { return this.push("warn", tag, message); }
  error(tag, message) { return this.push("error", tag, message); }

  getEntries() {
    return [...this.entries];
  }

  clear() {
    this.entries = [];
  }

  toText(limit = 120) {
    return this.entries
      .slice(-Math.max(1, limit))
      .map((e) => `[${e.time}] ${e.level.toUpperCase()} ${e.tag}: ${e.message}`)
      .join("\n");
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

module.exports = { DebugLog };
