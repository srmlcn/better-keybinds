"use strict";

const { extractKeycodeMap } = require("./keybinds");

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
    const BdApi = this.BdApi;
    try {
      const byProps = BdApi?.Webpack?.Filters?.byProps;
      if (byProps && BdApi?.Webpack?.getModule) {
        return BdApi.Webpack.getModule(byProps(...props), { searchExports: true }) || null;
      }
    } catch (error) {
      this.warn(`byProps threw: ${error?.message || error}`);
    }
    try {
      if (typeof BdApi?.findModuleByProps === "function") {
        return BdApi.findModuleByProps(...props) || null;
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
    const BdApi = this.BdApi;
    try {
      const byStrings = BdApi?.Webpack?.Filters?.byStrings;
      if (byStrings && BdApi?.Webpack?.getModule) {
        return BdApi.Webpack.getModule(byStrings(...strings), { searchExports: true }) || null;
      }
    } catch (error) {
      this.warn(`byStrings threw: ${error?.message || error}`);
    }
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
      // Strong filter first: the real store exposes the full audio surface,
      // which rules out component props and other partial lookalikes.
      const strong = (m) => m && typeof m === "object" && !m.$$typeof
        && typeof m.getOutputVolume === "function"
        && typeof m.setOutputVolume === "function"
        && (typeof m.getMediaEngine === "function"
          || typeof m.getInputVolume === "function"
          || typeof m.isSelfMute === "function");
      return this.findModule(strong, { searchExports: false })
        || this.findModule(strong, { searchExports: true })
        || this.findByProps("getOutputVolume", "setOutputVolume")
        || this.findModule((m) => typeof m?.getOutputVolume === "function" && typeof m?.setOutputVolume === "function");
    });
  }

  getVoiceActions() {
    return this.cached("voiceActions", () => (
      this.findByProps("toggleSelfMute", "toggleSelfDeaf")
      || this.findModule((m) => typeof m?.toggleSelfMute === "function" && typeof m?.toggleSelfDeaf === "function")
    ));
  }

  getChannelActions() {
    return this.cached("channelActions", () => (
      this.findModule((m) => typeof m?.selectChannel === "function" && typeof m?.selectVoiceChannel === "function")
      || this.findModule((m) => typeof m?.selectChannel === "function")
    ));
  }

  getChannelRouter() {
    return this.cached("channelRouter", () => this.findByProps("transitionToChannel"));
  }

  getMessageActions() {
    return this.cached("messageActions", () => (
      this.findModule((m) => typeof m?.sendMessage === "function" && typeof m?.receiveMessage === "function")
      || this.findModule((m) => typeof m?.sendMessage === "function")
    ));
  }

  getSelectedChannelStore() {
    return this.cached("selectedChannel", () => (
      this.findByProps("getCurrentlySelectedChannelId")
      || this.findByProps("getLastSelectedChannelId")
    ));
  }

  getUserStore() {
    return this.cached("userStore", () => this.findByProps("getCurrentUser"));
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

  getOutputVolume() {
    try {
      const v = this.getMediaEngineStore()?.getOutputVolume?.();
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  }

  getInputVolume() {
    try {
      const v = this.getMediaEngineStore()?.getInputVolume?.();
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  }

  // Writes go through Flux (what Discord's own UI uses) plus a direct store
  // call, then read back the value so toasts report ground truth instead of
  // assuming the write landed.
  setOutputVolume(value) {
    const v = DiscordBridge.clampVolume(value);
    if (v === null) return { ok: false, message: "Volume must be between 0 and 100." };
    const before = this.getOutputVolume();
    let viaActions = false;
    try {
      const voice = this.getVoiceActions();
      if (voice && typeof voice.setOutputVolume === "function") {
        voice.setOutputVolume(v);
        viaActions = true;
      }
    } catch (error) {
      this.debug(`voice setOutputVolume threw: ${error?.message || error}`);
    }
    const res = this.dispatch("AUDIO_SET_OUTPUT_VOLUME", { volume: v });
    let direct = false;
    try {
      const store = this.getMediaEngineStore();
      if (store && typeof store.setOutputVolume === "function") {
        store.setOutputVolume(v);
        direct = true;
      }
    } catch { /* actions/flux paths above are primary */ }
    if (!viaActions && !res.ok && !direct) {
      this.warn("output volume: no write path available");
      return { ok: false, message: "Couldn't reach Discord's speaker controls — Discord may have updated." };
    }
    const out = this.verifyVolume("Output", before, v);
    this.info(`output volume ${before ?? "?"} -> ${v} via ${[viaActions && "actions", res.ok && "flux", direct && "direct"].filter(Boolean).join("+")}: ${out.message}`);
    return out;
  }

  setInputVolume(value) {
    const v = DiscordBridge.clampVolume(value);
    if (v === null) return { ok: false, message: "Volume must be between 0 and 100." };
    const before = this.getInputVolume();
    let viaActions = false;
    try {
      const voice = this.getVoiceActions();
      if (voice && typeof voice.setInputVolume === "function") {
        voice.setInputVolume(v);
        viaActions = true;
      }
    } catch (error) {
      this.debug(`voice setInputVolume threw: ${error?.message || error}`);
    }
    const res = this.dispatch("AUDIO_SET_INPUT_VOLUME", { volume: v });
    let direct = false;
    try {
      const store = this.getMediaEngineStore();
      if (store && typeof store.setInputVolume === "function") {
        store.setInputVolume(v);
        direct = true;
      }
    } catch { /* actions/flux paths above are primary */ }
    if (!viaActions && !res.ok && !direct) {
      this.warn("input volume: no write path available");
      return { ok: false, message: "Couldn't reach Discord's microphone controls — Discord may have updated." };
    }
    const out = this.verifyVolume("Input", before, v);
    this.info(`input volume ${before ?? "?"} -> ${v} via ${[viaActions && "actions", res.ok && "flux", direct && "direct"].filter(Boolean).join("+")}: ${out.message}`);
    return out;
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
    return this.readFlag(["isSelfMute", "isSelfMuted", "isMuted"]);
  }

  isSelfDeaf() {
    return this.readFlag(["isSelfDeaf", "isSelfDeafened", "isDeafened"]);
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
    const res = this.dispatch("VOICE_CHANNEL_SELECT", { channelId: null });
    if (res.ok) return { ok: true, message: "Left the voice channel" };
    try {
      const actions = this.getChannelActions();
      if (actions && typeof actions.selectVoiceChannel === "function") {
        actions.selectVoiceChannel(null);
        return { ok: true, message: "Left the voice channel" };
      }
    } catch { /* ignore */ }
    return res.ok ? res : { ok: false, message: res.message || "Couldn't leave the voice channel." };
  }

  goToChannel(guildId, channelId) {
    if (!guildId || !channelId) return { ok: false, message: "This keybind needs a server and channel ID." };
    const res = this.dispatch("CHANNEL_SELECT", { channelId: String(channelId), guildId: String(guildId) });
    if (res.ok) return { ok: true, message: "Switched channel" };
    try {
      const actions = this.getChannelActions();
      if (actions && typeof actions.selectChannel === "function") {
        if (actions.selectChannel.length >= 2) actions.selectChannel(guildId, channelId);
        else actions.selectChannel(channelId);
        return { ok: true, message: "Switched channel" };
      }
      const router = this.getChannelRouter();
      if (router && typeof router.transitionToChannel === "function") {
        router.transitionToChannel(channelId);
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
      if (typeof store.getCurrentlySelectedChannelId === "function") {
        return store.getCurrentlySelectedChannelId() || null;
      }
      if (typeof store.getLastSelectedChannelId === "function") {
        return store.getLastSelectedChannelId() || null;
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
      const res = actions.sendMessage(String(channelId), { content: String(content) });
      if (res && typeof res.then === "function") await res;
      return { ok: true, message: "Message sent" };
    } catch (error) {
      return { ok: false, message: error?.message || String(error) };
    }
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

  // Read-only inspection of the volume write path: which setters exist,
  // whether Flux has a handler for the volume event, and what the setter
  // functions look like. Decisive for "dispatch goes nowhere" diagnosis.
  inspectAudioPath() {
    const out = {
      fluxAudioTypes: [],
      fluxHandlerCount: null,
      fluxTotalTypes: null,
      hasOutputVolumeHandler: null,
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
    try {
      const flux = this.getFlux();
      const handlers = flux?._actionHandlers;
      const types = [];
      if (handlers instanceof Map) {
        for (const key of handlers.keys()) types.push(key);
      } else if (handlers && typeof handlers === "object") {
        types.push(...Object.keys(handlers));
      }
      if (types.length || handlers) {
        out.fluxTotalTypes = types.length;
        out.fluxAudioTypes = types
          .filter((t) => /AUDIO|VOLUME|VOICE|MEDIA|SPEAK|MUTE|DEAF/i.test(String(t)))
          .map(String)
          .sort()
          .slice(0, 30);
        if (types.includes("AUDIO_SET_OUTPUT_VOLUME")) {
          out.hasOutputVolumeHandler = true;
          try {
            const entry = handlers instanceof Map
              ? handlers.get("AUDIO_SET_OUTPUT_VOLUME")
              : handlers["AUDIO_SET_OUTPUT_VOLUME"];
            out.fluxHandlerCount = typeof entry?.size === "number"
              ? entry.size
              : Array.isArray(entry) ? entry.length : 1;
          } catch {
            out.fluxHandlerCount = null;
          }
        } else if (types.length) {
          out.hasOutputVolumeHandler = false;
        }
      }
    } catch { /* ignore */ }
    return out;
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
      inputVolume: this.getInputVolume(),
      keycodeMap: Boolean(this.getKeycodeMap()),
      mediaEngine: Boolean(media),
      mediaMethods: media
        ? ["getOutputVolume", "setOutputVolume", "getInputVolume", "setInputVolume", "getMediaEngine", "isSelfMute", "isSelfDeaf"]
          .filter((k) => typeof media[k] === "function")
        : [],
      messageActions: Boolean(this.getMessageActions()),
      outputVolume: this.getOutputVolume(),
      platform: this.getPlatform(),
      selectedChannel: Boolean(this.getSelectedChannelStore()),
      selfDeaf: this.isSelfDeaf(),
      selfMute: this.isSelfMute(),
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
    return `${mods} vset:${vset} ovolh:${oh} out:${p.outputVolume ?? "?"} in:${p.inputVolume ?? "?"}`;
  }

  diagnosticsText(header = "") {
    const p = this.probe();
    const yn = (v) => (v ? "found" : "MISSING");
    const val = (v) => (v === null || v === undefined ? "unreadable" : String(v));
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
      `setterSource(setOutputVolume): ${p.audioPath?.sources?.setOutputVolume || "n/a"}`,
      `outputVolume: ${val(p.outputVolume)}`,
      `inputVolume: ${val(p.inputVolume)}`,
      `selfMute: ${val(p.selfMute)}`,
      `selfDeaf: ${val(p.selfDeaf)}`
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
