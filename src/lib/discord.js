"use strict";

const { extractKeycodeMap } = require("./keybinds");
const { amplitudeToSlider, roundVolume, sliderToAmplitude } = require("./volume");

// Lazy, fault-tolerant access to Discord's internal webpack modules.
// Every getter returns null (never throws) so Discord client updates
// degrade to per-action errors instead of breaking the whole plugin.
class DiscordBridge {
  constructor(BdApi, log = null) {
    this.BdApi = BdApi;
    this.log = log || null;
    this.cache = new Map();
    this.lastAttempt = new Map();
    this.retryTtlMs = 5000;
    this.utilsTried = false;
    this.utilsCache = null;
    this.keymapCache = new Map();
    this.lastSetOutputVolume = null;
    this.lastSetInputVolume = null;
    this.streamKey = null;
    this.streamSubscribed = false;
    this.onStreamCreate = null;
    this.onStreamDelete = null;
    this.nativeCache = null;
  }

  debug(message) {
    try {
      this.log?.debug("discord", message);
    } catch { /* logging never breaks the bridge */ }
  }

  info(message) {
    try {
      this.log?.info("discord", message);
    } catch { /* logging never breaks the bridge */ }
  }

  warn(message) {
    try {
      this.log?.warn("discord", message);
    } catch { /* logging never breaks the bridge */ }
  }

  refresh() {
    this.cache.clear();
    this.lastAttempt.clear();
    this.utilsTried = false;
    this.utilsCache = null;
    this.keymapCache.clear();
    this.nativeCache = null;
  }

  // Resolve a Flux store by registered name. Immune to method renames,
  // so it runs before prop filters in every store getter.
  getStoreByName(name) {
    const Webpack = this.BdApi?.Webpack;
    try {
      const mapped = Webpack?.Stores?.[name];
      if (mapped && (typeof mapped === "object" || typeof mapped === "function")) return mapped;
    } catch { /* ignore */ }
    try {
      if (typeof Webpack?.getStore === "function") {
        const store = Webpack.getStore.call(Webpack, name);
        if (store && (typeof store === "object" || typeof store === "function")) return store;
      }
    } catch { /* ignore */ }
    try {
      const byStoreName = Webpack?.Filters?.byStoreName;
      if (byStoreName && typeof Webpack?.getModule === "function") {
        const store = Webpack.getModule(byStoreName(name));
        if (store && (typeof store === "object" || typeof store === "function")) return store;
      }
    } catch { /* ignore */ }
    return null;
  }

  findModule(filter, { searchExports = true } = {}) {
    const BdApi = this.BdApi;
    if (BdApi?.Webpack?.getModule) {
      try {
        return BdApi.Webpack.getModule(filter, { searchExports }) || null;
      } catch (error) {
        this.warn(`Webpack.getModule threw: ${error?.message || error}`);
      }
    }
    if (typeof BdApi?.findModule === "function") {
      try {
        return BdApi.findModule(filter) || null;
      } catch (error) {
        this.warn(`legacy findModule threw: ${error?.message || error}`);
      }
    }
    return null;
  }

  findByProps(...props) {
    const Webpack = this.BdApi?.Webpack;
    try {
      if (typeof Webpack?.getByKeys === "function") {
        const hit = Webpack.getByKeys(...props, { searchExports: true }) || null;
        if (hit) return hit;
      }
    } catch (error) {
      this.warn(`getByKeys threw: ${error?.message || error}`);
    }
    try {
      const byKeys = Webpack?.Filters?.byKeys;
      if (byKeys && typeof Webpack?.getModule === "function") {
        const hit = Webpack.getModule(byKeys(...props), { searchExports: true }) || null;
        if (hit) return hit;
      }
    } catch (error) {
      this.warn(`byKeys threw: ${error?.message || error}`);
    }
    try {
      const byProps = Webpack?.Filters?.byProps;
      if (byProps && typeof Webpack?.getModule === "function") {
        return Webpack.getModule(byProps(...props), { searchExports: true }) || null;
      }
    } catch (error) {
      this.warn(`byProps threw: ${error?.message || error}`);
    }
    try {
      if (typeof this.BdApi?.findModuleByProps === "function") {
        return this.BdApi.findModuleByProps(...props) || null;
      }
    } catch (error) {
      this.warn(`legacy findModuleByProps threw: ${error?.message || error}`);
    }
    return this.findModule(
      (m) => m && typeof m === "object" && props.every((p) => m[p] !== undefined),
      { searchExports: true }
    );
  }

  findByStrings(...strings) {
    const Webpack = this.BdApi?.Webpack;
    try {
      if (typeof Webpack?.getByStrings === "function") {
        const hit = Webpack.getByStrings(...strings, { searchExports: true }) || null;
        if (hit) return hit;
      }
    } catch (error) {
      this.warn(`getByStrings threw: ${error?.message || error}`);
    }
    try {
      const byStrings = Webpack?.Filters?.byStrings;
      if (byStrings && typeof Webpack?.getModule === "function") {
        const hit = Webpack.getModule(byStrings(...strings), { searchExports: true }) || null;
        if (hit) return hit;
      }
    } catch (error) {
      this.warn(`byStrings threw: ${error?.message || error}`);
    }
    // Fallback source scan: BD's byStrings can miss function exports on
    // object modules, so scan export function sources directly.
    const mentions = (fn) => {
      try {
        return typeof fn === "function" && strings.every((s) => fn.toString().includes(s));
      } catch {
        return false;
      }
    };
    return this.findModule((m) => {
      if (typeof m === "function") return mentions(m);
      if (m && typeof m === "object") {
        try {
          return Object.values(m).some(mentions);
        } catch {
          return false;
        }
      }
      return false;
    }, { searchExports: true });
  }

  cached(key, resolver) {
    if (this.cache.has(key)) return this.cache.get(key);
    const now = Date.now();
    if (now - (this.lastAttempt.get(key) || 0) < this.retryTtlMs) return null;
    this.lastAttempt.set(key, now);
    let value = null;
    try {
      value = resolver() || null;
    } catch {
      value = null;
    }
    if (value) {
      this.cache.set(key, value);
      this.debug(`webpack resolved ${key} (${this.fingerprint(value)})`);
    } else {
      this.debug(`webpack miss ${key} (will retry)`);
    }
    return value;
  }

  // One-line shape summary so a wrong-module match is visible in the log.
  // Includes prototype methods: class-based stores keep getters there.
  fingerprint(mod, maxKeys = 40) {
    if (!mod || (typeof mod !== "object" && typeof mod !== "function")) return String(mod);
    let keys = [];
    try {
      keys = Object.keys(mod).sort();
    } catch {
      return "?";
    }
    let proto = [];
    try {
      const parent = Object.getPrototypeOf(mod);
      if (parent && parent !== Object.prototype) {
        proto = Object.getOwnPropertyNames(parent).filter((k) => k !== "constructor").sort();
      }
    } catch { /* ignore */ }
    const ctor = mod?.constructor?.name && mod.constructor.name !== "Object" ? ` ctor:${mod.constructor.name}` : "";
    const shown = keys.slice(0, maxKeys).join(",");
    const protoShown = proto.length ? ` proto[${proto.slice(0, 20).join(",")}]${proto.length > 20 ? "…" : ""}` : "";
    return `${keys.length} keys${ctor} [${shown}]${keys.length > maxKeys ? "…" : ""}${protoShown}`;
  }

  getFlux() {
    return this.cached("flux", () => (
      this.findByProps("dispatch", "subscribe", "unsubscribe")
      || this.findModule((m) => typeof m?.dispatch === "function" && typeof m?.subscribe === "function")
    ));
  }

  getMediaEngineStore() {
    return this.cached("mediaEngine", () => {
      const named = this.getStoreByName("MediaEngineStore");
      if (named) {
        this.debug("mediaEngine via getStore");
        return named;
      }
      // Current MediaEngineStore is read-only for volume; setters live on
      // the media-actions module. Do not require setOutputVolume.
      const strong = (m) => m && typeof m === "object" && !m.$$typeof
        && typeof m.getOutputVolume === "function"
        && (typeof m.getMediaEngine === "function"
          || typeof m.getInputVolume === "function"
          || typeof m.isSelfMute === "function");
      return this.findModule(strong, { searchExports: false })
        || this.findModule(strong, { searchExports: true })
        || this.findByProps("getOutputVolume", "getMediaEngine")
        || this.findModule((m) => typeof m?.getOutputVolume === "function");
    });
  }

  getVoiceActions() {
    return this.cached("voiceActions", () => (
      this.findByProps("toggleSelfMute", "toggleSelfDeaf", "setOutputVolume")
      || this.findByProps("toggleSelfMute", "toggleSelfDeaf")
      || this.findModule((m) => typeof m?.toggleSelfMute === "function" && typeof m?.toggleSelfDeaf === "function")
    ));
  }

  getChannelActions() {
    return this.cached("channelActions", () => (
      this.findByProps("selectChannel", "selectVoiceChannel")
      || this.findModule((m) => typeof m?.selectChannel === "function" && typeof m?.selectVoiceChannel === "function")
      || this.findModule((m) => typeof m?.selectChannel === "function")
    ));
  }

  getChannelRouter() {
    return this.cached("channelRouter", () => this.findByProps("transitionToChannel"));
  }

  getMessageActions() {
    return this.cached("messageActions", () => (
      this.findByProps("sendMessage", "editMessage")
      || this.findModule((m) => typeof m?.sendMessage === "function" && typeof m?.receiveMessage === "function")
      || this.findModule((m) => typeof m?.sendMessage === "function")
    ));
  }

  getSelectedChannelStore() {
    return this.cached("selectedChannel", () => (
      this.getStoreByName("SelectedChannelStore")
      || this.findByProps("getCurrentlySelectedChannelId")
      || this.findByProps("getLastSelectedChannelId")
    ));
  }

  getUserStore() {
    return this.cached("userStore", () => (
      this.getStoreByName("UserStore")
      || this.findByProps("getCurrentUser")
    ));
  }

  getRunningGameStore() {
    return this.cached("runningGame", () => (
      this.getStoreByName("RunningGameStore")
      || this.findByProps("getRunningGames", "getVisibleGame")
      || this.findModule((m) => typeof m?.getGameForPID === "function" && typeof m?.getRunningGames === "function")
    ));
  }

