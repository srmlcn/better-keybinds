"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { DebugLog } = require("../src/lib/logger");

describe("DebugLog", () => {
  it("assigns sequences and keeps entries", () => {
    const log = new DebugLog();
    log.info("a", "first");
    log.warn("b", "second");
    const entries = log.getEntries();
    assert.equal(entries.length, 2);
    assert.equal(entries[0].seq, 1);
    assert.equal(entries[1].level, "warn");
    assert.ok(entries[0].time);
  });
  it("evicts oldest beyond limit", () => {
    const log = new DebugLog({ limit: 3 });
    for (let i = 0; i < 5; i++) log.info("t", `m${i}`);
    const entries = log.getEntries();
    assert.equal(entries.length, 3);
    assert.equal(entries[0].message, "m2");
    assert.equal(entries[2].seq, 5);
  });
  it("notifies subscribers and supports unsubscribe", () => {
    const log = new DebugLog();
    const seen = [];
    const unsub = log.subscribe((e) => seen.push(e.message));
    log.info("t", "hi");
    unsub();
    log.info("t", "bye");
    assert.deepEqual(seen, ["hi"]);
  });
  it("survives throwing listeners", () => {
    const log = new DebugLog();
    log.subscribe(() => { throw new Error("boom"); });
    assert.doesNotThrow(() => log.info("t", "x"));
  });
  it("formats tail text and clears", () => {
    const log = new DebugLog();
    log.error("net", "down");
    const text = log.toText();
    assert.match(text, /ERROR net: down/);
    log.clear();
    assert.equal(log.toText(), "");
  });
});
