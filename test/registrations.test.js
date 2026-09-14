"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { MacroEngine, numericIdFor } = require("../src/lib/registrations");

function makeEngine(macros, overrides = {}) {
  const calls = [];
  const engine = new MacroEngine({
    discord: {
      getDiscordUtils: () => null,
      getKeycodeMap: () => null,
      hasGlobalSupport: () => false
    },
    getMacros: () => macros,
    notify: () => {},
    runMacroById: (id, source) => calls.push([id, source]),
    ...overrides
  });
  return { calls, engine };
}

function keyEvent(key, extra = {}) {
  return { key, repeat: false, target: { tagName: "DIV" }, ...extra };
}

describe("numericIdFor", () => {
  it("is stable and in range", () => {
    const a = numericIdFor("macro-1");
    assert.equal(a, numericIdFor("macro-1"));
    assert.ok(a >= 4100000 && a < 4150000);
  });
});

describe("in-app matching", () => {
  it("fires exact chords once until release", () => {
    const macros = [{ enabled: true, id: "m1", keybind: ["Control", "K"] }];
    const { calls, engine } = makeEngine(macros);
    engine.handleKeyDown(keyEvent("Control"));
    assert.deepEqual(calls, []);
    engine.handleKeyDown(keyEvent("k"));
    assert.deepEqual(calls, [["m1", "in-app"]]);
    engine.handleKeyDown(keyEvent("k", { repeat: true }));
    engine.handleKeyDown(keyEvent("Shift"));
    assert.equal(calls.length, 1);
    engine.handleKeyUp(keyEvent("k"));
    engine.handleKeyDown(keyEvent("k"));
    assert.equal(calls.length, 1);
    engine.handleKeyUp(keyEvent("Control"));
    engine.handleKeyUp(keyEvent("Shift"));
    engine.lastFired.clear();
    engine.handleKeyDown(keyEvent("Control"));
    engine.handleKeyDown(keyEvent("k"));
    assert.equal(calls.length, 2);
  });
  it("ignores disabled macros and empty binds", () => {
    const macros = [
      { enabled: false, id: "off", keybind: ["F8"] },
      { enabled: true, id: "empty", keybind: [] }
    ];
    const { calls, engine } = makeEngine(macros);
    engine.handleKeyDown(keyEvent("F8"));
    assert.deepEqual(calls, []);
  });
  it("skips single letters while typing", () => {
    const macros = [{ enabled: true, id: "m1", keybind: ["G"] }];
    const { calls, engine } = makeEngine(macros);
    engine.handleKeyDown(keyEvent("g", { target: { tagName: "TEXTAREA" } }));
    assert.deepEqual(calls, []);
  });
});

describe("global refresh without native support", () => {
  it("registers nothing and warns once", () => {
    const notes = [];
    const macros = [{ enabled: true, global: true, id: "g1", keybind: ["Control", "B"], name: "G" }];
    const { engine } = makeEngine(macros, { notify: (m, t) => notes.push([m, t]) });
    engine.refreshGlobal();
    engine.refreshGlobal();
    assert.equal(engine.globalStatus.supported, false);
    assert.equal(engine.globalStatus.registered, 0);
    assert.equal(notes.length, 1);
    assert.match(notes[0][0], /in-app only/);
  });
  it("registers chords through discord_utils when available", () => {
    const registered = new Map();
    const utils = {
      inputEventRegister: (id, keys, cb, opts) => registered.set(id, { cb, keys, opts }),
      inputEventUnregister: (id) => registered.delete(id)
    };
    const macros = [{ enabled: true, global: true, id: "g1", keybind: ["Control", "B"], name: "G" }];
    const { calls, engine } = makeEngine(macros, {
      discord: {
        getDiscordUtils: () => utils,
        getKeycodeMap: () => ({ b: 0x42, ctrl: 0xa2 }),
        hasGlobalSupport: () => true
      }
    });
    engine.refreshGlobal();
    assert.equal(engine.globalStatus.registered, 1);
    const [[id, reg]] = [...registered.entries()];
    assert.equal(id, numericIdFor("g1"));
    assert.deepEqual(reg.keys, [[0, 0xa2], [0, 0x42]]);
    assert.deepEqual(reg.opts, { blurred: true, focused: false, keydown: true, keyup: false });
    reg.cb(false);
    assert.deepEqual(calls, []);
    reg.cb(true);
    assert.deepEqual(calls, [["g1", "global"]]);
    engine.stop();
    assert.equal(registered.size, 0);
  });
});
