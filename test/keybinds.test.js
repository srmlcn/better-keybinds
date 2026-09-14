"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const k = require("../src/lib/keybinds");

describe("normalizeKeyName", () => {
  it("uppercases single letters", () => {
    assert.equal(k.normalizeKeyName("k"), "K");
    assert.equal(k.normalizeKeyName("K"), "K");
  });
  it("maps modifier aliases", () => {
    assert.equal(k.normalizeKeyName("ctrl"), "Control");
    assert.equal(k.normalizeKeyName("Control"), "Control");
    assert.equal(k.normalizeKeyName("cmd"), "Meta");
    assert.equal(k.normalizeKeyName("option"), "Alt");
  });
  it("maps special keys", () => {
    assert.equal(k.normalizeKeyName(" "), "Space");
    assert.equal(k.normalizeKeyName("esc"), "Escape");
    assert.equal(k.normalizeKeyName("return"), "Enter");
    assert.equal(k.normalizeKeyName("up"), "ArrowUp");
    assert.equal(k.normalizeKeyName("ArrowUp"), "ArrowUp");
  });
  it("maps function keys and event codes", () => {
    assert.equal(k.normalizeKeyName("f5"), "F5");
    assert.equal(k.normalizeKeyName("F12"), "F12");
    assert.equal(k.normalizeKeyName("KeyA"), "A");
    assert.equal(k.normalizeKeyName("Digit1"), "1");
    assert.equal(k.normalizeKeyName("ControlLeft"), "Control");
  });
  it("rejects empty and unidentified keys", () => {
    assert.equal(k.normalizeKeyName(""), null);
    assert.equal(k.normalizeKeyName(null), null);
    assert.equal(k.normalizeKeyName("Unidentified"), null);
    assert.equal(k.normalizeKeyName("Dead"), null);
  });
});

describe("keybind equality and conflicts", () => {
  it("compares order-independently", () => {
    assert.ok(k.keybindsEqual(["Control", "Shift", "K"], ["k", "shift", "ctrl"]));
    assert.ok(!k.keybindsEqual(["Control", "K"], ["Control", "Shift", "K"]));
  });
  it("dedupes and caps length", () => {
    assert.deepEqual(k.normalizeKeybind(["Control", "ctrl", "K"]), ["Control", "K"]);
    assert.equal(k.normalizeKeybind(["A", "B", "C", "D", "E", "F"]).length, 5);
  });
  it("builds stable conflict keys", () => {
    assert.equal(k.conflictKey(["K", "Control"]), "Control+K");
    assert.equal(k.conflictKey([]), "");
  });
  it("formats display strings", () => {
    assert.equal(k.keybindToString(["Control", "K"]), "Control + K");
    assert.equal(k.keybindToString([]), "Not set");
  });
});

describe("pressedMatches", () => {
  it("requires exact chord match", () => {
    assert.ok(k.pressedMatches(new Set(["Control", "K"]), ["K", "Control"]));
    assert.ok(!k.pressedMatches(new Set(["Control", "Shift", "K"]), ["Control", "K"]));
    assert.ok(!k.pressedMatches(new Set(["Control"]), ["Control", "K"]));
    assert.ok(!k.pressedMatches(new Set(["A"]), []));
  });
});

describe("typing guard", () => {
  it("skips single printable keys in editable targets", () => {
    assert.ok(k.shouldSkipForTarget(["A"], { tagName: "INPUT" }));
    assert.ok(k.shouldSkipForTarget([";"], { isContentEditable: true }));
    assert.ok(!k.shouldSkipForTarget(["Control", "A"], { tagName: "INPUT" }));
    assert.ok(!k.shouldSkipForTarget(["A"], { tagName: "DIV" }));
    assert.ok(!k.shouldSkipForTarget(["F8"], { tagName: "TEXTAREA" }));
  });
});

describe("global key arrays", () => {
  it("resolves codes from discord map", () => {
    const { error, keys } = k.buildGlobalKeyArray(["Control", "B"], { b: 0x42, ctrl: 0xa2 }, null);
    assert.equal(error, undefined);
    assert.deepEqual(keys, [[0, 0xa2], [0, 0x42]]);
  });
  it("falls back to windows table", () => {
    const { error, keys } = k.buildGlobalKeyArray(["Shift", "F8"], null, k.WINDOWS_FALLBACK_VK);
    assert.equal(error, undefined);
    assert.deepEqual(keys, [[0, 0xa0], [0, 0x77]]);
  });
  it("reports unresolvable keys", () => {
    const { error, missing } = k.buildGlobalKeyArray(["Control", "§"], { ctrl: 1 }, {});
    assert.ok(error.includes("§"));
    assert.deepEqual(missing, ["§"]);
  });
  it("extracts nested keycode maps", () => {
    assert.deepEqual(k.extractKeycodeMap({ ctrl: 1 }), { ctrl: 1 });
    assert.deepEqual(k.extractKeycodeMap({ a: { ctrl: 2 } }), { ctrl: 2 });
    assert.equal(k.extractKeycodeMap({ x: 1 }), null);
  });
});
