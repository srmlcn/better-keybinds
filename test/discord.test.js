"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { DiscordBridge } = require("../src/lib/discord");

describe("DiscordBridge without BdApi modules", () => {
  it("degrades to nulls and error results, never throws", () => {
    const d = new DiscordBridge({});
    assert.equal(d.getFlux(), null);
    assert.equal(d.getMediaEngineStore(), null);
    assert.equal(d.getOutputVolume(), null);
    assert.equal(d.setOutputVolume(80).ok, false);
    assert.equal(d.toggleSelfMute().ok, false);
    assert.equal(d.goToChannel("1", "2").ok, false);
    assert.equal(d.getCurrentTextChannelId(), null);
  });
  it("toasts fall back safely", () => {
    const d = new DiscordBridge({});
    assert.doesNotThrow(() => d.showToast("hello", "info"));
  });
  it("reports platform and no global support", () => {
    const d = new DiscordBridge({});
    assert.match(d.getPlatform(), /^(win32|darwin|linux|unknown)$/);
    assert.equal(d.hasGlobalSupport(), false);
    assert.equal(d.getKeycodeMap(), null);
  });
});

function stubbed({ stuck = false, readable = true, voiceThrows = false } = {}) {
  const dispatched = [];
  const calls = [];
  let vol = 55;
  const store = {
    getInputVolume: () => 80,
    isSelfDeaf: () => false,
    isSelfMute: () => true,
    setInputVolume: (v) => calls.push(["in", v]),
    setOutputVolume: (v) => {
      calls.push(["out", v]);
      if (!stuck) vol = v;
    }
  };
  if (readable) store.getOutputVolume = () => vol;
  const voice = {
    setInputVolume: (v) => calls.push(["actions-in", v]),
    setOutputVolume: (v) => {
      calls.push(["actions-out", v]);
      if (voiceThrows) throw new Error("voice down");
    },
    setSelfDeaf: () => {},
    setSelfMute: () => {},
    toggleSelfDeaf: () => {},
    toggleSelfMute: () => {}
  };
  const BdApi = {
    Webpack: {
      Filters: {
        byProps: (...props) => (m) => m && props.every((p) => m[p] !== undefined)
      },
      getModule: (filter) => {
        const candidates = [
          { dispatch: (e) => dispatched.push(e), subscribe: () => {}, unsubscribe: () => {} },
          store,
          voice
        ];
        return candidates.find((m) => { try { return filter(m); } catch { return false; } }) || null;
      }
    }
  };
  const d = new DiscordBridge(BdApi);
  return { calls, d, dispatched };
}

