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

describe("DiscordBridge with stubbed modules", () => {
  function stubbed() {
    const dispatched = [];
    const calls = [];
    const store = {
      getOutputVolume: () => 55,
      isSelfDeaf: () => false,
      isSelfMute: () => true,
      setOutputVolume: (v) => calls.push(["out", v])
    };
    const BdApi = {
      Webpack: {
        Filters: {
          byProps: (...props) => (m) => m && props.every((p) => m[p] !== undefined)
        },
        getModule: (filter) => {
          const candidates = [
            { dispatch: (e) => dispatched.push(e), subscribe: () => {}, unsubscribe: () => {} },
            store
          ];
          return candidates.find((m) => { try { return filter(m); } catch { return false; } }) || null;
        }
      }
    };
    const d = new DiscordBridge(BdApi);
    return { calls, d, dispatched };
  }
  it("reads and writes volume with flux sync", () => {
    const { calls, d, dispatched } = stubbed();
    assert.equal(d.getOutputVolume(), 55);
    const res = d.setOutputVolume(75);
    assert.equal(res.ok, true);
    assert.deepEqual(calls, [["out", 75]]);
    assert.deepEqual(dispatched, [{ type: "AUDIO_SET_OUTPUT_VOLUME", volume: 75 }]);
  });
  it("short-circuits redundant mute state", () => {
    const { d, dispatched } = stubbed();
    assert.equal(d.setSelfMute(true).message, "Already muted");
    assert.deepEqual(dispatched, []);
  });
});
