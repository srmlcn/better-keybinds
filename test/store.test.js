"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { actionTypes } = require("../src/lib/actions");
const s = require("../src/lib/store");

const KNOWN = actionTypes();

describe("fresh state", () => {
  it("starts with no binds", () => {
    const state = s.freshState();
    assert.deepEqual(state.binds, []);
    assert.deepEqual(state.settings, { debugLogging: true, defaultGlobal: false, defaultToast: true });
  });
});

describe("sanitizeBind", () => {
  it("fills defaults and normalizes", () => {
    const clean = s.sanitizeBind({ keybind: ["ctrl", "k"], params: { a: 50, b: 100 }, type: "output.toggle" }, KNOWN);
    assert.deepEqual(clean.keybind, ["Control", "K"]);
    assert.equal(clean.enabled, true);
    assert.equal(clean.global, false);
    assert.equal(clean.toastOnRun, true);
    assert.ok(clean.id);
  });
  it("flags unknown actions without dropping them", () => {
    const clean = s.sanitizeBind({ params: {}, type: "future.thing" }, KNOWN);
    assert.equal(clean.unknown, true);
  });
  it("rejects non-objects and typeless binds", () => {
    assert.equal(s.sanitizeBind(null, KNOWN), null);
    assert.equal(s.sanitizeBind({ keybind: ["A"] }, KNOWN), null);
  });
});

describe("validateBind", () => {
  it("requires known type, valid params and keybind", () => {
    assert.deepEqual(s.validateBind({ keybind: ["F8"], params: { volume: 80 }, type: "output.set" }, KNOWN), []);
    const bad = s.validateBind({ keybind: [], params: { volume: 500 }, type: "output.set" }, KNOWN);
    assert.ok(bad.some((e) => e.includes("between")));
    assert.ok(bad.includes("No keybind assigned."));
    assert.ok(s.validateBind({ keybind: ["F8"], params: {}, type: "nope" }, KNOWN).some((e) => e.includes("Unknown")));
  });
});

describe("load/save with fake BdApi", () => {
  function fakeBdApi(seed) {
    const data = { ...(seed || {}) };
    return {
      Data: {
        load: (plugin, key) => data[`${plugin}:${key}`],
        save: (plugin, key, value) => { data[`${plugin}:${key}`] = value; }
      },
      peek: () => data
    };
  }
  it("seeds empty state on first run", () => {
    const BdApi = fakeBdApi();
    const { fresh, state } = s.loadState(BdApi, "BetterKeybinds", KNOWN);
    assert.equal(fresh, true);
    assert.deepEqual(state.binds, []);
    assert.ok(BdApi.peek()["BetterKeybinds:state"]);
  });
  it("round-trips saved binds", () => {
    const BdApi = fakeBdApi();
    s.saveState(BdApi, "BetterKeybinds", {
      binds: [{ enabled: true, global: false, id: "b1", keybind: ["F8"], params: {}, toastOnRun: true, type: "self.toggleMute" }],
      settings: { defaultGlobal: true, defaultToast: false }
    });
    const { fresh, state } = s.loadState(BdApi, "BetterKeybinds", KNOWN);
    assert.equal(fresh, false);
    assert.equal(state.binds[0].type, "self.toggleMute");
    assert.equal(state.settings.defaultGlobal, true);
  });
});

describe("import/export", () => {
  it("round-trips through JSON", () => {
    const binds = [
      { enabled: true, global: false, id: "b1", keybind: ["F8"], params: { a: 50, b: 100 }, toastOnRun: true, type: "output.toggle" }
    ];
    const text = s.exportState({ binds });
    assert.match(text, /BetterKeybinds/);
    const { binds: back, warnings } = s.importState(text, KNOWN);
    assert.equal(back.length, 1);
    assert.deepEqual(warnings, []);
  });
  it("accepts bare arrays and rejects garbage", () => {
    const { binds, warnings } = s.importState(JSON.stringify([{ type: "self.toggleMute" }]), KNOWN);
    assert.equal(binds[0].type, "self.toggleMute");
    assert.ok(warnings.some((w) => w.includes("no keybind")));
    assert.throws(() => s.importState("nope", KNOWN), /valid JSON/);
    assert.throws(() => s.importState("{}", KNOWN), /bind array/);
  });
  it("regenerates colliding ids", () => {
    const incoming = [{ id: "dup" }, { id: "dup" }];
    s.ensureUniqueIds([{ id: "dup" }], incoming);
    assert.equal(new Set(incoming.map((b) => b.id)).size, 2);
  });
});

describe("detectConflicts", () => {
  it("flags shared chords among enabled binds", () => {
    const found = s.detectConflicts([
      { enabled: true, id: "a", keybind: ["Control", "K"], type: "output.toggle" },
      { enabled: true, id: "b", keybind: ["k", "ctrl"], type: "self.toggleMute" },
      { enabled: false, id: "c", keybind: ["Control", "K"], type: "input.set" },
      { enabled: true, id: "d", keybind: [], type: "input.set" }
    ]);
    assert.equal(found.length, 1);
    assert.equal(found[0].label, "Control + K");
    assert.deepEqual(found[0].binds.map((b) => b.id), ["a", "b"]);
  });
});
