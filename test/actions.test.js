"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const a = require("../src/lib/actions");

describe("clampVolume", () => {
  it("clamps and rounds", () => {
    assert.equal(a.clampVolume(50.4), 50);
    assert.equal(a.clampVolume(-5), 0);
    assert.equal(a.clampVolume(150), 100);
    assert.equal(a.clampVolume("75"), 75);
    assert.equal(a.clampVolume("nope"), null);
  });
});

describe("resolveToggle", () => {
  it("flips 50/100 both ways", () => {
    assert.equal(a.resolveToggle(50, 50, 100), 100);
    assert.equal(a.resolveToggle(100, 50, 100), 50);
  });
  it("flips to the farther side", () => {
    assert.equal(a.resolveToggle(60, 50, 100), 100);
    assert.equal(a.resolveToggle(90, 50, 100), 50);
  });
  it("handles unknown current and degenerate levels", () => {
    assert.equal(a.resolveToggle(null, 50, 100), 100);
    assert.equal(a.resolveToggle(70, 80, 80), 80);
    assert.equal(a.resolveToggle(70, 50, "bad"), null);
  });
});

describe("validateAction", () => {
  it("rejects unknown types", () => {
    assert.deepEqual(a.validateAction("nope.nope", {}), ["Unknown action: nope.nope"]);
  });
  it("validates volumes and required text", () => {
    assert.deepEqual(a.validateAction("output.set", { volume: 80 }), []);
    assert.equal(a.validateAction("output.set", { volume: 500 }).length, 1);
    assert.equal(a.validateAction("message.send", { channelScope: "current", text: "" }).length, 1);
    assert.deepEqual(a.validateAction("message.send", { channelScope: "current", text: "hi" }), []);
  });
  it("validates urls and selects", () => {
    assert.deepEqual(a.validateAction("util.openUrl", { url: "https://example.com" }), []);
    assert.equal(a.validateAction("util.openUrl", { url: "ftp://x" }).length, 1);
    assert.equal(a.validateAction("message.send", { channelScope: "bogus", text: "hi" }).length, 1);
  });
});

function fakeDiscord(overrides = {}) {
  return {
    getCurrentTextChannelId: () => "chan1",
    getInputVolume: () => 80,
    getOutputVolume: () => 50,
    resolveInputVolume: () => ({ tracked: false, value: 80 }),
    resolveOutputVolume: () => ({ tracked: false, value: 50 }),
    sent: [],
    setInputVolume: (v) => ({ message: `Input volume ${v}%`, ok: true }),
    setOutputVolume: (v) => ({ message: `Output volume ${v}%`, ok: true }),
    showToast: () => {},
    ...overrides
  };
}

describe("runAction", () => {
  it("toggles output volume via bridge", async () => {
    let got = null;
    const discord = fakeDiscord({ setOutputVolume: (v) => { got = v; return { message: `Speaker volume 50% → ${v}%`, ok: true }; } });
    const res = await a.runAction("output.toggle", { a: 50, b: 100 }, { discord });
    assert.equal(res.ok, true);
    assert.equal(got, 100);
    assert.match(res.message, /50% → 100%/);
  });
  it("adjusts relative to current", async () => {
    let got = null;
    const discord = fakeDiscord({
      resolveOutputVolume: () => ({ tracked: false, value: 90 }),
      setOutputVolume: (v) => { got = v; return { ok: true }; }
    });
    await a.runAction("output.adjust", { delta: -25 }, { discord });
    assert.equal(got, 65);
  });
  it("fails adjust when current volume unreadable", async () => {
    const discord = fakeDiscord({ resolveOutputVolume: () => ({ tracked: false, value: null }) });
    const res = await a.runAction("output.adjust", { delta: 5 }, { discord });
    assert.equal(res.ok, false);
  });
  it("sends to current or saved channel", async () => {
    const discord = fakeDiscord({ sendMessage: async (c, t) => { discord.sent.push([c, t]); return { ok: true }; } });
    const r1 = await a.runAction("message.send", { channelScope: "current", text: "hi" }, { discord });
    assert.equal(r1.ok, true);
    assert.deepEqual(discord.sent[0], ["chan1", "hi"]);
    const r2 = await a.runAction("message.send", { channelId: "c9", channelScope: "saved", text: "yo" }, { discord });
    assert.deepEqual(discord.sent[1], ["c9", "yo"]);
    assert.equal(r2.ok, true);
  });
  it("shows toasts", async () => {
    const t = await a.runAction("util.toast", { text: "x" }, { discord: fakeDiscord() });
    assert.equal(t.ok, true);
  });
});