describe("DiscordBridge with stubbed modules", () => {
  it("writes actions-first and verifies by read-back", () => {
    const { calls, d, dispatched } = stubbed();
    assert.equal(d.getOutputVolume(), 55);
    const res = d.setOutputVolume(75);
    assert.equal(res.ok, true);
    assert.match(res.message, /55% → 75%/);
    assert.deepEqual(calls, [["actions-out", 75], ["out", 75]]);
    assert.deepEqual(dispatched, [{ type: "AUDIO_SET_OUTPUT_VOLUME", volume: 75 }]);
  });
  it("reports stuck volume when read-back disagrees", () => {
    const { d } = stubbed({ stuck: true });
    const res = d.setOutputVolume(75);
    assert.equal(res.ok, false);
    assert.match(res.message, /didn't change — still 55%/);
  });
  it("reports unverified when volume is unreadable", () => {
    const { d } = stubbed({ readable: false });
    const res = d.setOutputVolume(75);
    assert.equal(res.ok, true);
    assert.match(res.message, /couldn't confirm/);
  });
  it("short-circuits redundant mute state", () => {
    const { d, dispatched } = stubbed();
    assert.equal(d.setSelfMute(true).message, "Already muted");
    assert.deepEqual(dispatched, []);
  });
  it("reports resulting mute state after toggle", () => {
    const { d } = stubbed();
    assert.equal(d.toggleSelfMute().message, "Muted");
    assert.equal(d.toggleSelfDeaf().message, "Undeafened");
  });
  it("probes module status and volumes", () => {
    const { d } = stubbed();
    const p = d.probe();
    assert.equal(p.flux, true);
    assert.equal(p.mediaEngine, true);
    assert.ok(p.mediaMethods.includes("getOutputVolume"));
    assert.ok(p.mediaMethods.includes("setOutputVolume"));
    assert.equal(p.voiceActions, true);
    assert.equal(p.audioPath.setters.setOutputVolume, true);
    assert.equal(p.audioPath.hasOutputVolumeHandler, null);
    assert.equal(p.outputVolume, 55);
    assert.equal(p.inputVolume, 80);
    assert.equal(p.selfMute, true);
    assert.equal(p.selfDeaf, false);
    assert.match(d.probeSummary(), /flux:ok media:ok/);
    assert.match(d.diagnosticsText("HEADER"), /HEADER[\s\S]*outputVolume: 55/);
  });
  it("probes empty without modules", () => {
    const d = new DiscordBridge({});
    const p = d.probe();
    assert.equal(p.flux, false);
    assert.equal(p.mediaEngine, false);
    assert.deepEqual(p.mediaMethods, []);
    assert.equal(p.outputVolume, null);
    assert.match(d.probeSummary(), /flux:MISS/);
  });
  it("logs volume writes to the debug log", () => {
    const { d } = stubbed();
    const logged = [];
    d.log = { debug: (t, m) => logged.push(["debug", m]), info: (t, m) => logged.push(["info", m]), warn: (t, m) => logged.push(["warn", m]) };
    d.setOutputVolume(75);
    assert.ok(logged.some(([l, m]) => l === "info" && m.includes("output volume 55 -> 75")));
    assert.ok(logged.some(([l, m]) => l === "debug" && m.includes("AUDIO_SET_OUTPUT_VOLUME")));
  });
  it("fingerprints resolved modules", () => {
    const { d } = stubbed();
    const logged = [];
    d.log = { debug: (t, m) => logged.push(m), info: () => {}, warn: () => {} };
    d.getFlux();
    assert.ok(logged.some((m) => m.includes("webpack resolved flux") && m.includes("keys")));
  });
  it("logs webpack exceptions instead of swallowing them", () => {
    const logged = [];
    const d = new DiscordBridge(
      { Webpack: { getModule: () => { throw new Error("kaput"); } } },
      { debug: () => {}, info: () => {}, warn: (t, m) => logged.push(m) }
    );
    assert.equal(d.findModule(() => true), null);
    assert.ok(logged.some((m) => m.includes("threw: kaput")));
  });
  it("probes audio actions as missing in stub", () => {
    const { d } = stubbed();
    const p = d.probe();
    assert.equal(p.audioActions, false);
    assert.deepEqual(p.audioActionKeys, []);
  });
  it("falls through when the voice setter throws", () => {
    const { d } = stubbed({ voiceThrows: true });
    const res = d.setOutputVolume(75);
    assert.equal(res.ok, true);
    assert.match(res.message, /55% → 75%/);
  });
  it("fingerprints prototype methods", () => {
    const { d } = stubbed();
    class Store {
      constructor() {
        this.ownProp = 1;
      }
      protoGetter() {
        return 1;
      }
    }
    const fp = d.fingerprint(new Store());
    assert.match(fp, /ownProp/);
    assert.match(fp, /protoGetter/);
  });
});

describe("inspectAudioPath", () => {
  function bridgeWith(flux, voice) {
    return new DiscordBridge({
      Webpack: {
        Filters: {
          byProps: (...props) => (m) => m && props.every((p) => m[p] !== undefined)
        },
        getModule: (filter) => [flux, voice].find((m) => { try { return filter(m); } catch { return false; } }) || null
      }
    });
  }
  const voice = {
    setInputVolume: (v) => v,
    setOutputVolume: (v) => v * 2,
    toggleSelfDeaf: () => {},
    toggleSelfMute: () => {}
  };
  it("detects handlers and setter sources", () => {
    const flux = {
      _actionHandlers: { AUDIO_SET_OUTPUT_VOLUME: new Set([() => {}]), SOMETHING_ELSE: new Set() },
      dispatch: () => {},
      subscribe: () => {},
      unsubscribe: () => {}
    };
    const ap = bridgeWith(flux, voice).inspectAudioPath();
    assert.equal(ap.setters.setOutputVolume, true);
    assert.equal(ap.setters.setInputVolume, true);
    assert.equal(ap.hasOutputVolumeHandler, true);
    assert.equal(ap.fluxHandlerCount, 1);
    assert.equal(ap.fluxTotalTypes, 2);
    assert.deepEqual(ap.fluxAudioTypes, ["AUDIO_SET_OUTPUT_VOLUME"]);
    assert.match(ap.sources.setOutputVolume, /v \* 2/);
    assert.ok(ap.sources.setOutputVolume.length <= 400);
  });
  it("reports missing handlers explicitly", () => {
    const flux = {
      _actionHandlers: { SOMETHING_ELSE: new Set() },
      dispatch: () => {},
      subscribe: () => {},
      unsubscribe: () => {}
    };
    const ap = bridgeWith(flux, voice).inspectAudioPath();
    assert.equal(ap.hasOutputVolumeHandler, false);
  });
  it("reports unknown when flux hides handlers", () => {
    const flux = { dispatch: () => {}, subscribe: () => {}, unsubscribe: () => {} };
    const ap = bridgeWith(flux, null).inspectAudioPath();
    assert.equal(ap.hasOutputVolumeHandler, null);
    assert.equal(ap.setters.setOutputVolume, false);
    assert.deepEqual(ap.sources, {});
  });
});
