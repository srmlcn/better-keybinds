"use strict";

const { extractKeycodeMap } = require("./keybinds");

// Lazy, fault-tolerant access to Discord's internal webpack modules.
// Every getter returns null (never throws) so Discord client updates
// degrade to per-action errors instead of breaking the whole plugin.
class DiscordBridge {
  constructor(BdApi) {
    this.BdApi = BdApi;
    this.cache = new Map();
    this.lastAttempt = new Map();
    this.retryTtlMs = 5000;
    this.utilsTried = false;
    this.utilsCache = null;
    this.keymapCache = new Map();
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
    try {
      if (BdApi?.Webpack?.getModule) {
        return BdApi.Webpack.getModule(filter, { searchExports }) || null;
      }
    } catch { /* fall through to legacy */ }
    try {
      if (typeof BdApi?.findModule === "function") return BdApi.findModule(filter) || null;
    } catch { /* ignore */ }
    return null;
  }

  findByProps(...props) {
    const BdApi = this.BdApi;
    try {
      const byProps = BdApi?.Webpack?.Filters?.byProps;
      if (byProps && BdApi?.Webpack?.getModule) {
        return BdApi.Webpack.getModule(byProps(...props), { searchExports: true }) || null;
      }
    } catch { /* ignore */ }
    try {
      if (typeof BdApi?.findModuleByProps === "function") {
        return BdApi.findModuleByProps(...props) || null;
      }
    } catch { /* ignore */ }
    return this.findModule(
      (m) => m && typeof m === "object" && props.every((p) => m[p] !== undefined),
      { searchExports: true }
    );
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
    if (value) this.cache.set(key, value);
    return value;
  }

  getFlux() {
    return this.cached("flux", () => (
      this.findByProps("dispatch", "subscribe", "unsubscribe")
      || this.findModule((m) => typeof m?.dispatch === "function" && typeof m?.subscribe === "function")
    ));
  }

  getMediaEngineStore() {
    return this.cached("mediaEngine", () => (
      this.findByProps("getOutputVolume", "setOutputVolume")
      || this.findByProps("getMediaEngine", "getOutputVolume")
      || this.findModule((m) => typeof m?.getOutputVolume === "function" && typeof m?.setOutputVolume === "function")
    ));
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

  dispatch(type, payload = {}) {
    const flux = this.getFlux();
    if (!flux || typeof flux.dispatch !== "function") {
      return { ok: false, message: "Flux dispatcher unavailable (Discord update?)." };
    }
    try {
      flux.dispatch({ type, ...payload });
      return { ok: true };
    } catch (error) {
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

  setOutputVolume(value) {
    const v = DiscordBridge.clampVolume(value);
    if (v === null) return { ok: false, message: `Invalid volume: ${value}` };
    const store = this.getMediaEngineStore();
    let direct = false;
    try {
      if (store && typeof store.setOutputVolume === "function") {
        store.setOutputVolume(v);
        direct = true;
      }
    } catch { /* Flux fallback below */ }
    const res = this.dispatch("AUDIO_SET_OUTPUT_VOLUME", { volume: v });
    if (direct || res.ok) return { ok: true, message: `Output volume ${v}%` };
    return { ok: false, message: "Output volume module unavailable (Discord update?)." };
  }

  setInputVolume(value) {
    const v = DiscordBridge.clampVolume(value);
    if (v === null) return { ok: false, message: `Invalid volume: ${value}` };
    const store = this.getMediaEngineStore();
    let direct = false;
    try {
      if (store && typeof store.setInputVolume === "function") {
        store.setInputVolume(v);
        direct = true;
      }
    } catch { /* Flux fallback below */ }
    const res = this.dispatch("AUDIO_SET_INPUT_VOLUME", { volume: v });
    if (direct || res.ok) return { ok: true, message: `Input volume ${v}%` };
    return { ok: false, message: "Input volume module unavailable (Discord update?)." };
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
    try {
      const voice = this.getVoiceActions();
      if (voice && typeof voice.toggleSelfMute === "function") {
        voice.toggleSelfMute();
        return { ok: true, message: "Toggled mute" };
      }
    } catch { /* Flux fallback below */ }
    const res = this.dispatch("AUDIO_TOGGLE_SELF_MUTE", { context: "default", syncRemote: true });
    return res.ok ? { ok: true, message: "Toggled mute" } : res;
  }

  toggleSelfDeaf() {
    try {
      const voice = this.getVoiceActions();
      if (voice && typeof voice.toggleSelfDeaf === "function") {
        voice.toggleSelfDeaf();
        return { ok: true, message: "Toggled deafen" };
      }
    } catch { /* Flux fallback below */ }
    const res = this.dispatch("AUDIO_TOGGLE_SELF_DEAF", { context: "default", syncRemote: true });
    return res.ok ? { ok: true, message: "Toggled deafen" } : res;
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
    if (res.ok) return { ok: true, message: "Disconnected from voice" };
    try {
      const actions = this.getChannelActions();
      if (actions && typeof actions.selectVoiceChannel === "function") {
        actions.selectVoiceChannel(null);
        return { ok: true, message: "Disconnected from voice" };
      }
    } catch { /* ignore */ }
    return res.ok ? res : { ok: false, message: res.message || "Voice disconnect unavailable." };
  }

  goToChannel(guildId, channelId) {
    if (!guildId || !channelId) return { ok: false, message: "Guild ID and channel ID are required." };
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
    return { ok: false, message: res.message || "Channel switch unavailable." };
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
    if (!channelId) return { ok: false, message: "No channel selected." };
    if (!content || !String(content).trim()) return { ok: false, message: "Message text is empty." };
    if (String(content).length > 2000) return { ok: false, message: "Message exceeds 2000 characters." };
    const actions = this.getMessageActions();
    if (!actions || typeof actions.sendMessage !== "function") {
      return { ok: false, message: "Message module unavailable (Discord update?)." };
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
    return found;
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
      console.log(`[KeybindMacros] ${text}`);
    } catch { /* ignore */ }
  }
}

module.exports = { DiscordBridge };