  getStreamingStore() {
    return this.cached("streaming", () => (
      this.getStoreByName("ApplicationStreamingStore")
      || this.findByProps("getCurrentUserActiveStream")
    ));
  }

  hasSoundshareState(mod) {
    try {
      if (!mod || typeof mod.getState !== "function") return false;
      const state = mod.getState();
      return Boolean(state) && typeof state === "object" && typeof state.soundshareEnabled === "boolean";
    } catch {
      return false;
    }
  }

  getStreamingSettingsStore() {
    return this.cached("streamingSettings", () => {
      const named = this.getStoreByName("ApplicationStreamingSettingsStore");
      if (named && this.hasSoundshareState(named)) {
        this.debug("streamingSettings via getStore");
        return named;
      }
      const shaped = this.findModule((m) => this.hasSoundshareState(m), { searchExports: true });
      if (shaped) this.debug("streamingSettings via state shape");
      return shaped;
    });
  }

  getSoundboardStore() {
    return this.cached("soundboard", () => (
      this.getStoreByName("SoundboardStore")
      || this.findByProps("getSoundsForGuild", "getSoundById")
      || this.findModule((m) => typeof m?.getSoundsForGuild === "function" && typeof m?.isPlayingSound === "function")
    ));
  }

  getChannelStore() {
    return this.cached("channelStore", () => (
      this.getStoreByName("ChannelStore")
      || this.findByProps("getChannel")
    ));
  }

  getVoiceStateStore() {
    return this.cached("voiceState", () => (
      this.getStoreByName("VoiceStateStore")
      || this.findByProps("getVoiceStateForUser", "getVoiceStatesForChannel")
    ));
  }

  // Module referencing the volume Flux event (actions/handler side).
  // Resolved for diagnostics; never blind-called.
  getAudioActions() {
    return this.cached("audioActions", () => this.findByStrings("AUDIO_SET_OUTPUT_VOLUME"));
  }

  audioActionKeys(maxKeys = 12) {
    const mod = this.getAudioActions();
    if (!mod || (typeof mod !== "object" && typeof mod !== "function")) return [];
    try {
      return Object.keys(mod).sort().slice(0, maxKeys);
    } catch {
      return [];
    }
  }

  dispatch(type, payload = {}) {
    const flux = this.getFlux();
    if (!flux || typeof flux.dispatch !== "function") {
      this.warn(`dispatch ${type} failed: flux unavailable`);
      return { ok: false, message: "Couldn't reach Discord's controls — Discord may have updated." };
    }
    try {
      flux.dispatch({ type, ...payload });
      this.debug(`dispatch ${type} ${JSON.stringify(payload)}`);
      return { ok: true };
    } catch (error) {
      this.warn(`dispatch ${type} threw: ${error?.message || error}`);
      return { ok: false, message: error?.message || String(error) };
    }
  }

  static clampVolume(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.min(100, Math.max(0, Math.round(n)));
  }

  toAmplitude(percent) {
    return sliderToAmplitude(percent);
  }

  toPerceptual(amplitude) {
    return amplitudeToSlider(amplitude);
  }

