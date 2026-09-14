"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { actionTypes } = require("../src/lib/actions");
const s = require("../src/lib/store");

const KNOWN = actionTypes();

describe("presets", () => {
  it("ships speaker 50/100 toggle plus basics", () => {
    const presets = s.defaultPresets();
    assert.equal(presets.length, 5);
    const toggle = presets[0];
    assert.equal(toggle.name, "Speaker 50/100 toggle");
    assert.deepEqual(toggle.actions, [{ params: { a: 50, b: 100 }, type: "output.toggle" }]);
    for (const p of presets) {
      assert.deepEqual(s.validateMacro(s.sanitizeMacro(p, KNOWN), KNOWN).filter((e) => e !== "No keybind assigned."), []);
    }
  });
});

describe("sanitizeMacro", () => {
  it("fills defaults and normalizes", () => {
    const clean = s.sanitizeMacro({ keybind: ["ctrl", "k"], name: "  Demo " }, KNOWN);
    assert.equal(clean.name, "Demo");
    assert.deepEqual(clean.keybind, ["Control", "K"]);
    assert.equal(clean.enabled, true);
    assert.equal(clean.global, false);
    assert.equal(clean.toastOnRun, true);
    assert.ok(clean.id);
  });
  it("flags unknown actions without dropping them", () => {
    const clean = s.sanitizeMacro({ actions: [{ params: {}, type: "future.thing" }], name: "x" }, KNOWN);
    assert.equal(clean.actions[0].unknown, true);
  });
  it("rejects non-objects", () => {
    assert.equal(s.sanitizeMacro(null, KNOWN), null);
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
  it("seeds presets on first run", () => {
    const BdApi = fakeBdApi();
    const { fresh, state } = s.loadState(BdApi, "KeybindMacros", KNOWN);
    assert.equal(fresh, true);
    assert.equal(state.macros.length, 5);
    assert.ok(BdApi.peek()["KeybindMacros:state"]);
  });
  it("round-trips saved macros", () => {
    const BdApi = fakeBdApi();
    s.saveState(BdApi, "KeybindMacros", {
      macros: [{ actions: [], enabled: true, global: false, id: "m1", keybind: ["F8"], name: "Mine", toastOnRun: true }],
      settings: { defaultGlobal: true, defaultToast: false }
    });
    const { fresh, state } = s.loadState(BdApi, "KeybindMacros", KNOWN);
    assert.equal(fresh, false);
    assert.equal(state.macros[0].name, "Mine");
    assert.equal(state.settings.defaultGlobal, true);
  });
});

describe("import/export", () => {
  it("round-trips through JSON", () => {
    const macros = s.defaultPresets();
    const text = s.exportState({ macros });
    const { macros: back, warnings } = s.importState(text, KNOWN);
    assert.equal(back.length, macros.length);
    assert.ok(warnings.some((w) => w.includes("no keybind")));
  });
  it("accepts bare arrays and rejects garbage", () => {
    const { macros } = s.importState(JSON.stringify([{ name: "Solo" }]), KNOWN);
    assert.equal(macros[0].name, "Solo");
    assert.throws(() => s.importState("nope", KNOWN), /valid JSON/);
    assert.throws(() => s.importState("{}", KNOWN), /macro array/);
  });
  it("regenerates colliding ids", () => {
    const incoming = [{ id: "dup" }, { id: "dup" }];
    s.ensureUniqueIds([{ id: "dup" }], incoming);
    assert.equal(new Set(incoming.map((m) => m.id)).size, 2);
  });
});

describe("detectConflicts", () => {
  it("flags shared chords among enabled macros", () => {
    const found = s.detectConflicts([
      { enabled: true, id: "a", keybind: ["Control", "K"], name: "A" },
      { enabled: true, id: "b", keybind: ["k", "ctrl"], name: "B" },
      { enabled: false, id: "c", keybind: ["Control", "K"], name: "C" },
      { enabled: true, id: "d", keybind: [], name: "D" }
    ]);
    assert.equal(found.length, 1);
    assert.equal(found[0].label, "Control + K");
    assert.deepEqual(found[0].macros.map((m) => m.id), ["a", "b"]);
  });
});
