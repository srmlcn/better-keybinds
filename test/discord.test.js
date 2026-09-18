"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { DiscordBridge } = require("../src/lib/discord");
const { sliderToAmplitude } = require("../src/lib/volume");

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
  else store.getOutputVolume = () => { throw new Error("unreadable"); };
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
    assert.equal(d.getOutputVolume(), 80);
    assert.equal(d.getOutputVolumeRaw(), 55);
    const res = d.setOutputVolume(75);
    const amp75 = sliderToAmplitude(75);
    assert.equal(res.ok, true);
    assert.match(res.message, /80% → 75%/);
    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], "actions-out");
    assert.ok(Math.abs(calls[0][1] - amp75) < 1e-9);
    assert.equal(calls[1][0], "out");
    assert.ok(Math.abs(calls[1][1] - amp75) < 1e-9);
    assert.equal(dispatched[0].type, "AUDIO_SET_OUTPUT_VOLUME");
    assert.ok(Math.abs(dispatched[0].volume - amp75) < 1e-9);
  });
  it("reports stuck volume when read-back disagrees", () => {
    const { d } = stubbed({ stuck: true });
    const res = d.setOutputVolume(75);
    assert.equal(res.ok, false);
    assert.match(res.message, /didn't change — still 80%/);
  });
  it("tracks the set value when volume is unreadable", () => {
    const { d } = stubbed({ readable: false });
    const res = d.setOutputVolume(75);
    assert.equal(res.ok, true);
    assert.match(res.message, /Speaker volume → 75%/);
    assert.deepEqual(d.resolveOutputVolume(), { tracked: true, value: 75 });
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
    assert.ok(p.mediaMethods.includes("getInputVolume"));
    assert.equal(p.voiceActions, true);
    assert.equal(p.audioPath.setters.setOutputVolume, true);
    assert.equal(p.audioPath.hasOutputVolumeHandler, null);
    assert.equal(p.outputVolume, 80);
    assert.equal(p.outputAmplitude, 55);
    assert.equal(p.inputVolume, 91);
    assert.equal(p.inputAmplitude, 80);
    assert.equal(p.selfMute, true);
    assert.equal(p.selfDeaf, false);
    assert.equal(p.outputTracked, null);
    assert.equal(p.inputTracked, null);
    assert.match(d.probeSummary(), /flux:ok media:ok/);
    assert.match(d.diagnosticsText("HEADER"), /HEADER[\s\S]*outputVolume: 80 \(amplitude 55\)/);
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
    assert.ok(logged.some(([l, m]) => l === "info" && m.includes("output volume 80 -> 75")));
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
    assert.match(res.message, /80% → 75%/);
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

describe("tracked volumes", () => {
  function fluxOnlyBdApi() {
    const flux = { dispatch: () => {}, subscribe: () => {}, unsubscribe: () => {} };
    return {
      Webpack: {
        Filters: {
          byProps: (...props) => (m) => m && props.every((p) => m[p] !== undefined)
        },
        getModule: (filter) => {
          try {
            return filter(flux) ? flux : null;
          } catch {
            return null;
          }
        }
      }
    };
  }
  it("tracks last-set values when unreadable", () => {
    const d = new DiscordBridge(fluxOnlyBdApi());
    assert.deepEqual(d.resolveOutputVolume(), { tracked: false, value: null });
    const first = d.setOutputVolume(60);
    assert.equal(first.ok, true);
    assert.match(first.message, /Speaker volume → 60%/);
    assert.deepEqual(d.resolveOutputVolume(), { tracked: true, value: 60 });
    d.setOutputVolume(30);
    assert.deepEqual(d.resolveOutputVolume(), { tracked: true, value: 30 });
    const inp = d.setInputVolume(70);
    assert.equal(inp.ok, true);
    assert.deepEqual(d.resolveInputVolume(), { tracked: true, value: 70 });
  });
  it("prefers live reads over tracked values", () => {
    const { d } = stubbed();
    d.setOutputVolume(75);
    assert.deepEqual(d.resolveOutputVolume(), { tracked: false, value: 75 });
  });
});

describe("findByStrings fallback", () => {
  function scanBdApi({ byStrings = null } = {}) {
    const haystack = {
      doThing(e) {
        return `${e}NEEDLE_XYZ`;
      }
    };
    const filters = {};
    if (byStrings) filters.byStrings = byStrings;
    return {
      Webpack: {
        Filters: filters,
        getModule: (filter) => {
          const candidates = [haystack, ...Object.values(haystack)];
          return candidates.find((m) => { try { return filter(m); } catch { return false; } }) || null;
        }
      }
    };
  }
  it("scans sources when Filters.byStrings is absent", () => {
    const d = new DiscordBridge(scanBdApi());
    const hit = d.findByStrings("NEEDLE_XYZ");
    assert.equal(typeof hit, "object");
    assert.equal(typeof hit.doThing, "function");
    assert.equal(d.findByStrings("ABSENT_XYZ"), null);
  });
  it("scans sources when the built-in lookup misses", () => {
    const d = new DiscordBridge(scanBdApi({ byStrings: () => () => false }));
    assert.equal(typeof d.findByStrings("NEEDLE_XYZ"), "object");
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
    assert.equal(ap.hasOutputVolumeSubscriber, null);
    assert.equal(ap.setters.setOutputVolume, false);
    assert.deepEqual(ap.sources, {});
  });
  it("detects volume subscribers", () => {
    const flux = {
      _actionHandlers: {},
      _subscriptions: { AUDIO_SET_OUTPUT_VOLUME: new Set([() => {}, () => {}]), CHAT_X: new Set() },
      dispatch: () => {},
      subscribe: () => {},
      unsubscribe: () => {}
    };
    const ap = bridgeWith(flux, voice).inspectAudioPath();
    assert.equal(ap.hasOutputVolumeSubscriber, true);
    assert.equal(ap.fluxSubCount, 2);
    assert.deepEqual(ap.fluxSubAudioTypes, ["AUDIO_SET_OUTPUT_VOLUME"]);
  });
  it("treats non-action-keyed registries as unknown", () => {
    const flux = {
      _actionHandlers: { _alpha: 1, _beta: 2 },
      _subscriptions: { 0: 1 },
      dispatch: () => {},
      subscribe: () => {},
      unsubscribe: () => {}
    };
    const ap = bridgeWith(flux, voice).inspectAudioPath();
    assert.equal(ap.hasOutputVolumeHandler, null);
    assert.equal(ap.hasOutputVolumeSubscriber, null);
    assert.deepEqual(ap.fluxHandlerSample, ["_alpha", "_beta"]);
  });
});

describe("scanAudioCandidates", () => {
  function scanBdApi(modules) {
    return {
      Webpack: {
        getModules: () => modules
      }
    };
  }
  it("finds engine, settings, and key matches once each", () => {
    const engine = { getMediaEngine() {}, other: 1 };
    const settings = { inputVolume: 90, outputVolume: 80 };
    const keyed = { myVolumeSlider: 1 };
    const d = new DiscordBridge(scanBdApi([engine, settings, keyed, engine, { unrelated: 1 }]));
    const hits = d.scanAudioCandidates();
    assert.equal(hits.length, 3);
    assert.deepEqual(hits.map((h) => h.kind), ["engine-api", "volume-settings", "volume-key"]);
    assert.match(hits[0].fingerprint, /getMediaEngine/);
  });
  it("respects the limit", () => {
    const d = new DiscordBridge(scanBdApi([{ aVolume: 1 }, { bVolume: 2 }, { cVolume: 3 }]));
    assert.equal(d.scanAudioCandidates({ limit: 2 }).length, 2);
  });
  it("returns empty when enumeration is unsupported", () => {
    const logged = [];
    const d = new DiscordBridge(
      { Webpack: {} },
      { debug: () => {}, info: () => {}, warn: (t, m) => logged.push(m) }
    );
    assert.deepEqual(d.scanAudioCandidates(), []);
    assert.ok(logged.some((m) => m.includes("enumeration unsupported")));
  });
});

describe("getStoreByName", () => {
  it("prefers the named store over prop search", () => {
    const named = { getOutputVolume: () => 42 };
    const d = new DiscordBridge({
      Webpack: {
        getModule: () => null,
        getStore: (name) => (name === "MediaEngineStore" ? named : null)
      }
    });
    assert.equal(d.getMediaEngineStore(), named);
    assert.equal(d.getOutputVolumeRaw(), 42);
  });
  it("falls back to props when getStore is missing or throws", () => {
    const { d } = stubbed();
    assert.ok(d.getMediaEngineStore());
    const throwing = new DiscordBridge({
      Webpack: {
        Filters: { byProps: (...props) => (m) => m && props.every((p) => m[p] !== undefined) },
        getModule: (filter) => {
          const store = { getOutputVolume: () => 7, setOutputVolume: () => {} };
          try {
            return filter(store) ? store : null;
          } catch {
            return null;
          }
        },
        getStore: () => { throw new Error("nope"); }
      }
    });
    assert.equal(throwing.getOutputVolumeRaw(), 7);
  });
});

describe("findCodeFunction", () => {
  function needleFn() {
    return { options: 1, payload: 'type:"STREAM_START"' };
  }
  it("extracts the function whose source contains the needle", () => {
    const container = { other: () => 1, start: needleFn };
    const d = new DiscordBridge({
      Webpack: {
        Filters: {},
        getModule: (filter) => {
          const candidates = [container, ...Object.values(container)];
          return candidates.find((m) => { try { return filter(m); } catch { return false; } }) || null;
        }
      }
    });
    assert.equal(d.findCodeFunction('type:"STREAM_START"'), needleFn);
  });
  it("sweeps past a wrong first match and caches misses", () => {
    const good = { start: needleFn };
    const wrong = { unrelated() { return 1; } };
    let sweeps = 0;
    const d = new DiscordBridge({
      Webpack: {
        Filters: {},
        getModule: () => wrong,
        getModules: () => { sweeps += 1; return [wrong, good]; }
      }
    });
    assert.equal(d.findCodeFunction('type:"STREAM_START"'), needleFn);
    assert.equal(sweeps, 1);
    const missing = new DiscordBridge({
      Webpack: { Filters: {}, getModule: () => null, getModules: () => { sweeps += 1; return []; } }
    });
    assert.equal(missing.findCodeFunction("ABSENT_XYZ"), null);
    assert.equal(missing.findCodeFunction("ABSENT_XYZ"), null);
    assert.equal(sweeps, 2);
  });
});

describe("current Webpack helpers", () => {
  it("prefers Webpack.Stores then getStore", () => {
    const named = { getOutputVolume: () => 9 };
    const d = new DiscordBridge({
      Webpack: {
        Stores: { MediaEngineStore: named },
        getStore: () => { throw new Error("should not run"); }
      }
    });
    assert.equal(d.getMediaEngineStore(), named);
  });
  it("uses getByKeys before Filters.byProps", () => {
    const keyed = { dispatch: () => {}, subscribe: () => {}, unsubscribe: () => {} };
    const d = new DiscordBridge({
      Webpack: {
        Filters: { byProps: () => () => false },
        getByKeys: (...args) => (args.includes("dispatch") ? keyed : null),
        getModule: () => { throw new Error("should not run"); }
      }
    });
    assert.equal(d.getFlux(), keyed);
  });
  it("resolves MediaEngineStore without volume setters", () => {
    const store = {
      getInputVolume: () => 10,
      getMediaEngine: () => ({}),
      getOutputVolume: () => 40,
      isSelfMute: () => false
    };
    const d = new DiscordBridge({
      Webpack: {
        getModule: (filter) => {
          try {
            return filter(store) ? store : null;
          } catch {
            return null;
          }
        }
      }
    });
    assert.equal(d.getMediaEngineStore(), store);
    assert.equal(d.getOutputVolumeRaw(), 40);
  });
});

describe("channel and message actions", () => {
  it("selects a channel with the current options object", () => {
    const calls = [];
    const d = new DiscordBridge({});
    d.cache.set("channelActions", {
      selectChannel: (opts) => calls.push(opts),
      selectVoiceChannel: () => {}
    });
    const res = d.goToChannel("g1", "c1");
    assert.equal(res.ok, true);
    assert.deepEqual(calls, [{ channelId: "c1", guildId: "g1" }]);
  });
  it("disconnects via ChannelActions.disconnect first", () => {
    const calls = [];
    const d = new DiscordBridge({});
    d.cache.set("channelActions", {
      disconnect: () => calls.push("disconnect"),
      selectVoiceChannel: () => calls.push("select")
    });
    assert.equal(d.disconnectVoice().ok, true);
    assert.deepEqual(calls, ["disconnect"]);
  });
  it("falls back to selectVoiceChannel(null)", () => {
    const calls = [];
    const d = new DiscordBridge({});
    d.cache.set("channelActions", { selectVoiceChannel: (id) => calls.push(id) });
    assert.equal(d.disconnectVoice().ok, true);
    assert.deepEqual(calls, [null]);
  });
  it("reads text channel via getChannelId", () => {
    const d = new DiscordBridge({});
    d.cache.set("selectedChannel", { getChannelId: () => "c7" });
    assert.equal(d.getCurrentTextChannelId(), "c7");
  });
  it("sends messages with the current client payload", async () => {
    const sent = [];
    const d = new DiscordBridge({});
    d.cache.set("messageActions", {
      sendMessage: (channelId, message) => sent.push([channelId, message])
    });
    const res = await d.sendMessage("c1", "hello");
    assert.equal(res.ok, true);
    assert.equal(sent[0][0], "c1");
    assert.equal(sent[0][1].content, "hello");
    assert.equal(sent[0][1].tts, false);
    assert.deepEqual(sent[0][1].invalidEmojis, []);
    assert.deepEqual(sent[0][1].validNonShortcutEmojis, []);
  });
});

describe("stream key and guild id shapes", () => {
  it("reads guildId camelCase off channel objects", () => {
    const d = new DiscordBridge({});
    assert.equal(d.channelGuildId({ guildId: "g9" }), "g9");
    assert.equal(d.channelGuildId({ guild_id: "g8" }), "g8");
    assert.equal(d.channelGuildId({}), null);
  });
  it("extracts STREAM_CREATE keys from current payload shapes", () => {
    const d = new DiscordBridge({});
    assert.equal(d.extractStreamKey("guild:g:c:u"), "guild:g:c:u");
    assert.equal(d.extractStreamKey({ streamKey: "guild:g:c:u" }), "guild:g:c:u");
    assert.equal(d.extractStreamKey({ stream_key: "call:c:u" }), "call:c:u");
    assert.equal(d.extractStreamKey({ type: "STREAM_CREATE" }), null);
  });
  it("constructs stream keys from snake_case stream objects", () => {
    const d = new DiscordBridge({});
    assert.equal(
      d.resolveStreamKey({ channel_id: "c", guild_id: "g", owner_id: "u", stream_type: "guild" }),
      "guild:g:c:u"
    );
  });
  it("uses VoiceStateStore.getCurrentClientVoiceChannelId", () => {
    const d = new DiscordBridge({});
    d.cache.set("selectedChannel", { getVoiceChannelId: () => null });
    d.cache.set("voiceState", { getCurrentClientVoiceChannelId: () => "vc3" });
    assert.equal(d.getVoiceChannelId(), "vc3");
  });
});

describe("pickGame", () => {
  function bridgeWithGames(store) {
    const d = new DiscordBridge({});
    d.cache.set("runningGame", store);
    return d;
  }
  it("prefers the visible game", () => {
    const d = bridgeWithGames({
      getRunningGames: () => [{ lastFocused: 9, name: "Old" }],
      getVisibleGame: () => ({ name: "Doom", pid: 4242 }),
      isDetectionEnabled: () => true
    });
    const { detection, game, reason } = d.pickGame();
    assert.equal(reason, "visible");
    assert.equal(game.name, "Doom");
    assert.equal(detection, true);
  });
  it("falls back to focused non-launcher games", () => {
    const d = bridgeWithGames({
      getRunningGames: () => [
        { hidden: true, name: "Hidden" },
        { isLauncher: true, lastFocused: 99, name: "Launcher" },
        { lastFocused: 5, name: "Doom" }
      ],
      getVisibleGame: () => null,
      isDetectionEnabled: () => true
    });
    const { game, reason } = d.pickGame();
    assert.equal(reason, "running");
    assert.equal(game.name, "Doom");
  });
  it("reports disabled detection and empty states", () => {
    const off = bridgeWithGames({ getRunningGames: () => [], getVisibleGame: () => null, isDetectionEnabled: () => false });
    assert.deepEqual([off.pickGame().reason, off.pickGame().detection], ["disabled", false]);
    const empty = bridgeWithGames({ getRunningGames: () => [], getVisibleGame: () => null, isDetectionEnabled: () => true });
    assert.equal(empty.pickGame().reason, "none");
    assert.equal(new DiscordBridge({}).pickGame().reason, "store-missing");
  });
});

describe("source matching", () => {
  const d = new DiscordBridge({});
  it("matches by process id with coercion", () => {
    const sources = [{ id: "window:1:0", name: "Chat", sourcePid: 111 }, { id: "window:2:0", name: "DOOM", sourcePid: "4242" }];
    assert.equal(d.matchGameSource(sources, { name: "Doom", pid: 4242 }).id, "window:2:0");
  });
  it("does not treat window HWND ids as process ids", () => {
    const sources = [{ id: "window:4242:0", name: "Unrelated", sourcePid: 99 }];
    assert.equal(d.matchGameSource(sources, { name: "Doom", pid: 4242 }), null);
  });
  it("never guesses by title — pid only, no random window", () => {
    const sources = [{ id: "window:2:0", name: "DOOM Eternal", sourcePid: null }];
    assert.equal(d.matchGameSource(sources, { exePath: "C:\\Games\\doom\\DOOM Eternal.exe", name: "Something Else", pid: 4242 }), null);
    assert.equal(d.matchGameSource(sources, { name: "DOOM Eternal", pid: null }), null);
    assert.equal(d.matchGameSource([], { name: "Doom", pid: 1 }), null);
  });
  it("prefers application sources over windows for the same pid", () => {
    const sources = [
      { id: "window:2:0", name: "DOOM", sourcePid: 4242 },
      { id: "application:1", name: "Doom", sourcePid: 4242, type: "application" }
    ];
    assert.equal(d.matchGameSource(sources, { name: "Doom", pid: 4242 }).id, "application:1");
    assert.deepEqual(
      Object.fromEntries(Object.entries(d.matchGameSources(sources, { name: "Doom", pid: 4242 })).map(([k, v]) => [k, v?.id || null])),
      { application: "application:1", window: "window:2:0" }
    );
  });
  it("parses pids from application ids but never window HWNDs", () => {
    assert.equal(d.sourceProcessId({ id: "application:4242" }), 4242);
    assert.equal(d.sourceProcessId({ id: "window:4242:0" }), null);
    assert.equal(d.classifySource({ id: "application:1", name: "Doom" }), "application");
  });
  it("picks screen sources by type or id", () => {
    assert.equal(d.pickScreenSource([{ id: "window:1:0" }, { id: "screen:0:0" }]).id, "screen:0:0");
    assert.equal(d.pickScreenSource([{ id: "abc", type: "screen" }]).id, "abc");
    assert.equal(d.pickScreenSource([{ id: "window:1:0" }]), null);
  });
  it("prefers the primary display and saved ids", () => {
    const screens = [
      { id: "screen:1:0", name: "Screen 2" },
      { id: "screen:0:0", name: "Screen 1" }
    ];
    assert.equal(d.pickScreenSource(screens).id, "screen:0:0");
    assert.equal(d.pickScreenSource(screens, { sourceId: "screen:1:0" }).id, "screen:1:0");
    assert.equal(d.pickScreenSource(screens, { sourceId: "stale", sourceName: "Screen 2" }).id, "screen:1:0");
    assert.equal(d.pickScreenSource([{ id: "disp", name: "Entire Screen" }]).id, "disp");
    assert.equal(d.pickScreenSource([{ display_id: "9", id: "x", name: "Display" }]).id, "x");
  });
});

describe("resolveStreamKey", () => {
  it("prefers tracked, then explicit, then constructed keys", () => {
    const d = new DiscordBridge({});
    d.streamKey = "tracked:key";
    assert.equal(d.resolveStreamKey({ channelId: "c", guildId: "g", ownerId: "u", streamType: "guild" }), "tracked:key");
    d.streamKey = null;
    assert.equal(d.resolveStreamKey({ streamKey: "explicit" }), "explicit");
    assert.equal(
      d.resolveStreamKey({ channelId: "c", guildId: "g", ownerId: "u", streamType: "guild" }),
      "guild:g:c:u"
    );
    assert.equal(d.resolveStreamKey({ channelId: "c", guildId: null, ownerId: "u", streamType: "call" }), "call:c:u");
    assert.equal(d.resolveStreamKey({}), null);
    assert.equal(d.resolveStreamKey(null), null);
  });
});

describe("waitFor", () => {
  it("resolves truthy values and times out to null", async () => {
    const d = new DiscordBridge({});
    assert.equal(await d.waitFor(() => "yes", { timeoutMs: 50 }), "yes");
    let n = 0;
    assert.equal(await d.waitFor(() => { n += 1; return n >= 3 ? "late" : null; }, { intervalMs: 5, timeoutMs: 500 }), "late");
    assert.equal(await d.waitFor(() => null, { intervalMs: 5, timeoutMs: 30 }), null);
  });
});

describe("getDesktopSources", () => {
  it("uses the isWindows flag signature first", async () => {
    const calls = [];
    const d = new DiscordBridge({});
    d.cache.set("mediaEngine", { getMediaEngine: () => ({ id: "engine" }) });
    d.cache.set("code:desktop sources", async (media, second, third) => {
      calls.push([Boolean(media), typeof second, Array.isArray(third), Array.isArray(third) ? third.join(",") : ""]);
      if (typeof second !== "boolean") throw new Error("Invalid argument at index 0: type mismatch");
      return [{ id: "window:1:0", name: "Doom" }, { id: "screen:0:0", name: "Screen 1" }];
    });
    const sources = await d.getDesktopSources();
    assert.equal(sources[0].id, "window:1:0");
    assert.equal(d.pickScreenSource(sources).id, "screen:0:0");
    assert.deepEqual(calls[0], [true, "boolean", true, "screen,window"]);
  });
  it("falls back to the legacy 3-arg signature", async () => {
    const d = new DiscordBridge({});
    d.cache.set("mediaEngine", { getMediaEngine: () => ({ id: "engine" }) });
    d.cache.set("code:desktop sources", async (_media, second) => {
      if (typeof second === "boolean") throw new Error("unexpected flag");
      if (!Array.isArray(second)) throw new Error("need types");
      return [{ id: "screen:0:0", name: "Screen 1" }];
    });
    assert.equal((await d.getDesktopSources())[0].id, "screen:0:0");
  });
  it("falls back to window and screen previews", async () => {
    const d = new DiscordBridge({});
    d.cache.set("mediaEngine", {
      getMediaEngine: () => ({
        getScreenPreviews: async () => [{ id: "screen:0:0", name: "Screen 1" }],
        getWindowPreviews: async () => [{ id: "window:2:0", name: "DOOM" }]
      })
    });
    const sources = await d.getDesktopSources();
    assert.deepEqual(sources.map((s) => s.id), ["window:2:0", "screen:0:0"]);
    assert.equal(sources[0].type, "window");
  });
  it("does not treat empty enumerator results as success", async () => {
    const d = new DiscordBridge({});
    d.cache.set("mediaEngine", {
      getMediaEngine: () => ({
        getScreenPreviews: async () => [{ id: "screen:0:0", name: "Screen 1" }],
        getWindowPreviews: async () => []
      })
    });
    d.cache.set("code:desktop sources", async () => []);
    const sources = await d.getDesktopSources();
    assert.equal(sources[0].id, "screen:0:0");
  });
  it("uses DiscordNative.desktopCapturer when webpack misses screens", async () => {
    const prev = globalThis.DiscordNative;
    globalThis.DiscordNative = {
      desktopCapturer: {
        getSources: async () => [{ id: "screen:0:0", name: "Entire Screen" }]
      }
    };
    try {
      const d = new DiscordBridge({});
      d.cache.set("mediaEngine", { getMediaEngine: () => ({ id: "engine" }) });
      d.cache.set("code:desktop sources", async () => [{ id: "window:1:0", name: "App" }]);
      const sources = await d.getDesktopSources();
      assert.ok(sources.some((s) => s.id === "screen:0:0"));
      assert.ok(sources.some((s) => s.id === "window:1:0"));
    } finally {
      globalThis.DiscordNative = prev;
    }
  });
  it("does not call the enumerator with a null engine", async () => {
    let called = false;
    const d = new DiscordBridge({});
    d.cache.set("code:desktop sources", async () => { called = true; return []; });
    await assert.rejects(() => d.getDesktopSources(), /capture-unavailable/);
    assert.equal(called, false);
  });
});

describe("stream actions", () => {
  function streamBridge({ games, inVoice = true, selfStream = null, sources, startFn = null, stopFn = null } = {}) {
    const state = { stream: selfStream };
    const calls = [];
    const d = new DiscordBridge({});
    d.cache.set("selectedChannel", { getVoiceChannelId: () => (inVoice ? "vc1" : null) });
    d.cache.set("channelStore", { getChannel: () => ({ guild_id: "g1" }) });
    d.cache.set("streaming", { getCurrentUserActiveStream: () => state.stream });
    d.cache.set("runningGame", {
      getRunningGames: () => games ?? [{ lastFocused: 5, name: "Doom", pid: 4242 }],
      getVisibleGame: () => null,
      isDetectionEnabled: () => true
    });
    d.cache.set("mediaEngine", { getMediaEngine: () => ({ supports: () => true }) });
    d.cache.set("code:desktop sources", async () => sources ?? [{ id: "window:2:0", name: "DOOM", sourcePid: 4242 }]);
    const inner = startFn || (async (guildId, channelId, _opts, live) => {
      live.stream = { channelId, guildId, ownerId: "u1", streamType: "guild" };
    });
    d.cache.set("code:type:\"STREAM_START\"", async (guildId, channelId, opts) => {
      calls.push([guildId, channelId, opts]);
      return inner(guildId, channelId, opts, state);
    });
    if (stopFn) d.cache.set("code:type:\"STREAM_STOP\"", stopFn);
    else {
      d.cache.set("code:type:\"STREAM_STOP\"", async () => {
        calls.push(["stop"]);
        state.stream = null;
      });
    }
    return { calls, d, state };
  }
  it("starts a game stream and verifies it is live", async () => {
    const { calls, d } = streamBridge({});
    const res = await d.startGameStream();
    assert.equal(res.ok, true);
    assert.equal(res.message, "Streaming Doom");
    assert.deepEqual(calls[0].slice(0, 2), ["g1", "vc1"]);
    assert.equal(calls[0][2].sourceId, "window:2:0");
    assert.equal(calls[0][2].pid, 4242);
    assert.equal(calls[0][2].sourceName, "Doom");
    assert.equal(calls[0][2].audioSourceId, "Doom");
    assert.equal(calls[0][2].previewDisabled, false);
    assert.equal(calls[0][2].sound, true);
  });
  it("no-ops start when already streaming", async () => {
    const { d } = streamBridge({ selfStream: { channelId: "vc1" } });
    const res = await d.startGameStream();
    assert.equal(res.ok, true);
    assert.match(res.message, /Already streaming/);
  });
  it("requires voice, games, and matching sources", async () => {
    assert.match((await streamBridge({ inVoice: false }).d.startGameStream()).message, /Join a voice channel/);
    assert.match((await streamBridge({ games: [] }).d.startGameStream()).message, /No game detected/);
    const nomatch = streamBridge({ sources: [{ id: "window:9:0", name: "Discord", sourcePid: 999 }] });
    const res = await nomatch.d.startGameStream();
    assert.equal(res.ok, false);
    assert.match(res.message, /Couldn't find a window for Doom/);
  });
  it("reports disabled game detection", async () => {
    const { d } = streamBridge({ games: [] });
    d.cache.set("runningGame", { getRunningGames: () => [], getVisibleGame: () => null, isDetectionEnabled: () => false });
    assert.match((await d.startGameStream()).message, /Game detection is off/);
  });
  it("fails cleanly without capture", async () => {
    const d = new DiscordBridge({});
    d.cache.set("selectedChannel", { getVoiceChannelId: () => "vc1" });
    d.cache.set("streaming", { getCurrentUserActiveStream: () => null });
    d.cache.set("runningGame", { getRunningGames: () => [{ name: "Doom", pid: 1 }], getVisibleGame: () => null });
    assert.match((await d.startGameStream()).message, /Couldn't reach screen capture/);
  });
  it("starts screen streams", async () => {
    const { d } = streamBridge({ sources: [{ id: "window:1:0", name: "App" }, { id: "screen:0:0", name: "Screen 1" }] });
    const res = await d.startScreenStream();
    assert.equal(res.ok, true);
    assert.equal(res.message, "Streaming Screen 1");
    const noscreen = streamBridge({ sources: [{ id: "window:1:0", name: "App" }] });
    assert.match((await noscreen.d.startScreenStream()).message, /Couldn't find your screen/);
  });
  it("uses a saved screen id when present", async () => {
    const { calls, d } = streamBridge({
      sources: [
        { id: "screen:0:0", name: "Screen 1" },
        { id: "screen:1:0", name: "Screen 2" }
      ]
    });
    const res = await d.startScreenStream({ sourceId: "screen:1:0" });
    assert.equal(res.ok, true);
    assert.equal(res.message, "Streaming Screen 2");
    assert.equal(calls[0][2].sourceId, "screen:1:0");
  });
  it("uses a saved game pid when auto would pick another", async () => {
    const { calls, d } = streamBridge({
      games: [
        { lastFocused: 99, name: "Launcher", pid: 1, isLauncher: true },
        { lastFocused: 1, name: "Doom", pid: 4242 }
      ],
      sources: [
        { id: "window:1:0", name: "Launcher", sourcePid: 1 },
        { id: "window:2:0", name: "DOOM", sourcePid: 4242 }
      ]
    });
    const res = await d.startGameStream({ pid: 4242, name: "Doom" });
    assert.equal(res.ok, true);
    assert.equal(res.message, "Streaming Doom");
    assert.equal(calls[0][2].sourceId, "window:2:0");
    assert.equal(calls[0][2].pid, 4242);
    assert.equal(calls[0][2].sourceName, "Doom");
  });
  it("re-resolves a stale saved pid by exe and name", async () => {
    const { calls, d } = streamBridge({
      games: [{ exePath: "C:\\Games\\doom.exe", lastFocused: 1, name: "Doom", pid: 7777 }],
      sources: [{ id: "window:2:0", name: "DOOM", sourcePid: 7777 }]
    });
    const byExe = await d.startGameStream({ exePath: "C:\\Games\\doom.exe", pid: 4242, name: "Doom" });
    assert.equal(byExe.ok, true);
    assert.equal(calls[0][2].pid, 7777);
    assert.equal(calls[0][2].sourceName, "Doom");
  });
  it("fails clearly when the saved game is no longer running", async () => {
    const { d } = streamBridge({ games: [{ lastFocused: 1, name: "Other", pid: 1111 }] });
    const res = await d.startGameStream({ pid: 4242, name: "Doom" });
    assert.equal(res.ok, false);
    assert.match(res.message, /Refresh this keybind/);
  });
  it("prefers the application source for game identity", async () => {
    const { calls, d } = streamBridge({
      sources: [
        { id: "window:2:0", name: "DOOM", sourcePid: 4242 },
        { id: "application:9", name: "Doom", sourcePid: 4242, type: "application" }
      ]
    });
    const res = await d.startGameStream();
    assert.equal(res.ok, true);
    assert.equal(calls[0][2].sourceId, "application:9");
    assert.equal(calls[0][2].pid, 4242);
    assert.equal(calls[0][2].sourceName, "Doom");
  });
  it("maps Discord 2015 and retries the game via screen", async () => {
    const { calls, d } = streamBridge({
      sources: [
        { id: "window:2:0", name: "DOOM", sourcePid: 4242 },
        { id: "screen:0:0", name: "Screen 1" }
      ],
      startFn: async (guildId, channelId, opts, live) => {
        if (String(opts.sourceId).startsWith("window:")) {
          const err = new Error("Video stream timeout (Viewer) 2015");
          err.code = 2015;
          throw err;
        }
        live.stream = { channelId, guildId, ownerId: "u1", streamType: "guild" };
      }
    });
    const res = await d.startGameStream();
    assert.equal(res.ok, true);
    assert.equal(res.message, "Streaming Doom (screen)");
    assert.equal(calls.length, 3);
    assert.equal(calls[0][2].sourceId, "window:2:0");
    assert.equal(calls[0][2].pid, 4242);
    assert.equal(calls[1][2].sourceId, "window:2:0");
    assert.equal(calls[1][2].pid, null);
    assert.equal(calls[1][2].sourceName, "Doom");
    assert.equal(calls[2][2].sourceId, "screen:0:0");
    assert.equal(calls[2][2].previewDisabled, false);
  });
  it("falls back to the primary screen when the game window is missing", async () => {
    const { calls, d } = streamBridge({
      sources: [
        { id: "window:9:0", name: "Discord", sourcePid: 999 },
        { id: "screen:0:0", name: "Screen 1" }
      ]
    });
    const res = await d.startGameStream();
    assert.equal(res.ok, true);
    assert.equal(res.message, "Streaming Doom (screen)");
    assert.equal(calls[0][2].sourceId, "screen:0:0");
  });
  it("maps numeric stream errors", () => {
    const d = new DiscordBridge({});
    assert.match(d.describeStreamFailure({ code: 2015 }, "Doom").message, /error 2015/);
    assert.match(d.describeStreamFailure(new Error("fail 2001 now"), "Doom").message, /error 2001/);
    assert.equal(d.describeStreamFailure(new Error("nope"), "Doom").code, null);
  });
  it("stops the own stream and no-ops when idle", async () => {
    const idle = streamBridge({});
    assert.equal((await idle.d.stopOwnStream()).message, "Not streaming.");
    const live = streamBridge({ selfStream: { channelId: "vc1", guildId: "g1", ownerId: "u1", streamType: "guild" } });
    const res = await live.d.stopOwnStream();
    assert.equal(res.ok, true);
    assert.equal(res.message, "Stream stopped.");
  });
  it("toggles between start and stop", async () => {
    const idle = streamBridge({});
    assert.equal((await idle.d.toggleGameStream()).message, "Streaming Doom");
    const live = streamBridge({ selfStream: { channelId: "vc1", guildId: "g1", ownerId: "u1", streamType: "guild" } });
    assert.equal((await live.d.toggleGameStream()).message, "Stream stopped.");
    const screenIdle = streamBridge({ sources: [{ id: "screen:0:0", name: "Screen 1" }] });
    assert.equal((await screenIdle.d.toggleScreenStream()).message, "Streaming Screen 1");
    const screenLive = streamBridge({ selfStream: { channelId: "vc1", guildId: "g1", ownerId: "u1", streamType: "guild" } });
    assert.equal((await screenLive.d.toggleScreenStream()).message, "Stream stopped.");
  });
  it("falls back to voice-state channel lookup", async () => {
    const d = new DiscordBridge({});
    d.cache.set("selectedChannel", { getVoiceChannelId: () => null });
    d.cache.set("userStore", { getCurrentUser: () => ({ id: "u1" }) });
    d.cache.set("voiceState", { getVoiceStateForUser: (id) => (id === "u1" ? { channelId: "vc9" } : null) });
    assert.equal(d.getVoiceChannelId(), "vc9");
  });
});

describe("stream tracking", () => {
  it("tracks and clears the announced key", () => {
    const subs = {};
    const flux = {
      subscribe: (type, fn) => { subs[type] = fn; },
      unsubscribe: (type) => { delete subs[type]; }
    };
    const d = new DiscordBridge({});
    d.cache.set("flux", flux);
    d.subscribeStreamEvents();
    subs.STREAM_CREATE("guild:g:c:u");
    assert.equal(d.streamKey, "guild:g:c:u");
    subs.STREAM_DELETE();
    assert.equal(d.streamKey, null);
    d.unsubscribeStreamEvents();
    assert.deepEqual(Object.keys(subs), []);
  });
});

describe("inspectNativeModules", () => {
  it("records keys of present modules and caches", () => {
    const prev = globalThis.DiscordNative;
    let requires = 0;
    globalThis.DiscordNative = {
      nativeModules: {
        requireModule: (name) => {
          requires += 1;
          if (name === "discord_voice") return { getStats: () => {}, setDevice: () => {} };
          throw new Error("missing");
        }
      }
    };
    try {
      const d = new DiscordBridge({});
      assert.deepEqual(d.inspectNativeModules(), { discord_voice: ["getStats", "setDevice"] });
      assert.equal(requires, 14);
      assert.equal(d.inspectNativeModules(), d.inspectNativeModules());
    } finally {
      if (prev === undefined) delete globalThis.DiscordNative;
      else globalThis.DiscordNative = prev;
    }
  });
});

describe("streaming probe", () => {
  it("reports streaming state and native modules", () => {
    const d = new DiscordBridge({});
    const p = d.probe();
    assert.equal(typeof p.streaming, "object");
    assert.equal(p.streaming.ready, false);
    assert.equal(p.streaming.games, null);
    assert.equal(p.streaming.selfStream, false);
    assert.deepEqual(p.nativeModules, {});
    const text = d.diagnosticsText("HEADER");
    assert.match(text, /streamFns:/);
    assert.match(text, /nativeModules: none/);
    assert.match(d.probeSummary(), /stm:MISS live:n/);
  });
});

describe("soundboard", () => {
  function soundBridge({ deafened = false, inVoice = true, muted = false, playing = true, post = null, restApi = null, sounds = null } = {}) {
    const calls = [];
    const d = new DiscordBridge({});
    d.cache.set("selectedChannel", { getVoiceChannelId: () => (inVoice ? "vc1" : null) });
    d.cache.set("mediaEngine", { isSelfDeaf: () => deafened, isSelfMute: () => muted });
    d.cache.set("soundboard", {
      getSounds: () => new Map([["g1", sounds ?? [
        { available: false, guildId: "g1", name: "Retired", soundId: "s0" },
        { available: true, emojiId: null, emojiName: "📯", guildId: "g1", name: "Horn", soundId: "s1" },
        { available: true, emojiId: "e2", emojiName: null, guildId: "g1", name: "Drum", soundId: "s2" }
      ]]]),
      getSoundsForGuild: () => null,
      isPlayingSound: (id) => playing && id === "s1",
      isUserPlayingSounds: () => false
    });
    if (restApi !== false) {
      d.cache.set("restApi", restApi || {
        del: async () => {},
        post: post || (async ({ body, url }) => { calls.push(["post", url, body]); }),
        put: async () => {}
      });
    }
    return { calls, d };
  }
  it("lists available sounds sorted by name", () => {
    const { d } = soundBridge({});
    assert.deepEqual(d.listSoundboardSounds(), [
      { available: true, emojiId: "e2", emojiName: null, guildId: "g1", name: "Drum", soundId: "s2" },
      { available: true, emojiId: null, emojiName: "📯", guildId: "g1", name: "Horn", soundId: "s1" }
    ]);
  });
  it("plays via REST broadcast with spec body", async () => {
    const { calls, d } = soundBridge({});
    const res = await d.playSoundboardSound({ soundId: "s1", soundName: "Horn", sourceGuildId: "g1" });
    assert.equal(res.ok, true);
    assert.equal(res.message, "Playing Horn");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], ["post", "/channels/vc1/send-soundboard-sound", {
      sound_id: "s1",
      source_guild_id: "g1"
    }]);
  });
  it("omits source guild when unknown and never sends emoji", async () => {
    const { calls, d } = soundBridge({
      sounds: [{ available: true, name: "Air", soundId: "s9" }]
    });
    // Drop the Map-key guild fallback so the sound is guildless.
    d.cache.set("soundboard", {
      getSounds: () => [{ available: true, name: "Air", soundId: "s9" }],
      getSoundsForGuild: () => null,
      isPlayingSound: (id) => id === "s9"
    });
    const res = await d.playSoundboardSound({ soundId: "s9", soundName: "Air" });
    assert.equal(res.ok, true);
    assert.deepEqual(calls[0][2], { sound_id: "s9" });
  });
  it("rejects missing sound, voice, and muted states", async () => {
    const { d } = soundBridge({});
    assert.match((await d.playSoundboardSound({})).message, /Pick a sound/);
    assert.match((await soundBridge({ inVoice: false }).d.playSoundboardSound({ soundId: "s1" })).message, /Join a voice channel/);
    assert.match((await soundBridge({ muted: true }).d.playSoundboardSound({ soundId: "s1" })).message, /Unmute/);
    assert.match((await soundBridge({ deafened: true }).d.playSoundboardSound({ soundId: "s1" })).message, /Undeafen/);
  });
  it("names the missing request module", async () => {
    assert.match((await soundBridge({ restApi: false }).d.playSoundboardSound({ soundId: "s1" })).message, /request module/);
  });
  it("fails clearly for stale sounds", async () => {
    const { d } = soundBridge({});
    const res = await d.playSoundboardSound({ soundId: "sx", soundName: "Gone" });
    assert.equal(res.ok, false);
    assert.match(res.message, /Refresh this keybind/);
  });
  it("rejects stale ids via getSoundById when the list is empty", async () => {
    const d = new DiscordBridge({});
    d.cache.set("selectedChannel", { getVoiceChannelId: () => "vc1" });
    d.cache.set("mediaEngine", { isSelfDeaf: () => false, isSelfMute: () => false });
    d.cache.set("soundboard", {
      getSounds: () => new Map(),
      getSoundsForGuild: () => [],
      getSoundById: () => null,
      isPlayingSound: () => false
    });
    d.cache.set("restApi", { del: async () => {}, post: async () => {}, put: async () => {} });
    const res = await d.playSoundboardSound({ soundId: "sx", soundName: "Gone" });
    assert.equal(res.ok, false);
    assert.match(res.message, /Refresh this keybind/);
  });
  it("does not confirm playback from another active sound", async () => {
    const { d } = soundBridge({
      playing: false,
      post: async () => {}
    });
    d.cache.set("soundboard", {
      getSounds: () => new Map([["g1", [{ available: true, emojiName: "📯", guildId: "g1", name: "Horn", soundId: "s1" }]]]),
      getSoundsForGuild: () => null,
      isPlayingSound: (id) => id === "other",
      isUserPlayingSounds: () => true
    });
    const res = await d.playSoundboardSound({ soundId: "s1", soundName: "Horn" });
    assert.equal(res.ok, true);
    assert.match(res.message, /couldn't confirm/);
  });
  it("reports send failures", async () => {
    const { d } = soundBridge({ post: async () => { throw new Error("network down"); } });
    const res = await d.playSoundboardSound({ soundId: "s1", soundName: "Horn" });
    assert.equal(res.ok, false);
    assert.equal(res.message, "Couldn't play Horn: network down");
  });
  it("extracts text from discord-shaped errors", () => {
    const d = new DiscordBridge({});
    assert.equal(d.soundboardErrorText(new Error("boom")), "boom");
    assert.equal(d.soundboardErrorText({ body: { message: "Missing Permissions" }, status: 403 }), "Missing Permissions");
    assert.equal(d.soundboardErrorText({ status: 400 }), "request failed (code 400)");
    assert.equal(d.soundboardErrorText(null), "unknown error");
    assert.equal(d.soundboardErrorText({}), "unknown error");
  });
  it("maps rate limits to the cooldown message", async () => {
    const limited = soundBridge({ post: async () => { throw Object.assign(new Error("429"), { status: 429 }); } });
    assert.match((await limited.d.playSoundboardSound({ soundId: "s1" })).message, /one per 5 seconds/);
    const d = new DiscordBridge({});
    assert.equal(d.isRateLimit({ status: 429 }), true);
    assert.equal(d.isRateLimit(new Error("rate limited")), true);
    assert.equal(d.isRateLimit(new Error("nope")), false);
  });
  it("fails when broadcast needs premium", async () => {
    const premiumErr = () => { throw new Error("This action requires a premium subscription"); };
    const { d } = soundBridge({ post: premiumErr });
    const res = await d.playSoundboardSound({ soundId: "s1", soundName: "Horn" });
    assert.equal(res.ok, false);
    assert.match(res.message, /Couldn't play Horn/);
    assert.match(res.message, /premium subscription/);
  });
  it("reports unconfirmed plays as success", async () => {
    const { d } = soundBridge({ playing: false });
    const res = await d.playSoundboardSound({ soundId: "s1", soundName: "Horn" });
    assert.equal(res.ok, true);
    assert.match(res.message, /couldn't confirm/);
  });
  it("probes soundboard readiness without local preview", () => {
    const { d } = soundBridge({});
    assert.deepEqual(d.probeSoundboard(), { localPlay: false, localPlayArity: null, ready: true, restApi: true, sounds: 2, store: true, voiceChannel: "vc1" });
    assert.match(d.probeSummary(), /sb:ok snd:2/);
    assert.match(d.diagnosticsText("HEADER"), /soundboard: store found, rest found, localPlay MISSING/);
    assert.match(d.diagnosticsText("HEADER"), /sounds: 2/);
  });
  it("degrades without modules", async () => {
    const d = new DiscordBridge({});
    assert.deepEqual(d.listSoundboardSounds(), []);
    assert.equal(d.probeSoundboard().ready, false);
    assert.match((await d.playSoundboardSound({ soundId: "s1" })).message, /Join a voice channel/);
    assert.match(d.probeSummary(), /sb:MISS/);
  });
});

describe("getSoundboardLocalPlayFn", () => {
  function handler(action) {
    return action && action.type === 'type:"GUILD_SOUNDBOARD_SOUND_PLAY_LOCALLY"';
  }
  function creator(channelId, sound, trigger) {
    void channelId;
    void sound;
    void trigger;
    return 'type:"GUILD_SOUNDBOARD_SOUND_PLAY_LOCALLY"';
  }
  it("prefers creator-shaped matches over handlers", () => {
    const d = new DiscordBridge({
      Webpack: {
        Filters: {},
        getModule: () => null,
        getModules: () => [{ onEvent: handler }, { play: creator }]
      }
    });
    assert.equal(d.getSoundboardLocalPlayFn(), creator);
  });
  it("takes the fast path without enumeration", () => {
    const d = new DiscordBridge({
      Webpack: {
        Filters: {},
        getModule: (filter) => {
          const container = { play: creator };
          try {
            return filter(container) ? container : null;
          } catch {
            return null;
          }
        }
      }
    });
    assert.equal(d.getSoundboardLocalPlayFn(), creator);
  });
  it("ignores handler-shaped matches and caches misses", () => {
    const solo = new DiscordBridge({
      Webpack: {
        Filters: {},
        getModule: (filter) => {
          const container = { onEvent: handler };
          try {
            return filter(container) ? container : null;
          } catch {
            return null;
          }
        }
      }
    });
    assert.equal(solo.getSoundboardLocalPlayFn(), null);
    let sweeps = 0;
    const missing = new DiscordBridge({
      Webpack: {
        Filters: {},
        getModule: () => null,
        getModules: () => { sweeps += 1; return []; }
      }
    });
    assert.equal(missing.getSoundboardLocalPlayFn(), null);
    assert.equal(missing.getSoundboardLocalPlayFn(), null);
    assert.equal(sweeps, 2);
  });
  it("retries webpack lookup on forceLookup after a miss throttle", () => {
    let searches = 0;
    const d = new DiscordBridge({
      Webpack: {
        Filters: {},
        getModule: () => null,
        getModules: () => { searches += 1; return []; }
      }
    });
    assert.equal(d.getSoundboardLocalPlayFn(), null);
    assert.equal(searches, 2);
    assert.equal(d.getSoundboardLocalPlayFn(), null);
    assert.equal(searches, 2);
    assert.equal(d.getSoundboardLocalPlayFn({ forceLookup: true }), null);
    assert.equal(searches, 4);
  });
});