  readRawVolume(getter) {
    try {
      const v = this.getMediaEngineStore()?.[getter]?.();
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  }

  getOutputVolumeRaw() {
    return this.readRawVolume("getOutputVolume");
  }

  getInputVolumeRaw() {
    return this.readRawVolume("getInputVolume");
  }

  getOutputVolume() {
    const raw = this.getOutputVolumeRaw();
    if (raw === null) return null;
    return roundVolume(this.toPerceptual(raw));
  }

  getInputVolume() {
    const raw = this.getInputVolumeRaw();
    if (raw === null) return null;
    return roundVolume(this.toPerceptual(raw));
  }

  writeVolume(kind, perceptual) {
    const v = DiscordBridge.clampVolume(perceptual);
    if (v === null) return { ok: false, message: "Volume must be between 0 and 100." };
    const amplitude = this.toAmplitude(v);
    const before = kind === "input" ? this.getInputVolume() : this.getOutputVolume();
    const setter = kind === "input" ? "setInputVolume" : "setOutputVolume";
    const fluxType = kind === "input" ? "AUDIO_SET_INPUT_VOLUME" : "AUDIO_SET_OUTPUT_VOLUME";
    const getterRaw = kind === "input" ? "getInputVolumeRaw" : "getOutputVolumeRaw";
    let viaActions = false;
    try {
      const voice = this.getVoiceActions();
      if (voice && typeof voice[setter] === "function") {
        voice[setter](amplitude);
        viaActions = true;
      }
    } catch (error) {
      this.debug(`voice ${setter} threw: ${error?.message || error}`);
    }
    const res = this.dispatch(fluxType, { volume: amplitude });
    let direct = false;
    try {
      const store = this.getMediaEngineStore();
      if (store && typeof store[setter] === "function") {
        store[setter](amplitude);
        direct = true;
      }
    } catch { /* actions/flux paths above are primary */ }
    const label = kind === "input" ? "input" : "output";
    const friendly = kind === "input" ? "Microphone volume" : "Speaker volume";
    if (!viaActions && !res.ok && !direct) {
      this.warn(`${label} volume: no write path available`);
      return { ok: false, message: `Couldn't reach Discord's ${kind === "input" ? "microphone" : "speaker"} controls — Discord may have updated.` };
    }
    const via = [viaActions && "actions", res.ok && "flux", direct && "direct"].filter(Boolean).join("+");
    if (this[getterRaw]() === null) {
      if (kind === "input") this.lastSetInputVolume = v;
      else this.lastSetOutputVolume = v;
      const out = { ok: true, message: `${friendly} → ${v}%` };
      this.info(`${label} volume ${before ?? "?"} -> ${v} amp ${amplitude.toFixed(3)} via ${via} (unreadable, tracking): ${out.message}`);
      return out;
    }
    const out = this.verifyVolume(kind === "input" ? "Input" : "Output", before, v);
    if (out.ok) {
      if (kind === "input") this.lastSetInputVolume = v;
      else this.lastSetOutputVolume = v;
    }
    this.info(`${label} volume ${before ?? "?"} -> ${v} amp ${amplitude.toFixed(3)} via ${via}: ${out.message}`);
    return out;
  }

  // Writes go through Flux (what Discord's own UI uses) plus a direct store
  // call, then read back the value so toasts report ground truth instead of
  // assuming the write landed. Values are slider percents; the store is amplitude.
  setOutputVolume(value) {
    return this.writeVolume("output", value);
  }

  setInputVolume(value) {
    return this.writeVolume("input", value);
  }

  // Live reading with last-set fallback for toggle/adjust when Discord's
  // volume store isn't readable. Verification always uses raw reads.
  resolveOutputVolume() {
    const live = this.getOutputVolume();
    if (live !== null) return { tracked: false, value: live };
    if (this.lastSetOutputVolume !== null) {
      this.debug(`output volume unreadable; using tracked ${this.lastSetOutputVolume}`);
      return { tracked: true, value: this.lastSetOutputVolume };
    }
    return { tracked: false, value: null };
  }

  resolveInputVolume() {
    const live = this.getInputVolume();
    if (live !== null) return { tracked: false, value: live };
    if (this.lastSetInputVolume !== null) {
      this.debug(`input volume unreadable; using tracked ${this.lastSetInputVolume}`);
      return { tracked: true, value: this.lastSetInputVolume };
    }
    return { tracked: false, value: null };
  }

  verifyVolume(label, before, wanted) {
    const friendly = label === "Input" ? "Microphone volume" : "Speaker volume";
    const after = label === "Input" ? this.getInputVolume() : this.getOutputVolume();
    if (after === null) return { ok: true, message: `${friendly} → ${wanted}% (couldn't confirm)` };
    if (Math.abs(after - wanted) > 1) {
      return { ok: false, message: `${friendly} didn't change — still ${Math.round(after)}%` };
    }
    const from = before === null ? "?" : `${Math.round(before)}%`;
    return { ok: true, message: `${friendly} ${from} → ${wanted}%` };
  }

  readFlag(candidates) {
    const store = this.getMediaEngineStore();
    if (!store) return null;
    for (const key of candidates) {
      try {
        if (typeof store[key] === "function") {
          const v = store[key]();
          if (typeof v === "boolean") return v;
        }
      } catch { /* try next */ }
    }
    return null;
  }

  isSelfMute() {
    return this.readFlag(["isSelfMute", "isSelfMuted", "isMute", "isMuted"]);
  }

  isSelfDeaf() {
    return this.readFlag(["isSelfDeaf", "isSelfDeafened", "isDeaf", "isDeafened"]);
  }

  toggleSelfMute() {
    const done = () => {
      const state = this.isSelfMute();
      if (state === true) return { ok: true, message: "Muted" };
      if (state === false) return { ok: true, message: "Unmuted" };
      return { ok: true, message: "Mute toggled" };
    };
    try {
      const voice = this.getVoiceActions();
      if (voice && typeof voice.toggleSelfMute === "function") {
        voice.toggleSelfMute();
        return done();
      }
    } catch { /* Flux fallback below */ }
    const res = this.dispatch("AUDIO_TOGGLE_SELF_MUTE", { context: "default", syncRemote: true });
    return res.ok ? done() : res;
  }

  toggleSelfDeaf() {
    const done = () => {
      const state = this.isSelfDeaf();
      if (state === true) return { ok: true, message: "Deafened" };
      if (state === false) return { ok: true, message: "Undeafened" };
      return { ok: true, message: "Deafen toggled" };
    };
    try {
      const voice = this.getVoiceActions();
      if (voice && typeof voice.toggleSelfDeaf === "function") {
        voice.toggleSelfDeaf();
        return done();
      }
    } catch { /* Flux fallback below */ }
    const res = this.dispatch("AUDIO_TOGGLE_SELF_DEAF", { context: "default", syncRemote: true });
    return res.ok ? done() : res;
  }

  setSelfMute(muted) {
    const state = this.isSelfMute();
    if (state === muted) return { ok: true, message: muted ? "Already muted" : "Already unmuted" };
    if (state !== null) return this.toggleSelfMute();
    try {
      const voice = this.getVoiceActions();
      if (voice && typeof voice.setSelfMute === "function") {
        voice.setSelfMute(muted);
        return { ok: true, message: muted ? "Muted" : "Unmuted" };
      }
    } catch { /* Flux fallback below */ }
    const res = this.dispatch("AUDIO_SET_SELF_MUTE", { mute: muted });
    return res.ok ? { ok: true, message: muted ? "Muted" : "Unmuted" } : res;
  }

  setSelfDeaf(deafened) {
    const state = this.isSelfDeaf();
    if (state === deafened) return { ok: true, message: deafened ? "Already deafened" : "Already undeafened" };
    if (state !== null) return this.toggleSelfDeaf();
    try {
      const voice = this.getVoiceActions();
      if (voice && typeof voice.setSelfDeaf === "function") {
        voice.setSelfDeaf(deafened);
        return { ok: true, message: deafened ? "Deafened" : "Undeafened" };
      }
    } catch { /* Flux fallback below */ }
    const res = this.dispatch("AUDIO_SET_SELF_DEAF", { deaf: deafened });
    return res.ok ? { ok: true, message: deafened ? "Deafened" : "Undeafened" } : res;
  }

  disconnectVoice() {
    try {
      const actions = this.getChannelActions();
      if (actions && typeof actions.disconnect === "function") {
        actions.disconnect();
        return { ok: true, message: "Left the voice channel" };
      }
      if (actions && typeof actions.selectVoiceChannel === "function") {
        actions.selectVoiceChannel(null);
        return { ok: true, message: "Left the voice channel" };
      }
    } catch (error) {
      this.debug(`voice disconnect threw: ${error?.message || error}`);
    }
    const res = this.dispatch("VOICE_CHANNEL_SELECT", { channelId: null });
    return res.ok ? { ok: true, message: "Left the voice channel" } : { ok: false, message: res.message || "Couldn't leave the voice channel." };
  }

  goToChannel(guildId, channelId) {
    if (!guildId || !channelId) return { ok: false, message: "This keybind needs a server and channel ID." };
    const gid = String(guildId);
    const cid = String(channelId);
    try {
      const actions = this.getChannelActions();
      if (actions && typeof actions.selectChannel === "function") {
        // Current Discord takes a single options object, not (guildId, channelId).
        actions.selectChannel({ channelId: cid, guildId: gid });
        return { ok: true, message: "Switched channel" };
      }
    } catch (error) {
      this.debug(`selectChannel threw: ${error?.message || error}`);
    }
    const res = this.dispatch("CHANNEL_SELECT", { channelId: cid, guildId: gid });
    if (res.ok) return { ok: true, message: "Switched channel" };
    try {
      const router = this.getChannelRouter();
      if (router && typeof router.transitionToChannel === "function") {
        router.transitionToChannel(cid);
        return { ok: true, message: "Switched channel" };
      }
    } catch (error) {
      return { ok: false, message: error?.message || String(error) };
    }
    return { ok: false, message: "Couldn't switch channels." };
  }

  getCurrentTextChannelId() {
    try {
      const store = this.getSelectedChannelStore();
      if (!store) return null;
      for (const key of ["getCurrentlySelectedChannelId", "getChannelId", "getLastSelectedChannelId"]) {
        if (typeof store[key] === "function") {
          const id = store[key]();
          if (id) return String(id);
        }
      }
    } catch { /* ignore */ }
    return null;
  }

  async sendMessage(channelId, content) {
    if (!channelId) return { ok: false, message: "Couldn't send — no channel is open." };
    if (!content || !String(content).trim()) return { ok: false, message: "Couldn't send — the message is empty." };
    if (String(content).length > 2000) return { ok: false, message: "Couldn't send — the message is over 2000 characters." };
    const actions = this.getMessageActions();
    if (!actions || typeof actions.sendMessage !== "function") {
      return { ok: false, message: "Couldn't reach Discord's messaging — Discord may have updated." };
    }
    try {
      const res = actions.sendMessage(String(channelId), {
        content: String(content),
        invalidEmojis: [],
        tts: false,
        validNonShortcutEmojis: []
      });
      if (res && typeof res.then === "function") await res;
      return { ok: true, message: "Message sent" };
    } catch (error) {
      return { ok: false, message: error?.message || String(error) };
    }
  }

  // ---- streaming (Go Live) ----

  // Pull the function whose own source contains the needle out of a
  // string-matched module. Rejects near-misses from token-only matches.
  extractCodeFn(mod, needle) {
    const mentions = (fn) => {
      try {
        return typeof fn === "function" && fn.toString().includes(needle);
      } catch {
        return false;
      }
    };
    if (mentions(mod)) return mod;
    if (mod && typeof mod === "object") {
      try {
        for (const value of Object.values(mod)) {
          if (mentions(value)) return value;
        }
      } catch { /* ignore */ }
    }
    return null;
  }

  // All functions in a module whose own source contains the needle, for
  // callers that discriminate matches by arity instead of taking the first.
  extractCodeFns(mod, needle) {
    const out = [];
    const mentions = (fn) => {
      try {
        return typeof fn === "function" && fn.toString().includes(needle);
      } catch {
        return false;
      }
    };
    if (mentions(mod)) out.push(mod);
    if (mod && typeof mod === "object") {
      try {
        for (const value of Object.values(mod)) {
          if (mentions(value)) out.push(value);
        }
      } catch { /* ignore */ }
    }
    return out;
  }

  // Find an action creator by a string literal in its source (same idea as
  // Vencord's findByCode). Misses cache for 60s: the full sweep is slow.
  findCodeFunction(needle) {
    const key = `code:${needle}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const now = Date.now();
    if (now - (this.lastAttempt.get(key) || 0) < 60000) return null;
    this.lastAttempt.set(key, now);
    let fn = null;
    try {
      fn = this.extractCodeFn(this.findByStrings(needle), needle);
      if (!fn) {
        const mods = this.getAllModules(() => true, { searchExports: true });
        if (mods) {
          for (const mod of mods) {
            fn = this.extractCodeFn(mod, needle);
            if (fn) break;
          }
        }
      }
    } catch {
      fn = null;
    }
    if (fn) {
      this.cache.set(key, fn);
      this.debug(`webpack resolved ${key} (${this.fingerprint(fn)})`);
    } else {
      this.debug(`webpack miss ${key} (will retry)`);
    }
    return fn;
  }

  getMediaEngine() {
    try {
      const engine = this.getMediaEngineStore()?.getMediaEngine?.();
      return engine && (typeof engine === "object" || typeof engine === "function") ? engine : null;
    } catch {
      return null;
    }
  }

  getChannel(channelId) {
    try {
      const store = this.getChannelStore();
      if (!store || !channelId) return null;
      const id = String(channelId);
      if (typeof store.getChannel === "function") {
        const channel = store.getChannel(id);
        if (channel) return channel;
      }
      if (typeof store.getBasicChannel === "function") {
        return store.getBasicChannel(id) || null;
      }
    } catch { /* ignore */ }
    return null;
  }

  getVoiceChannelId() {
    try {
      const selected = this.getSelectedChannelStore();
      if (typeof selected?.getVoiceChannelId === "function") {
        const id = selected.getVoiceChannelId();
        if (id) return String(id);
      }
    } catch { /* voice-state fallback below */ }
    try {
      const store = this.getVoiceStateStore();
      if (typeof store?.getCurrentClientVoiceChannelId === "function") {
        const id = store.getCurrentClientVoiceChannelId();
        if (id) return String(id);
      }
      const me = this.getUserStore()?.getCurrentUser?.()?.id;
      if (me && typeof store?.getUserVoiceChannelId === "function") {
        const id = store.getUserVoiceChannelId(me);
        if (id) return String(id);
      }
      const state = me && typeof store?.getVoiceStateForUser === "function"
        ? store.getVoiceStateForUser(me)
        : null;
      if (state?.channelId) return String(state.channelId);
    } catch { /* ignore */ }
    return null;
  }

  getSelfStream() {
    try {
      const store = this.getStreamingStore();
      if (store && typeof store.getCurrentUserActiveStream === "function") {
        return store.getCurrentUserActiveStream() || null;
      }
    } catch { /* ignore */ }
    return null;
  }

  extractStreamKey(payload) {
    if (typeof payload === "string" && payload.includes(":")) return payload;
    if (!payload || typeof payload !== "object") return null;
    for (const key of ["streamKey", "stream_key"]) {
      if (typeof payload[key] === "string" && payload[key]) return payload[key];
    }
    return null;
  }

  channelGuildId(channel) {
    if (!channel || typeof channel !== "object") return null;
    const id = channel.guild_id ?? channel.guildId ?? null;
    return id == null ? null : String(id);
  }

  // Prefer the key Discord announced (STREAM_CREATE), then the stream's own
  // key, then the documented type:guild:channel:owner construction.
  resolveStreamKey(stream = null) {
    if (this.streamKey) return this.streamKey;
    const s = stream || this.getSelfStream();
    if (!s || typeof s !== "object") return null;
    const explicit = this.extractStreamKey(s);
    if (explicit) return explicit;
    const parts = [s.guildId ?? s.guild_id, s.channelId ?? s.channel_id, s.ownerId ?? s.owner_id]
      .filter(Boolean)
      .map(String);
    const streamType = s.streamType || s.stream_type;
    if (streamType && parts.length >= 2) return `${streamType}:${parts.join(":")}`;
    return null;
  }

  subscribeStreamEvents() {
    if (this.streamSubscribed) return;
    const flux = this.getFlux();
    if (!flux || typeof flux.subscribe !== "function") return;
    this.onStreamCreate = (payload) => {
      try {
        const key = this.extractStreamKey(payload);
        if (key) {
          this.streamKey = key;
          this.debug(`stream key tracked: ${key}`);
        }
      } catch { /* ignore */ }
    };
    this.onStreamDelete = () => {
      this.streamKey = null;
      this.debug("stream key cleared");
    };
    try {
      flux.subscribe("STREAM_CREATE", this.onStreamCreate);
      flux.subscribe("STREAM_DELETE", this.onStreamDelete);
      this.streamSubscribed = true;
    } catch { /* ignore */ }
  }

  unsubscribeStreamEvents() {
    if (!this.streamSubscribed) return;
    this.streamSubscribed = false;
    try {
      const flux = this.getFlux();
      if (flux && typeof flux.unsubscribe === "function") {
        if (this.onStreamCreate) flux.unsubscribe("STREAM_CREATE", this.onStreamCreate);
        if (this.onStreamDelete) flux.unsubscribe("STREAM_DELETE", this.onStreamDelete);
      }
    } catch { /* ignore */ }
    this.onStreamCreate = null;
    this.onStreamDelete = null;
    this.streamKey = null;
  }

  // Discord's own foreground game first, else the most recently focused
  // running game (launchers last). Never throws.
  pickGame() {
    const store = this.getRunningGameStore();
    if (!store) return { detection: null, game: null, reason: "store-missing" };
    let detection = null;
    try {
      if (typeof store.isDetectionEnabled === "function") detection = store.isDetectionEnabled() !== false;
    } catch { /* ignore */ }
    try {
      if (typeof store.getVisibleGame === "function") {
        const visible = store.getVisibleGame();
        if (visible && !visible.hidden) return { detection, game: visible, reason: "visible" };
      }
    } catch { /* ignore */ }
    let running = [];
    try {
      if (typeof store.getRunningGames === "function") running = store.getRunningGames() || [];
    } catch { /* ignore */ }
    if (!Array.isArray(running)) running = [];
    const usable = running.filter((g) => g && !g.hidden);
    usable.sort((a, b) => {
      const launcher = (a.isLauncher ? 1 : 0) - (b.isLauncher ? 1 : 0);
      if (launcher !== 0) return launcher;
      return (Number(b.lastFocused) || 0) - (Number(a.lastFocused) || 0);
    });
    if (usable.length) return { detection, game: usable[0], reason: "running" };
    return { detection, game: null, reason: detection === false ? "disabled" : "none" };
  }

  classifySource(source) {
    if (!source || source.id == null) return null;
    const id = String(source.id);
    const type = String(source.type || "").toLowerCase();
    const name = String(source.name || "");
    const displayId = source.display_id ?? source.displayId;
    if (
      type === "screen" || type === "monitor" || type === "display"
      || id.startsWith("screen:") || id.startsWith("monitor:") || id.startsWith("desktop:")
      || displayId != null && displayId !== ""
      || /^(entire\s+)?(screen|display|monitor)\b/i.test(name)
    ) return "screen";
    if (type === "window" || id.startsWith("window:")) return "window";
    if (type === "application" || id.startsWith("application:")) return "application";
    return type || "unknown";
  }

  isScreenSource(source) {
    return this.classifySource(source) === "screen";
  }

  isApplicationSource(source) {
    return this.classifySource(source) === "application";
  }

  screenIndex(source) {
    const id = String(source?.id || "");
    const match = /^screen:(\d+)/i.exec(id) || /^monitor:(\d+)/i.exec(id);
    if (match) return Number(match[1]);
    return 999;
  }

  listScreenSourcesFrom(sources) {
    if (!Array.isArray(sources)) return [];
    return sources.filter((s) => this.isScreenSource(s));
  }

  listGames() {
    const store = this.getRunningGameStore();
    const seen = new Set();
    const out = [];
    const push = (game) => {
      if (!game || game.hidden) return;
      const pid = Number(game.pid);
      const name = String(game.name || "").trim();
      const key = Number.isFinite(pid) && pid > 0 ? `pid:${pid}` : name.toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({
        exePath: String(game.exePath || ""),
        name: name || "Game",
        pid: Number.isFinite(pid) && pid > 0 ? pid : null
      });
    };
    try {
      push(store?.getVisibleGame?.());
    } catch { /* ignore */ }
    let running = [];
    try {
      running = store?.getRunningGames?.() || [];
    } catch { /* ignore */ }
    if (!Array.isArray(running)) running = [];
    const usable = running.filter((g) => g && !g.hidden);
    usable.sort((a, b) => (Number(b.lastFocused) || 0) - (Number(a.lastFocused) || 0));
    for (const game of usable) push(game);
    return out;
  }

  sourceProcessId(source) {
    const pid = Number(source?.sourcePid ?? source?.pid);
    if (Number.isFinite(pid) && pid > 0) return pid;
    // Application sources may encode the pid in the id (application:<pid>).
    // Window ids are HWNDs and must never be parsed as pids.
    const id = String(source?.id || "");
    if (/^application:/i.test(id)) {
      const match = /^application:(\d+)/i.exec(id);
      if (match) {
        const parsed = Number(match[1]);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
    }
    return null;
  }

  // Match a detected game to its capture sources by process ID only.
  // Discord's Go Live resolves game name/icon from the pid, so a fuzzy
  // title match that lands on another app's window streams the wrong
  // window while still reporting the game name. Never guess: when no
  // source carries the game pid, return null and let the caller fall
  // back to an explicitly labeled screen share or fail clearly.
  // Prefers Discord's application source (game identity) over the raw
  // window source when the enumerator returns both for the same pid.
  matchGameSources(sources, game) {
    if (!Array.isArray(sources) || !game) return { application: null, window: null };
    const pid = Number(game.pid);
    if (!Number.isFinite(pid) || pid <= 0) return { application: null, window: null };
    const matches = sources.filter((s) => this.sourceProcessId(s) === pid
      && this.classifySource(s) !== "screen");
    const application = matches.find((s) => this.isApplicationSource(s)) || null;
    const window = matches.find((s) => !this.isApplicationSource(s)) || null;
    return { application, window };
  }

  matchGameSource(sources, game) {
    const { application, window } = this.matchGameSources(sources, game);
    return application || window || null;
  }

  // Primary display first (screen:0 / "Screen 1"), then a saved id/name, then any screen.
  pickScreenSource(sources, prefer = {}) {
    const screens = this.listScreenSourcesFrom(sources);
    if (!screens.length) return null;
    const wantedId = String(prefer.sourceId || "").trim();
    if (wantedId) {
      const exact = screens.find((s) => String(s.id) === wantedId);
      if (exact) return exact;
    }
    const wantedName = String(prefer.sourceName || "").trim().toLowerCase();
    if (wantedName) {
      const named = screens.find((s) => String(s.name || "").trim().toLowerCase() === wantedName);
      if (named) return named;
    }
    const primary = screens.find((s) => /^screen:0(?::|$)/i.test(String(s.id)))
      || screens.find((s) => /entire|primary/i.test(String(s.name || "")))
      || screens.find((s) => /^(screen|display|monitor)\s*1\b/i.test(String(s.name || "")));
    if (primary) return primary;
    return screens.slice().sort((a, b) => this.screenIndex(a) - this.screenIndex(b))[0];
  }

  async listScreenSources() {
    try {
      return this.listScreenSourcesFrom(await this.getDesktopSources()).map((s) => ({
        id: String(s.id),
        name: String(s.name || s.id)
      }));
    } catch (error) {
      this.debug(`listScreenSources: ${error?.message || error}`);
      return [];
    }
  }

  mergeSources(into, list) {
    const seen = into._seen || (into._seen = new Set(into.map((s) => s?.id).filter(Boolean)));
    for (const source of list || []) {
      if (!source?.id || seen.has(source.id)) continue;
      seen.add(source.id);
      into.push(source);
    }
    return into;
  }

  // Discord's current enumerator is:
  //   getDesktopSources(mediaEngine, isWindows, ["screen","window"], extra)
  // Older builds omit the isWindows flag. Empty arrays are not success —
  // they used to skip native/preview fallbacks and hide screens.
  // Never call with a null engine — that path reads `.supports` and throws.
  async getDesktopSources() {
    const collected = [];
    const engine = this.getMediaEngine();
    const fn = this.findCodeFunction("desktop sources");
    const isWindows = this.getPlatform() === "win32";
    let lastError = null;
    const tryEnumerator = async (args, label) => {
      if (!fn || !engine) return;
      try {
        const sources = await fn(...args);
        if (Array.isArray(sources) && sources.length) {
          this.debug(`desktop sources via ${label}: ${sources.length}`);
          this.mergeSources(collected, sources);
          return;
        }
        if (Array.isArray(sources)) this.debug(`desktop sources via ${label}: empty`);
        else lastError = new Error("capture-bad-result");
      } catch (error) {
        lastError = error;
        this.debug(`desktop sources via ${label} threw: ${error?.message || error}`);
      }
    };
    if (fn && engine) {
      const mixed = ["screen", "window"];
      await tryEnumerator([engine, isWindows, mixed, null], `enumerator-winflag(arity ${fn.length})`);
      if (!collected.length) await tryEnumerator([engine, mixed, null], "enumerator-legacy");
      await tryEnumerator([engine, isWindows, ["window", "application"], null], "enumerator-apps-winflag");
      await tryEnumerator([engine, ["window", "application"], null], "enumerator-apps-legacy");
      if (!this.listScreenSourcesFrom(collected).length) {
        await tryEnumerator([engine, isWindows, ["screen"], null], "enumerator-screens-winflag");
        if (!this.listScreenSourcesFrom(collected).length) {
          await tryEnumerator([engine, ["screen"], null], "enumerator-screens-legacy");
        }
      }
    } else if (fn && !engine) {
      this.debug("desktop sources: enumerator found but media engine is null");
    } else if (!fn) {
      this.debug("desktop sources: enumerator missing");
    }
    if (!collected.length || !this.listScreenSourcesFrom(collected).length) {
      this.mergeSources(collected, await this.getNativeDesktopSources());
    }
    if (!collected.length || !this.listScreenSourcesFrom(collected).length) {
      const previews = await this.getPreviewSources();
      if (previews.length) {
        this.debug(`desktop sources via previews: ${previews.length}`);
        this.mergeSources(collected, previews);
      }
    }
    if (collected.length) return collected;
    throw lastError || new Error("capture-unavailable");
  }

  async getNativeDesktopSources() {
    try {
      const capturer = globalThis.DiscordNative?.desktopCapturer;
      if (!capturer || typeof capturer.getSources !== "function") return [];
      const list = await capturer.getSources({
        thumbnailSize: { height: 0, width: 0 },
        types: ["screen", "window"]
      });
      if (Array.isArray(list) && list.length) {
        this.debug(`desktop sources via DiscordNative.desktopCapturer: ${list.length}`);
        return list;
      }
    } catch (error) {
      this.debug(`desktopCapturer.getSources threw: ${error?.message || error}`);
    }
    return [];
  }

  async getPreviewSources() {
    const hosts = [this.getMediaEngine(), this.getMediaEngineStore()].filter(Boolean);
    const out = [];
    for (const [method, type] of [["getWindowPreviews", "window"], ["getScreenPreviews", "screen"]]) {
      for (const host of hosts) {
        if (typeof host[method] !== "function") continue;
        try {
          const list = await host[method](176, 99);
          if (!Array.isArray(list)) continue;
          for (const item of list) {
            if (item && item.id) out.push({ id: item.id, name: item.name, type });
          }
          break;
        } catch (error) {
          this.debug(`${method} threw: ${error?.message || error}`);
        }
      }
    }
    return out;
  }

  isSoundshareEnabled() {
    try {
      const state = this.getStreamingSettingsStore()?.getState?.();
      if (state && typeof state.soundshareEnabled === "boolean") return state.soundshareEnabled;
    } catch { /* ignore */ }
    return true;
  }

  isPreviewDisabled() {
    try {
      const state = this.getStreamingSettingsStore()?.getState?.();
      if (state && typeof state.previewDisabled === "boolean") return state.previewDisabled;
      if (state && typeof state.disableStreamPreviews === "boolean") return state.disableStreamPreviews;
    } catch { /* ignore */ }
    return false;
  }

  getGoLiveSource() {
    try {
      const store = this.getMediaEngineStore();
      if (store && typeof store.getGoLiveSource === "function") {
        return store.getGoLiveSource() || null;
      }
    } catch { /* ignore */ }
    return null;
  }

  hasGoLiveSourceApi() {
    try {
      return typeof this.getMediaEngineStore()?.getGoLiveSource === "function";
    } catch {
      return false;
    }
  }

  // Discord's Go Live modal always sends these six keys. For game streams
  // the pid is what associates the stream with the detected game (name +
  // icon); without it Discord shows the raw window title instead. The
  // name override keeps the game title even on the hook-free fallback.
  buildStreamOptions(source, { name = null, pid = null } = {}) {
    const sourceName = String(name || source?.name || "source");
    return {
      audioSourceId: sourceName,
      pid: pid ?? null,
      previewDisabled: this.isPreviewDisabled(),
      sound: this.isSoundshareEnabled(),
      sourceId: source.id,
      sourceName
    };
  }

  describeStreamFailure(error, label) {
    const msg = String(error?.message || error || "");
    const raw = error?.code ?? error?.errorCode ?? error?.err;
    let code = Number(raw);
    if (!Number.isFinite(code) || code <= 0) {
      const match = /\b(2001|2011|2012|2014|2015)\b/.exec(msg);
      code = match ? Number(match[1]) : null;
    } else {
      code = Number(code);
    }
    if (code === 2015 || code === 2012) {
      return {
        code,
        message: `Couldn't start streaming ${label} — Discord timed out on video (error ${code}). Exclusive fullscreen games often need a screen share instead.`
      };
    }
    if (code === 2011 || code === 2014) {
      return {
        code,
        message: `Couldn't start streaming ${label} — Discord timed out sending video (error ${code}). Close other capture apps and retry.`
      };
    }
    if (code === 2001) {
      return {
        code,
        message: `Couldn't start streaming ${label} — Discord refused to start (error 2001). Reload Discord (Ctrl+R).`
      };
    }
    return { code: null, message: `Couldn't start streaming ${label}.` };
  }

  // Resolves the predicate's truthy value, or null on timeout.
  async waitFor(predicate, { intervalMs = 400, timeoutMs = 3500 } = {}) {
    const started = Date.now();
    for (;;) {
      let value = null;
      try {
        value = await predicate();
      } catch {
        value = null;
      }
      if (value) return value;
      if (Date.now() - started >= timeoutMs) return null;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  async resolveStreamTarget() {
    const channelId = this.getVoiceChannelId();
    if (!channelId) return { error: "Join a voice channel first, then try again." };
    const channel = this.getChannel(channelId);
    return { channelId, guildId: this.channelGuildId(channel) };
  }

  async beginStream({ channelId, guildId, label, name = null, pid = null, requireCapture = false, source }) {
    const startFn = this.findCodeFunction('type:"STREAM_START"');
    if (!startFn || !source?.id) {
      return { ok: false, message: "Couldn't reach Discord's streaming controls — Discord may have updated." };
    }
    const options = this.buildStreamOptions(source, { name, pid });
    try {
      await startFn(guildId ?? null, channelId, options);
    } catch (error) {
      this.warn(`stream start threw: ${error?.message || error}`);
      return { ok: false, ...this.describeStreamFailure(error, label) };
    }
    const live = await this.waitFor(() => this.getSelfStream());
    if (!live) {
      return { ok: false, message: `Couldn't start streaming ${label} — try again.` };
    }
    if (requireCapture && this.hasGoLiveSourceApi()) {
      const attached = await this.waitFor(() => this.getGoLiveSource(), { timeoutMs: 2500 });
      if (!attached) {
        this.warn(`stream started but capture never attached for ${label}`);
        await this.stopOwnStream();
        return {
          ok: false,
          code: 2015,
          message: `Couldn't start streaming ${label} — Discord timed out on video (error 2015). Exclusive fullscreen games often need a screen share instead.`
        };
      }
    }
    this.info(`streaming ${label} (sound ${options.sound ? "on" : "off"})`);
    return { ok: true, message: `Streaming ${label}` };
  }

  gameStreamAttempts(sources, game) {
    const label = game.name || "your game";
    const pid = Number(game.pid) > 0 ? Number(game.pid) : null;
    const { application, window } = this.matchGameSources(sources, game);
    const screen = this.pickScreenSource(sources);
    const attempts = [];
    // Discord-like order: game capture with pid first (name + icon via
    // RunningGameStore), then the same window without the graphics hook
    // for 2015-prone exclusive-fullscreen games, then primary screen.
    // Every game attempt carries the game name so the stream title never
    // falls back to the raw executable/window title.
    if (application) attempts.push({ label, name: label, pid, source: application });
    if (window && window !== application) attempts.push({ label, name: label, pid, source: window });
    if (window && window !== application && pid) {
      attempts.push({ label, name: label, pid: null, source: window });
    }
    if (screen) {
      attempts.push({ label: `${label} (screen)`, pid: null, source: screen });
    }
    return attempts;
  }

  // Pids recycle on every launch, so a saved pid goes stale as soon as the
  // game restarts. Re-resolve by executable, then name, before giving up.
  resolveSavedGame(prefer = {}) {
    const wantedPid = Number(prefer.pid);
    if (!Number.isFinite(wantedPid) || wantedPid <= 0) return null;
    const games = this.listGames();
    const byPid = games.find((g) => g.pid === wantedPid);
    if (byPid) return byPid;
    const exeBase = (p) => String(p || "").split(/[\\/]/).pop().toLowerCase();
    const wantExe = exeBase(prefer.exePath);
    if (wantExe) {
      const byExe = games.find((g) => g.exePath && exeBase(g.exePath) === wantExe);
      if (byExe) {
        this.debug(`saved game pid ${wantedPid} stale; re-resolved ${byExe.name} to pid ${byExe.pid} via exe`);
        return byExe;
      }
    }
    const wantName = String(prefer.name || "").trim().toLowerCase();
    if (wantName) {
      const byName = games.find((g) => String(g.name || "").trim().toLowerCase() === wantName);
      if (byName) {
        this.debug(`saved game pid ${wantedPid} stale; re-resolved ${byName.name} to pid ${byName.pid} via name`);
        return byName;
      }
    }
    return { name: String(prefer.name || "").trim() || "your game", pid: wantedPid, stale: true };
  }

  async startGameStream(prefer = {}) {
    const target = await this.resolveStreamTarget();
    if (target.error) return { ok: false, message: target.error };
    if (this.getSelfStream()) return { ok: true, message: "Already streaming — stop first to switch." };
    const saved = this.resolveSavedGame(prefer);
    if (saved?.stale) {
      return { ok: false, message: `Couldn't find ${saved.name} running — Refresh this keybind and pick it again.` };
    }
    const picked = saved ? null : this.pickGame();
    const game = saved || picked?.game;
    if (!game) {
      if (picked?.detection === false) {
        return { ok: false, message: "Game detection is off — turn it on in Discord Settings → Game Activity." };
      }
      if (!this.getRunningGameStore()) {
        return { ok: false, message: "Couldn't reach Discord's game detection — Discord may have updated." };
      }
      return { ok: false, message: "No game detected — pick one in this keybind, or launch a game first." };
    }
    let sources;
    try {
      sources = await this.getDesktopSources();
    } catch (error) {
      this.warn(`desktop sources failed: ${error?.message || error}`);
      return { ok: false, message: "Couldn't reach screen capture — reload Discord (Ctrl+R) and try again." };
    }
    if (!sources.length) return { ok: false, message: "No capture sources found." };
    const label = game.name || "your game";
    const attempts = this.gameStreamAttempts(sources, game);
    if (!attempts.length) {
      return { ok: false, message: `Couldn't find a window for ${label} — make sure it's not minimized.` };
    }
    let last = null;
    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      if (this.getSelfStream()) await this.stopOwnStream();
      last = await this.beginStream({
        channelId: target.channelId,
        guildId: target.guildId,
        requireCapture: true,
        ...attempt
      });
      if (last.ok) {
        if (i > 0) this.info(`game stream fell back to ${attempt.source.id}`);
        return last;
      }
      this.warn(`game stream attempt ${i + 1}/${attempts.length} failed: ${last.message}`);
    }
    return last;
  }

  async startScreenStream(prefer = {}) {
    const target = await this.resolveStreamTarget();
    if (target.error) return { ok: false, message: target.error };
    if (this.getSelfStream()) return { ok: true, message: "Already streaming — stop first to switch." };
    let sources;
    try {
      sources = await this.getDesktopSources();
    } catch (error) {
      this.warn(`desktop sources failed: ${error?.message || error}`);
      return { ok: false, message: "Couldn't reach screen capture — reload Discord (Ctrl+R) and try again." };
    }
    const source = this.pickScreenSource(sources, prefer);
    if (!source) return { ok: false, message: "Couldn't find your screen to share. Open this keybind and pick a display." };
    const label = source.name || "your screen";
    return this.beginStream({ channelId: target.channelId, guildId: target.guildId, label, source });
  }

  async stopOwnStream() {
    const stream = this.getSelfStream();
    if (!stream) return { ok: true, message: "Not streaming." };
    const key = this.resolveStreamKey(stream);
    const stopFn = this.findCodeFunction('type:"STREAM_STOP"');
    if (!key || !stopFn) return { ok: false, message: "Couldn't stop the stream." };
    try {
      await stopFn(key);
    } catch (error) {
      this.warn(`stream stop threw: ${error?.message || error}`);
      return { ok: false, message: "Couldn't stop the stream — try again." };
    }
    const stopped = await this.waitFor(() => !this.getSelfStream(), { timeoutMs: 2500 });
    if (stopped) {
      this.info("stream stopped");
      this.streamKey = null;
      return { ok: true, message: "Stream stopped." };
    }
    return { ok: false, message: "Couldn't stop the stream — try again." };
  }

  async toggleGameStream(prefer = {}) {
    return this.getSelfStream() ? this.stopOwnStream() : this.startGameStream(prefer);
  }

  async toggleScreenStream(prefer = {}) {
    return this.getSelfStream() ? this.stopOwnStream() : this.startScreenStream(prefer);
  }

  // ---- soundboard ----

  // Discord's authenticated REST client (Vencord mirrors it as RestAPI via
  // the same del+put shape). Core module, always loaded — immune to the
  // soundboard UI chunk being lazy.
  getRestApi() {
    return this.cached("restApi", () => this.findModule(
      (m) => m && typeof m === "object"
        && typeof m.post === "function"
        && typeof m.del === "function"
        && typeof m.put === "function"
    ));
  }

  // The action creator behind Discord's own soundboard button press: it is
  // what actually produces audio. The REST POST alone returns success and
  // shows the emoji, but nobody hears anything. The creator takes
  // (channelId, sound, trigger) while Flux handlers take a single action
  // object, so creator-shaped matches win over handler-shaped ones sharing
  // a chunk. Misses cache for 60s: the full sweep is slow.
  getSoundboardLocalPlayFn() {
    const needle = 'type:"GUILD_SOUNDBOARD_SOUND_PLAY_LOCALLY"';
    const key = `code:${needle}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const now = Date.now();
    if (now - (this.lastAttempt.get(key) || 0) < 60000) return null;
    this.lastAttempt.set(key, now);
    const fast = this.extractCodeFn(this.findByStrings(needle), needle);
    if (fast && fast.length >= 2) {
      this.cache.set(key, fast);
      this.debug(`webpack resolved ${key} (arity ${fast.length})`);
      return fast;
    }
    for (const searchExports of [false, true]) {
      const mods = this.getAllModules(() => true, { searchExports });
      if (!mods) continue;
      for (const mod of mods) {
        for (const fn of this.extractCodeFns(mod, needle)) {
          if (fn.length >= 2) {
            this.cache.set(key, fn);
            this.debug(`webpack resolved ${key} via sweep (arity ${fn.length})`);
            return fn;
          }
        }
      }
    }
    if (fast) {
      this.cache.set(key, fast);
      this.debug(`webpack resolved ${key} (fallback arity ${fast.length})`);
    } else {
      this.debug(`webpack miss ${key} (will retry)`);
    }
    return fast;
  }

  normalizeSoundboardSound(entry, fallbackGuildId = null) {
    if (!entry || typeof entry !== "object") return null;
    const soundId = entry.soundId ?? entry.sound_id ?? entry.id;
    if (soundId == null || String(soundId) === "") return null;
    return {
      available: entry.available !== false,
      emojiId: entry.emojiId ?? entry.emoji_id ?? null,
      emojiName: entry.emojiName ?? entry.emoji_name ?? null,
      guildId: entry.guildId ?? entry.guild_id ?? fallbackGuildId ?? null,
      name: String(entry.name || "Sound"),
      soundId: String(soundId)
    };
  }

  // Guild sounds plus defaults, deduplicated by sound id. Unavailable
  // sounds are dropped: firing them would fail at send time anyway.
  listSoundboardSounds() {
    const store = this.getSoundboardStore();
    if (!store) return [];
    const out = [];
    const seen = new Set();
    const push = (entry, guildId = null) => {
      const sound = this.normalizeSoundboardSound(entry, guildId);
      if (!sound || !sound.available || seen.has(sound.soundId)) return;
      seen.add(sound.soundId);
      out.push(sound);
    };
    try {
      const all = typeof store.getSounds === "function" ? store.getSounds() : null;
      if (all instanceof Map) {
        for (const [guildId, sounds] of all) {
          if (Array.isArray(sounds)) for (const s of sounds) push(s, String(guildId));
        }
      } else if (Array.isArray(all)) {
        for (const s of all) push(s);
      }
    } catch { /* per-guild fallback below */ }
    try {
      if (typeof store.getSoundsForGuild === "function") {
        for (const guildId of [this.getVoiceGuildId(), null]) {
          const list = store.getSoundsForGuild(guildId);
          if (Array.isArray(list)) for (const s of list) push(s, guildId);
        }
      }
    } catch { /* getSounds result above stands */ }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  getVoiceGuildId() {
    try {
      const channelId = this.getVoiceChannelId();
      if (!channelId) return null;
      return this.channelGuildId(this.getChannel(channelId));
    } catch {
      return null;
    }
  }

  isSoundboardPlaying(soundId) {
    try {
      const store = this.getSoundboardStore();
      if (!store) return null;
      if (typeof store.isPlayingSound === "function" && store.isPlayingSound(soundId)) return true;
      const me = this.getUserStore()?.getCurrentUser?.()?.id;
      if (me && typeof store.isUserPlayingSounds === "function" && store.isUserPlayingSounds(me)) return true;
      if (typeof store.isPlayingSound === "function" || typeof store.isUserPlayingSounds === "function") return false;
      return null;
    } catch {
      return null;
    }
  }

  // Playing a sound is two calls, mirroring Discord's own button: the
  // local-play action (audible audio) plus the REST POST (server
  // broadcast). The emoji fields are required in practice — without them
  // the POST succeeds but nothing plays.
  async playSoundboardSound({ emojiId = null, emojiName = null, soundId = null, soundName = null, sourceGuildId = null } = {}) {
    const id = String(soundId || "").trim();
    if (!id) return { ok: false, message: "Pick a sound for this keybind first." };
    const label = String(soundName || "").trim() || "sound";
    const channelId = this.getVoiceChannelId();
    if (!channelId) return { ok: false, message: "Join a voice channel first, then try again." };
    if (this.isSelfMute() === true) return { ok: false, message: "Unmute yourself first — muted users can't play sounds." };
    if (this.isSelfDeaf() === true) return { ok: false, message: "Undeafen yourself first — deafened users can't play sounds." };
    const sounds = this.listSoundboardSounds();
    const known = sounds.find((s) => s.soundId === id);
    if (sounds.length && !known) {
      return { ok: false, message: `Couldn't find ${label} — Refresh this keybind and pick it again.` };
    }
    const rest = this.getRestApi();
    if (!rest || typeof rest.post !== "function") {
      return { ok: false, message: "Couldn't reach Discord's request module — Discord may have updated." };
    }
    const localPlay = this.getSoundboardLocalPlayFn();
    if (typeof localPlay !== "function") {
      return { ok: false, message: "Couldn't reach Discord's soundboard audio — open the soundboard panel once, then retry." };
    }
    const guildId = String(sourceGuildId || "").trim() || known?.guildId || null;
    const sound = {
      available: true,
      emojiId: emojiId ?? known?.emojiId ?? null,
      emojiName: emojiName ?? known?.emojiName ?? null,
      guildId: guildId || "",
      name: label,
      soundId: id,
      volume: 1
    };
    let localError = null;
    try {
      localPlay(channelId, sound, 1);
    } catch (error) {
      // Non-fatal: the broadcast below is what the channel hears. Logged
      // with full detail so a genuine local failure stays diagnosable.
      localError = error;
      this.logSoundboardError("local-play", error);
    }
    try {
      const res = rest.post({
        body: {
          emoji_id: sound.emojiId,
          emoji_name: sound.emojiName,
          sound_id: id,
          ...(guildId ? { source_guild_id: guildId } : {})
        },
        url: `/channels/${channelId}/send-soundboard-sound`
      });
      if (res && typeof res.then === "function") await res;
    } catch (error) {
      this.logSoundboardError("rest-post", error);
      if (this.isRateLimit(error)) {
        return { ok: false, message: "Slow down — Discord limits sounds to about one per 5 seconds." };
      }
      if (!localError && this.isPremiumSubscriptionError(error)) {
        this.info(`soundboard premium broadcast warning ignored, local audio succeeded (${label})`);
        return { ok: true, message: `Playing ${label}` };
      }
      const reason = this.soundboardErrorText(error);
      return localError
        ? { ok: false, message: `Couldn't play ${label}: ${reason}` }
        : { ok: false, message: `Couldn't broadcast ${label}: ${reason}` };
    }
    // Sounds are short; a fast clip can finish before the first poll, so a
    // missed confirmation still reports success like volume writes do.
    const confirmed = await this.waitFor(() => this.isSoundboardPlaying(id), { intervalMs: 250, timeoutMs: 2500 });
    this.info(`soundboard played ${label} (${id}) in ${channelId}${confirmed ? "" : " (unconfirmed)"}`);
    return confirmed
      ? { ok: true, message: `Playing ${label}` }
      : { ok: true, message: `Played ${label} (couldn't confirm)` };
  }

  isRateLimit(error) {
    const status = Number(error?.status ?? error?.code);
    if (status === 429) return true;
    return /rate.?limit|429|too many/i.test(String(error?.message || error || ""));
  }

  isPremiumSubscriptionError(error) {
    const text = this.soundboardErrorText(error);
    if (/premium\s+subscription/i.test(text)) return true;
    try {
      const bodyMsg = error?.body?.message;
      if (typeof bodyMsg === "string" && /premium\s+subscription/i.test(bodyMsg)) return true;
    } catch { /* ignore */ }
    return false;
  }

  // Best-effort human text for Discord-shaped failures: message, then API
  // body message, then status code. Never empty, never [object Object].
  soundboardErrorText(error) {
    const msg = String(error?.message || "").trim();
    if (msg && msg !== "[object Object]") return msg;
    try {
      const body = error?.body;
      if (body && typeof body === "object") {
        if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
        const str = JSON.stringify(body).slice(0, 160);
        if (str && str !== "{}") return str;
      }
    } catch { /* status fallback below */ }
    const status = error?.status ?? error?.code;
    if (status !== null && status !== undefined && String(status).trim() !== "") return `request failed (code ${status})`;
    if (error === null || error === undefined) return "unknown error";
    const str = String(error).trim();
    return str && str !== "[object Object]" ? str.slice(0, 160) : "unknown error";
  }

  logSoundboardError(leg, error) {
    let detail = "";
    try {
      detail = ` status=${error?.status ?? error?.code ?? "?"} body=${JSON.stringify(error?.body)?.slice(0, 200) ?? "?"}`;
    } catch { /* message below stands */ }
    this.warn(`soundboard ${leg} failed: ${this.soundboardErrorText(error)}${detail}`);
  }

  // Probe native helper modules for capture/voice APIs (keys only, cached).
  inspectNativeModules() {
    if (this.nativeCache) return this.nativeCache;
    const out = {};
    try {
      const req = globalThis.DiscordNative?.nativeModules?.requireModule;
      if (typeof req === "function") {
        for (const name of [
          "discord_utils", "discord_voice", "discord_rpc", "discord_overlay",
          "discord_hook", "discord_game_sdk", "discord_dispatch", "discord_cloudsync",
          "discord_desktop_capture", "discord_screen_capture", "discord_video",
          "discord_av", "discord_krisp", "discord_clips"
        ]) {
          try {
            const mod = req(name);
            if (mod && (typeof mod === "object" || typeof mod === "function")) {
              let keys = [];
              try {
                keys = Object.keys(mod).sort();
              } catch { keys = []; }
              out[name] = keys.slice(0, 40);
            }
          } catch { /* not present */ }
        }
      }
    } catch { /* ignore */ }
    this.nativeCache = out;
    const names = Object.keys(out);
    this.info(`native modules: ${names.length ? names.map((n) => `${n}(${out[n].length})`).join(", ") : "none"}`);
    for (const name of names) this.debug(`native ${name}: ${out[name].join(", ").slice(0, 400)}`);
    return out;
  }

  getPlatform() {
    try {
      const p = globalThis.DiscordNative?.process?.platform;
      if (p === "win32" || p === "darwin" || p === "linux") return p;
    } catch { /* ignore */ }
    try {
      const nav = globalThis.navigator;
      const plat = nav?.userAgentData?.platform || nav?.platform || "";
      if (/win/i.test(plat)) return "win32";
      if (/mac/i.test(plat)) return "darwin";
      if (/linux/i.test(plat)) return "linux";
    } catch { /* ignore */ }
    return "unknown";
  }

  getDiscordUtils() {
    if (this.utilsTried) return this.utilsCache;
    this.utilsTried = true;
    try {
      const req = globalThis.DiscordNative?.nativeModules?.requireModule;
      this.utilsCache = typeof req === "function" ? req("discord_utils") || null : null;
    } catch {
      this.utilsCache = null;
    }
    this.debug(`discord_utils ${this.utilsCache ? "found" : "missing"}`);
    return this.utilsCache;
  }

  hasGlobalSupport() {
    const utils = this.getDiscordUtils();
    return Boolean(utils && typeof utils.inputEventRegister === "function" && typeof utils.inputEventUnregister === "function");
  }

  // Discord ships per-platform keycode maps; prefer the current platform's.
  getKeycodeMap() {
    const platform = this.getPlatform();
    if (this.keymapCache.has(platform)) return this.keymapCache.get(platform);
    const filters = {
      darwin: (m) => m?.ctrl === 0xe0,
      linux: (m) => m?.ctrl === 0x25,
      win32: (m) => m?.ctrl === 0xa2
    };
    const order = [filters[platform], filters.win32, filters.linux, filters.darwin].filter(Boolean);
    let found = null;
    for (const filter of order) {
      const hit = this.findModule(filter, { searchExports: true }) || this.findModule(filter, { searchExports: false });
      found = extractKeycodeMap(hit);
      if (found) break;
    }
    this.keymapCache.set(platform, found);
    this.debug(`keycode map (${platform}): ${found ? "found" : "missing"}`);
    return found;
  }

  getAllModules(filter, { searchExports = true } = {}) {
    const BdApi = this.BdApi;
    try {
      if (typeof BdApi?.Webpack?.getModules === "function") {
        return BdApi.Webpack.getModules(filter, { searchExports }) || [];
      }
    } catch (error) {
      this.warn(`getModules threw: ${error?.message || error}`);
    }
    return null;
  }

  // Broad sweep for audio-related modules under whatever API shape Discord
  // currently uses. Runs on demand from Diagnostics; results go to the log.
  scanAudioCandidates({ limit = 15 } = {}) {
    const started = Date.now();
    const seen = new Set();
    const hits = [];
    const match = (m) => {
      if (!m || (typeof m !== "object" && typeof m !== "function")) return null;
      let keys = [];
      try {
        keys = Object.keys(m);
      } catch {
        return null;
      }
      const hasVolumeKey = keys.some((k) => /volume/i.test(k));
      let hasEngineKey = false;
      try {
        hasEngineKey = [
          "getMediaEngine", "getOutputDevice", "getOutputDeviceId",
          "isSelfMute", "isSelfDeaf",
          "getOutputVolume", "setOutputVolume", "getInputVolume", "setInputVolume"
        ].some((k) => k in m);
      } catch { /* ignore */ }
      let hasVolumeSetting = false;
      try {
        hasVolumeSetting = typeof m.outputVolume === "number" || typeof m.inputVolume === "number";
      } catch { /* getters may throw */ }
      if (!hasVolumeKey && !hasEngineKey && !hasVolumeSetting) return null;
      const fingerprint = this.fingerprint(m, 30);
      if (seen.has(fingerprint)) return null;
      seen.add(fingerprint);
      return { fingerprint, kind: hasEngineKey ? "engine-api" : hasVolumeSetting ? "volume-settings" : "volume-key" };
    };
    for (const searchExports of [false, true]) {
      const mods = this.getAllModules(() => true, { searchExports });
      if (!mods) {
        this.warn("audio scan: module enumeration unsupported");
        return [];
      }
      for (const m of mods) {
        if (hits.length >= limit) break;
        const hit = match(m);
        if (hit) hits.push(hit);
      }
      if (hits.length >= limit) break;
    }
    this.info(`audio scan: ${hits.length} candidate(s) in ${Date.now() - started}ms`);
    hits.forEach((h, i) => this.info(`audio scan #${i + 1} [${h.kind}]: ${h.fingerprint}`));
    return hits;
  }

  // Read-only inspection of the volume write path: which setters exist,
  // whether Flux routes the volume event, and what the setter
  // functions look like. Decisive for "dispatch goes nowhere" diagnosis.
  inspectAudioPath() {
    const out = {
      fluxAudioTypes: [],
      fluxHandlerCount: null,
      fluxHandlerSample: [],
      fluxSubAudioTypes: [],
      fluxSubCount: null,
      fluxSubSample: [],
      fluxSubTotalTypes: null,
      fluxTotalTypes: null,
      hasOutputVolumeHandler: null,
      hasOutputVolumeSubscriber: null,
      setters: { setInputVolume: false, setOutputVolume: false },
      sources: {}
    };
    try {
      const voice = this.getVoiceActions();
      out.setters.setOutputVolume = typeof voice?.setOutputVolume === "function";
      out.setters.setInputVolume = typeof voice?.setInputVolume === "function";
      for (const key of ["setOutputVolume", "setInputVolume", "setSelfMute", "toggleSelfMute"]) {
        try {
          const fn = voice?.[key];
          if (typeof fn === "function") out.sources[key] = String(fn.toString()).slice(0, 400);
        } catch { /* ignore per-key */ }
      }
    } catch { /* ignore */ }
    const actionLike = (t) => /^[A-Z][A-Z0-9_]{3,}$/.test(String(t));
    const readRegistry = (registry) => {
      const types = [];
      if (registry instanceof Map) {
        for (const key of registry.keys()) types.push(key);
      } else if (registry && typeof registry === "object") {
        types.push(...Object.keys(registry));
      }
      return types;
    };
    const countEntry = (registry, type) => {
      try {
        const entry = registry instanceof Map ? registry.get(type) : registry[type];
        if (typeof entry?.size === "number") return entry.size;
        if (Array.isArray(entry)) return entry.length;
        return 1;
      } catch {
        return null;
      }
    };
    try {
      const flux = this.getFlux();
      const handlerTypes = readRegistry(flux?._actionHandlers);
      if (handlerTypes.length) {
        out.fluxTotalTypes = handlerTypes.length;
        out.fluxHandlerSample = handlerTypes.map(String).sort().slice(0, 8);
        if (handlerTypes.some(actionLike)) {
          out.fluxAudioTypes = handlerTypes.map(String).sort()
            .filter((t) => /AUDIO|VOLUME|VOICE|MEDIA|SPEAK|MUTE|DEAF/i.test(t))
            .slice(0, 30);
          if (handlerTypes.includes("AUDIO_SET_OUTPUT_VOLUME")) {
            out.hasOutputVolumeHandler = true;
            out.fluxHandlerCount = countEntry(flux._actionHandlers, "AUDIO_SET_OUTPUT_VOLUME");
          } else {
            out.hasOutputVolumeHandler = false;
          }
        } else {
          this.debug(`flux _actionHandlers not action-keyed: ${out.fluxHandlerSample.join(",")}`);
        }
      }
      const subTypes = readRegistry(flux?._subscriptions);
      if (subTypes.length) {
        out.fluxSubTotalTypes = subTypes.length;
        out.fluxSubSample = subTypes.map(String).sort().slice(0, 8);
        if (subTypes.some(actionLike)) {
          out.fluxSubAudioTypes = subTypes.map(String).sort()
            .filter((t) => /AUDIO|VOLUME|VOICE|MEDIA|SPEAK|MUTE|DEAF/i.test(t))
            .slice(0, 30);
          if (subTypes.includes("AUDIO_SET_OUTPUT_VOLUME")) {
            out.hasOutputVolumeSubscriber = true;
            out.fluxSubCount = countEntry(flux._subscriptions, "AUDIO_SET_OUTPUT_VOLUME");
          } else {
            out.hasOutputVolumeSubscriber = false;
          }
        } else {
          this.debug(`flux _subscriptions not action-keyed: ${out.fluxSubSample.join(",")}`);
        }
      }
    } catch { /* ignore */ }
    return out;
  }

  // Snapshot of streaming dependencies: stores, action creators,
  // capture engine, detected games, and own stream state.
  probeStreaming() {
    const runningGame = Boolean(this.getRunningGameStore());
    const store = Boolean(this.getStreamingStore());
    const settings = Boolean(this.getStreamingSettingsStore());
    const channel = Boolean(this.getChannelStore());
    const voiceState = Boolean(this.getVoiceStateStore());
    const startFn = Boolean(this.findCodeFunction('type:"STREAM_START"'));
    const stopFn = Boolean(this.findCodeFunction('type:"STREAM_STOP"'));
    const sourcesFn = Boolean(this.findCodeFunction("desktop sources"));
    const engine = Boolean(this.getMediaEngine());
    let games = null;
    let gameName = null;
    try {
      const gs = this.getRunningGameStore();
      const list = gs?.getRunningGames?.();
      if (Array.isArray(list)) {
        games = list.length;
        let visible = null;
        try {
          visible = gs.getVisibleGame?.();
        } catch { visible = null; }
        gameName = visible?.name ?? list.find((g) => g && !g.hidden)?.name ?? null;
      }
    } catch { /* ignore */ }
    return {
      channel,
      engine,
      gameName,
      games,
      nativeCapturer: Boolean(globalThis.DiscordNative?.desktopCapturer?.getSources),
      ready: runningGame && store && startFn && stopFn && (sourcesFn || Boolean(globalThis.DiscordNative?.desktopCapturer?.getSources)),
      runningGame,
      selfStream: Boolean(this.getSelfStream()),
      settings,
      sourcesFn,
      startFn,
      stopFn,
      store,
      trackedKey: Boolean(this.streamKey),
      voiceChannel: this.getVoiceChannelId(),
      voiceState
    };
  }

  // Snapshot of soundboard dependencies: store, REST client, local-play
  // action, readable sound count, and voice presence.
  probeSoundboard() {
    const store = Boolean(this.getSoundboardStore());
    const restApi = Boolean(this.getRestApi());
    const localPlayFn = this.getSoundboardLocalPlayFn();
    const localPlay = typeof localPlayFn === "function";
    let sounds = null;
    try {
      sounds = store ? this.listSoundboardSounds().length : null;
    } catch {
      sounds = null;
    }
    return {
      localPlay,
      localPlayArity: localPlay ? localPlayFn.length : null,
      ready: store && restApi && localPlay,
      restApi,
      sounds,
      store,
      voiceChannel: this.getVoiceChannelId()
    };
  }

  // Snapshot of every Discord dependency for the diagnostics panel.
  probe() {
    const media = this.getMediaEngineStore();
    return {
      audioActions: Boolean(this.getAudioActions()),
      audioActionKeys: this.audioActionKeys(),
      audioPath: this.inspectAudioPath(),
      channelActions: Boolean(this.getChannelActions()),
      channelRouter: Boolean(this.getChannelRouter()),
      discordUtils: this.hasGlobalSupport(),
      flux: Boolean(this.getFlux()),
      inputAmplitude: this.getInputVolumeRaw(),
      inputTracked: this.lastSetInputVolume,
      inputVolume: this.getInputVolume(),
      keycodeMap: Boolean(this.getKeycodeMap()),
      mediaEngine: Boolean(media),
      mediaMethods: media
        ? ["getOutputVolume", "getInputVolume", "getMediaEngine", "isSelfMute", "isSelfDeaf", "getGoLiveSource", "getGoLiveContext"]
          .filter((k) => typeof media[k] === "function")
        : [],
      messageActions: Boolean(this.getMessageActions()),
      nativeModules: this.inspectNativeModules(),
      outputAmplitude: this.getOutputVolumeRaw(),
      outputTracked: this.lastSetOutputVolume,
      outputVolume: this.getOutputVolume(),
      platform: this.getPlatform(),
      selectedChannel: Boolean(this.getSelectedChannelStore()),
      selfDeaf: this.isSelfDeaf(),
      selfMute: this.isSelfMute(),
      soundboard: this.probeSoundboard(),
      streaming: this.probeStreaming(),
      voiceActions: Boolean(this.getVoiceActions())
    };
  }

  probeSummary() {
    const p = this.probe();
    const mods = [
      ["flux", p.flux],
      ["media", p.mediaEngine],
      ["voice", p.voiceActions],
      ["channel", p.channelActions],
      ["message", p.messageActions],
      ["selected", p.selectedChannel],
      ["native", p.discordUtils],
      ["keymap", p.keycodeMap]
    ].map(([k, v]) => `${k}:${v ? "ok" : "MISS"}`).join(" ");
    const ap = p.audioPath || {};
    const vset = ap.setters?.setOutputVolume ? "ok" : "MISS";
    const oh = ap.hasOutputVolumeHandler === true
      ? `yes${typeof ap.fluxHandlerCount === "number" ? `(${ap.fluxHandlerCount})` : ""}`
      : ap.hasOutputVolumeHandler === false ? "NO" : "?";
    const osub = ap.hasOutputVolumeSubscriber === true
      ? `yes${typeof ap.fluxSubCount === "number" ? `(${ap.fluxSubCount})` : ""}`
      : ap.hasOutputVolumeSubscriber === false ? "NO" : "?";
    const s = p.streaming || {};
    const stm = `stm:${s.ready ? "ok" : "MISS"} live:${s.selfStream ? "Y" : "n"} g:${s.games ?? "?"}`;
    const sb = p.soundboard || {};
    const snd = `sb:${sb.ready ? "ok" : "MISS"} snd:${sb.sounds ?? "?"}`;
    return `${mods} vset:${vset} ovolh:${oh} ovols:${osub} out:${p.outputVolume ?? "?"} in:${p.inputVolume ?? "?"} ${stm} ${snd}`;
  }

  diagnosticsText(header = "") {
    const p = this.probe();
    const yn = (v) => (v ? "found" : "MISSING");
    const val = (v) => (v === null || v === undefined ? "unreadable" : String(v));
    const s = p.streaming || {};
    const sb = p.soundboard || {};
    const natives = p.nativeModules && typeof p.nativeModules === "object" ? p.nativeModules : {};
    const nativeNames = Object.keys(natives);
    const nativeSummary = nativeNames.length
      ? nativeNames.map((n) => `${n}(${natives[n].length}): ${natives[n].slice(0, 10).join(",")}`).join(" | ")
      : "none";
    return [
      header,
      `time: ${new Date().toISOString()}`,
      `bdApi: ${this.BdApi?.version ?? "unknown"}`,
      `platform: ${p.platform}`,
      `flux: ${yn(p.flux)}`,
      `mediaEngine: ${yn(p.mediaEngine)} (methods: ${p.mediaMethods.join(", ") || "none"})`,
      `audioActions: ${yn(p.audioActions)} (exports: ${p.audioActionKeys.join(", ") || "none"})`,
      `voiceActions: ${yn(p.voiceActions)}`,
      `channelActions: ${yn(p.channelActions)}`,
      `channelRouter: ${yn(p.channelRouter)}`,
      `messageActions: ${yn(p.messageActions)}`,
      `selectedChannel: ${yn(p.selectedChannel)}`,
      `discordUtils(global): ${yn(p.discordUtils)}`,
      `keycodeMap: ${yn(p.keycodeMap)}`,
      `voiceSetter(output): ${yn(p.audioPath?.setters?.setOutputVolume)}`,
      `voiceSetter(input): ${yn(p.audioPath?.setters?.setInputVolume)}`,
      `outputVolumeHandler: ${p.audioPath?.hasOutputVolumeHandler === true ? `yes (${p.audioPath.fluxHandlerCount ?? "?"} handlers)` : p.audioPath?.hasOutputVolumeHandler === false ? "NO" : "unknown"}`,
      `fluxAudioTypes(${p.audioPath?.fluxTotalTypes ?? "?"} total): ${(p.audioPath?.fluxAudioTypes || []).join(", ") || "none"}`,
      `fluxHandlerSample: ${(p.audioPath?.fluxHandlerSample || []).join(", ") || "none"}`,
      `outputVolumeSubscriber: ${p.audioPath?.hasOutputVolumeSubscriber === true ? `yes (${p.audioPath.fluxSubCount ?? "?"} subs)` : p.audioPath?.hasOutputVolumeSubscriber === false ? "NO" : "unknown"}`,
      `fluxSubAudioTypes(${p.audioPath?.fluxSubTotalTypes ?? "?"} total): ${(p.audioPath?.fluxSubAudioTypes || []).join(", ") || "none"}`,
      `fluxSubSample: ${(p.audioPath?.fluxSubSample || []).join(", ") || "none"}`,
      `setterSource(setOutputVolume): ${p.audioPath?.sources?.setOutputVolume || "n/a"}`,
      `outputVolume: ${val(p.outputVolume)} (amplitude ${val(p.outputAmplitude)})`,
      `outputTracked: ${p.outputTracked ?? "none"}`,
      `inputVolume: ${val(p.inputVolume)} (amplitude ${val(p.inputAmplitude)})`,
      `inputTracked: ${p.inputTracked ?? "none"}`,
      `selfMute: ${val(p.selfMute)}`,
      `selfDeaf: ${val(p.selfDeaf)}`,
      `streamStores: runningGame ${yn(s.runningGame)}, streaming ${yn(s.store)}, settings ${yn(s.settings)}, channel ${yn(s.channel)}, voiceState ${yn(s.voiceState)}`,
      `streamFns: start ${yn(s.startFn)}, stop ${yn(s.stopFn)}, sources ${yn(s.sourcesFn)}, nativeCapturer ${yn(s.nativeCapturer)}`,
      `streamEngine: ${yn(s.engine)}`,
      `games: ${s.games ?? "unreadable"}${s.gameName ? ` (visible: ${s.gameName})` : ""}`,
      `voiceChannel: ${s.voiceChannel || "none"}`,
      `selfStream: ${s.selfStream ? "yes" : "no"} (trackedKey: ${s.trackedKey ? "yes" : "no"})`,
      `soundboard: store ${yn(sb.store)}, rest ${yn(sb.restApi)}, localPlay ${sb.localPlay ? `found(arity ${sb.localPlayArity ?? "?"})` : "MISSING"}`,
      `sounds: ${sb.sounds ?? "unreadable"}`,
      `nativeModules: ${nativeSummary}`
    ].filter(Boolean).join("\n");
  }

  showToast(text, type = "info") {
    try {
      if (this.BdApi?.UI?.showToast) {
        this.BdApi.UI.showToast(String(text), { type });
        return;
      }
      if (typeof this.BdApi?.showToast === "function") {
        this.BdApi.showToast(String(text), { type });
        return;
      }
    } catch { /* console fallback below */ }
    try {
      console.log(`[BetterKeybinds] ${text}`);
    } catch { /* ignore */ }
  }
}

module.exports = { DiscordBridge };