describe("runBind", () => {
  it("runs the bind's single action", async () => {
    const discord = fakeDiscord();
    const res = await a.runBind({ params: { volume: 30 }, type: "output.set" }, { discord });
    assert.equal(res.ok, true);
  });
  it("rejects binds without a valid action", async () => {
    const discord = fakeDiscord();
    assert.equal((await a.runBind(null, { discord })).ok, false);
    assert.equal((await a.runBind({ params: {} }, { discord })).ok, false);
    assert.equal((await a.runBind({ params: {}, type: "nope" }, { discord })).ok, false);
    assert.equal((await a.runBind({ params: { volume: 999 }, type: "output.set" }, { discord })).ok, false);
  });
});

describe("stream actions", () => {
  it("routes stream binds to the bridge", async () => {
    const discord = fakeDiscord({
      stopOwnStream: async () => ({ message: "Stream stopped.", ok: true }),
      toggleGameStream: async () => ({ message: "Streaming Doom", ok: true }),
      toggleScreenStream: async () => ({ message: "Streaming your screen", ok: true })
    });
    assert.equal((await a.runBind({ params: {}, type: "stream.startGame" }, { discord })).message, "Streaming Doom");
    assert.equal((await a.runBind({ params: {}, type: "stream.startScreen" }, { discord })).message, "Streaming your screen");
    assert.equal((await a.runBind({ params: {}, type: "stream.stop" }, { discord })).message, "Stream stopped.");
    assert.equal((await a.runBind({ params: {}, type: "stream.toggleGame" }, { discord })).message, "Streaming Doom");
  });
  it("validates stream actions take optional capture params", () => {
    assert.deepEqual(a.validateAction("stream.startGame", {}), []);
    assert.deepEqual(a.validateAction("stream.startScreen", {}), []);
    assert.deepEqual(a.validateAction("stream.startScreen", { sourceId: "screen:1:0" }), []);
    assert.deepEqual(a.validateAction("stream.startGame", { gamePid: "4242" }), []);
    assert.equal(a.getActionDef("stream.toggleGame").type, "stream.startGame");
    assert.equal(a.getActionDef("stream.startGame").label, "Toggle game stream");
    assert.equal(a.getActionDef("stream.startScreen").label, "Toggle screen stream");
    assert.ok(a.actionTypes().includes("stream.startScreen"));
    assert.ok(a.actionTypes().includes("stream.toggleGame"));
  });
  it("passes saved capture targets to the bridge", async () => {
    let screen = null;
    let game = null;
    const discord = fakeDiscord({
      toggleGameStream: async (opts) => { game = opts; return { message: "ok", ok: true }; },
      toggleScreenStream: async (opts) => { screen = opts; return { message: "ok", ok: true }; }
    });
    await a.runBind({ params: { sourceId: "screen:1:0", sourceName: "Screen 2" }, type: "stream.startScreen" }, { discord });
    await a.runBind({ params: { gameExePath: "C:\\Games\\doom.exe", gameName: "Doom", gamePid: "4242" }, type: "stream.startGame" }, { discord });
    assert.deepEqual(screen, { sourceId: "screen:1:0", sourceName: "Screen 2" });
    assert.deepEqual(game, { exePath: "C:\\Games\\doom.exe", name: "Doom", pid: "4242" });
  });
});

describe("soundboard actions", () => {
  it("routes sound binds to the bridge", async () => {
    let got = null;
    const discord = fakeDiscord({
      playSoundboardSound: async (opts) => { got = opts; return { message: "Playing Horn", ok: true }; }
    });
    const res = await a.runBind({ params: { soundId: "s1", soundName: "Horn", sourceGuildId: "g1" }, type: "soundboard.play" }, { discord });
    assert.equal(res.message, "Playing Horn");
    assert.deepEqual(got, { soundId: "s1", soundName: "Horn", sourceGuildId: "g1" });
  });
  it("rejects empty sounds before touching the bridge", async () => {
    let called = false;
    const discord = fakeDiscord({ playSoundboardSound: async () => { called = true; return { ok: true }; } });
    const res = await a.runBind({ params: {}, type: "soundboard.play" }, { discord });
    assert.equal(res.ok, false);
    assert.match(res.message, /Pick a sound/);
    assert.equal(called, false);
  });
  it("validates sound params", () => {
    assert.deepEqual(a.validateAction("soundboard.play", {}), []);
    assert.deepEqual(a.validateAction("soundboard.play", { soundId: "s1" }), []);
    assert.equal(a.getActionDef("soundboard.play").label, "Play soundboard sound");
    assert.ok(a.actionTypes().includes("soundboard.play"));
  });
});
