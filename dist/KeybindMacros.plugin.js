/**
 * @name KeybindMacros
 * @author Cognitive AI
 * @description Custom keybind macros: speaker volume 50/100 toggle, mute/deafen, navigation, messaging and utilities.
 * @version 1.0.0
 * @runAt idle
 */
"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/lib/keybinds.js
var require_keybinds = __commonJS({
  "src/lib/keybinds.js"(exports2, module2) {
    "use strict";
    var MAX_KEYS = 5;
    var MODIFIER_ALIASES = {
      alt: "Alt",
      cmd: "Meta",
      command: "Meta",
      control: "Control",
      ctl: "Control",
      ctrl: "Control",
      meta: "Meta",
      option: "Alt",
      os: "Meta",
      shift: "Shift",
      super: "Meta",
      win: "Meta",
      windows: "Meta"
    };
    var SPECIAL_ALIASES = {
      " ": "Space",
      apps: "ContextMenu",
      backspace: "Backspace",
      break: "Pause",
      capslock: "CapsLock",
      clear: "Clear",
      contextmenu: "ContextMenu",
      del: "Delete",
      delete: "Delete",
      down: "ArrowDown",
      end: "End",
      enter: "Enter",
      esc: "Escape",
      escape: "Escape",
      help: "Help",
      home: "Home",
      ins: "Insert",
      insert: "Insert",
      left: "ArrowLeft",
      mediaplaypause: "MediaPlayPause",
      medianext: "MediaTrackNext",
      mediaprev: "MediaTrackPrevious",
      mediastop: "MediaStop",
      menu: "ContextMenu",
      numlock: "NumLock",
      pagedown: "PageDown",
      pageup: "PageUp",
      pause: "Pause",
      printscreen: "PrintScreen",
      prtsc: "PrintScreen",
      return: "Enter",
      right: "ArrowRight",
      scrolllock: "ScrollLock",
      sleep: "Sleep",
      space: "Space",
      spacebar: "Space",
      tab: "Tab",
      up: "ArrowUp",
      volumedown: "AudioVolumeDown",
      volumemute: "AudioVolumeMute",
      volumeup: "AudioVolumeUp"
    };
    var ARROW_RE = /^arrow(up|down|left|right)$/i;
    var CODE_SIDE_RE = /^(control|ctrl|shift|alt|meta)(left|right|l|r)$/i;
    var ECODE_KEY_RE = /^key([a-z])$/i;
    var ECODE_DIGIT_RE = /^digit([0-9])$/i;
    var FKEY_RE = /^f(\d{1,2})$/i;
    function normalizeKeyName(raw) {
      if (raw === null || raw === void 0) return null;
      if (raw === " ") return "Space";
      const s = String(raw).trim();
      if (!s || s === "Unidentified" || s === "Dead") return null;
      const fkey = FKEY_RE.exec(s);
      if (fkey) {
        const n = parseInt(fkey[1], 10);
        if (n >= 1 && n <= 24) return `F${n}`;
        return null;
      }
      const lower = s.toLowerCase();
      if (MODIFIER_ALIASES[lower]) return MODIFIER_ALIASES[lower];
      if (SPECIAL_ALIASES[lower]) return SPECIAL_ALIASES[lower];
      const side = CODE_SIDE_RE.exec(s);
      if (side) {
        const base = side[1].toLowerCase();
        return MODIFIER_ALIASES[base === "ctrl" ? "ctrl" : base] || "Control";
      }
      const ekey = ECODE_KEY_RE.exec(s);
      if (ekey) return ekey[1].toUpperCase();
      const edigit = ECODE_DIGIT_RE.exec(s);
      if (edigit) return edigit[1];
      const arrow = ARROW_RE.exec(s);
      if (arrow) {
        const dir = arrow[1].toLowerCase();
        return `Arrow${dir.charAt(0).toUpperCase()}${dir.slice(1)}`;
      }
      if (s.length === 1) {
        if (/[a-z]/i.test(s)) return s.toUpperCase();
        return s;
      }
      return s;
    }
    function eventToKeyName(event) {
      if (!event || typeof event.key !== "string") return null;
      return normalizeKeyName(event.key);
    }
    function normalizeKeybind(bind, max = MAX_KEYS) {
      if (!Array.isArray(bind)) return [];
      const out = [];
      for (const raw of bind) {
        const key = normalizeKeyName(raw);
        if (key && !out.includes(key)) out.push(key);
        if (out.length >= max) break;
      }
      return out;
    }
    function sortedCopy(bind) {
      return normalizeKeybind(bind, 99).sort();
    }
    function keybindsEqual(a, b) {
      const sa = sortedCopy(a);
      const sb = sortedCopy(b);
      return sa.length === sb.length && sa.every((k, i) => k === sb[i]);
    }
    function conflictKey(bind) {
      const sorted = sortedCopy(bind);
      return sorted.length ? sorted.join("+") : "";
    }
    function keybindToString(bind) {
      const norm = normalizeKeybind(bind, 99);
      return norm.length ? norm.join(" + ") : "Not set";
    }
    function pressedMatches(pressed, bind) {
      const norm = normalizeKeybind(bind, 99);
      if (!norm.length) return false;
      const set = pressed instanceof Set ? pressed : new Set(normalizeKeybind([...pressed], 99));
      if (set.size !== norm.length) return false;
      return norm.every((k) => set.has(k));
    }
    function isSinglePrintable(bind) {
      const norm = normalizeKeybind(bind, 99);
      return norm.length === 1 && norm[0].length === 1;
    }
    function isEditableTarget(target) {
      if (!target) return false;
      if (target.isContentEditable) return true;
      const tag = typeof target.tagName === "string" ? target.tagName.toUpperCase() : "";
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    }
    function shouldSkipForTarget(bind, target) {
      return isSinglePrintable(bind) && isEditableTarget(target);
    }
    function mapKeyCandidates(name) {
      const lower = String(name).toLowerCase();
      const table = {
        alt: ["alt", "option"],
        arrowdown: ["down", "arrowdown"],
        arrowleft: ["left", "arrowleft"],
        arrowright: ["right", "arrowright"],
        arrowup: ["up", "arrowup"],
        audiovolumedown: ["volumedown"],
        audiovolumemute: ["volumemute", "mute"],
        audiovolumeup: ["volumeup"],
        backspace: ["backspace"],
        capslock: ["capslock"],
        clear: ["clear"],
        contextmenu: ["contextmenu", "apps", "menu"],
        control: ["ctrl", "control"],
        delete: ["delete", "del"],
        end: ["end"],
        enter: ["enter", "return"],
        escape: ["escape", "esc"],
        home: ["home"],
        insert: ["insert", "ins"],
        meta: ["meta", "cmd", "command", "win", "super"],
        numlock: ["numlock"],
        pagedown: ["pagedown", "pgdn"],
        pageup: ["pageup", "pgup"],
        pause: ["pause", "break"],
        printscreen: ["printscreen", "prtsc"],
        scrolllock: ["scrolllock"],
        shift: ["shift"],
        space: ["space", "spacebar"],
        tab: ["tab"]
      };
      if (table[lower]) return [lower, ...table[lower]];
      return [lower];
    }
    function lookupInMap(name, map) {
      if (!map || typeof map !== "object") return null;
      for (const key of mapKeyCandidates(name)) {
        const code = map[key];
        if (typeof code === "number" && Number.isFinite(code)) return code;
      }
      return null;
    }
    function buildWindowsFallback() {
      const map = {
        alt: 164,
        apps: 93,
        arrowdown: 40,
        arrowleft: 37,
        arrowright: 39,
        arrowup: 38,
        backspace: 8,
        break: 19,
        capslock: 20,
        cmd: 91,
        command: 91,
        contextmenu: 93,
        control: 162,
        ctrl: 162,
        del: 46,
        delete: 46,
        down: 40,
        end: 35,
        enter: 13,
        esc: 27,
        escape: 27,
        home: 36,
        ins: 45,
        insert: 45,
        left: 37,
        menu: 93,
        meta: 91,
        numlock: 144,
        option: 164,
        pagedown: 34,
        pageup: 33,
        pause: 19,
        pgdn: 34,
        pgup: 33,
        printscreen: 44,
        prtsc: 44,
        return: 13,
        right: 39,
        scrolllock: 145,
        shift: 160,
        space: 32,
        spacebar: 32,
        super: 91,
        tab: 9,
        up: 38,
        volumedown: 174,
        volumemute: 173,
        volumeup: 175,
        win: 91
      };
      for (let i = 0; i < 26; i++) map[String.fromCharCode(97 + i)] = 65 + i;
      for (let i = 0; i < 10; i++) map[String(i)] = 48 + i;
      for (let i = 1; i <= 24; i++) map[`f${i}`] = 111 + i;
      return map;
    }
    var WINDOWS_FALLBACK_VK = buildWindowsFallback();
    function buildGlobalKeyArray(keybind, keycodeMap, fallbackMap) {
      const norm = normalizeKeybind(keybind, 99);
      const missing = [];
      const keys = [];
      for (const name of norm) {
        let code = lookupInMap(name, keycodeMap);
        if (code === null) code = lookupInMap(name, fallbackMap);
        if (code === null) {
          missing.push(name);
          continue;
        }
        keys.push([0, code]);
      }
      if (!norm.length) return { error: "Empty keybind", missing: [] };
      if (missing.length) return { error: `No keycode for: ${missing.join(", ")}`, missing };
      return { keys };
    }
    function extractKeycodeMap(mod) {
      if (!mod || typeof mod !== "object") return null;
      if (typeof mod.ctrl === "number") return mod;
      for (const value of Object.values(mod)) {
        if (value && typeof value === "object" && typeof value.ctrl === "number") return value;
      }
      return null;
    }
    module2.exports = {
      MAX_KEYS,
      WINDOWS_FALLBACK_VK,
      buildGlobalKeyArray,
      conflictKey,
      eventToKeyName,
      extractKeycodeMap,
      isEditableTarget,
      isSinglePrintable,
      keybindToString,
      keybindsEqual,
      lookupInMap,
      mapKeyCandidates,
      normalizeKeyName,
      normalizeKeybind,
      pressedMatches,
      shouldSkipForTarget
    };
  }
});

// src/lib/discord.js
var require_discord = __commonJS({
  "src/lib/discord.js"(exports2, module2) {
    "use strict";
    var { extractKeycodeMap } = require_keybinds();
    var DiscordBridge2 = class _DiscordBridge {
      constructor(BdApi) {
        this.BdApi = BdApi;
        this.cache = /* @__PURE__ */ new Map();
        this.lastAttempt = /* @__PURE__ */ new Map();
        this.retryTtlMs = 5e3;
        this.utilsTried = false;
        this.utilsCache = null;
        this.keymapCache = /* @__PURE__ */ new Map();
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
        } catch {
        }
        try {
          if (typeof BdApi?.findModule === "function") return BdApi.findModule(filter) || null;
        } catch {
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
        } catch {
        }
        try {
          if (typeof BdApi?.findModuleByProps === "function") {
            return BdApi.findModuleByProps(...props) || null;
          }
        } catch {
        }
        return this.findModule(
          (m) => m && typeof m === "object" && props.every((p) => m[p] !== void 0),
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
        return this.cached("flux", () => this.findByProps("dispatch", "subscribe", "unsubscribe") || this.findModule((m) => typeof m?.dispatch === "function" && typeof m?.subscribe === "function"));
      }
      getMediaEngineStore() {
        return this.cached("mediaEngine", () => this.findByProps("getOutputVolume", "setOutputVolume") || this.findByProps("getMediaEngine", "getOutputVolume") || this.findModule((m) => typeof m?.getOutputVolume === "function" && typeof m?.setOutputVolume === "function"));
      }
      getVoiceActions() {
        return this.cached("voiceActions", () => this.findByProps("toggleSelfMute", "toggleSelfDeaf") || this.findModule((m) => typeof m?.toggleSelfMute === "function" && typeof m?.toggleSelfDeaf === "function"));
      }
      getChannelActions() {
        return this.cached("channelActions", () => this.findModule((m) => typeof m?.selectChannel === "function" && typeof m?.selectVoiceChannel === "function") || this.findModule((m) => typeof m?.selectChannel === "function"));
      }
      getChannelRouter() {
        return this.cached("channelRouter", () => this.findByProps("transitionToChannel"));
      }
      getMessageActions() {
        return this.cached("messageActions", () => this.findModule((m) => typeof m?.sendMessage === "function" && typeof m?.receiveMessage === "function") || this.findModule((m) => typeof m?.sendMessage === "function"));
      }
      getSelectedChannelStore() {
        return this.cached("selectedChannel", () => this.findByProps("getCurrentlySelectedChannelId") || this.findByProps("getLastSelectedChannelId"));
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
        const v = _DiscordBridge.clampVolume(value);
        if (v === null) return { ok: false, message: `Invalid volume: ${value}` };
        const store = this.getMediaEngineStore();
        let direct = false;
        try {
          if (store && typeof store.setOutputVolume === "function") {
            store.setOutputVolume(v);
            direct = true;
          }
        } catch {
        }
        const res = this.dispatch("AUDIO_SET_OUTPUT_VOLUME", { volume: v });
        if (direct || res.ok) return { ok: true, message: `Output volume ${v}%` };
        return { ok: false, message: "Output volume module unavailable (Discord update?)." };
      }
      setInputVolume(value) {
        const v = _DiscordBridge.clampVolume(value);
        if (v === null) return { ok: false, message: `Invalid volume: ${value}` };
        const store = this.getMediaEngineStore();
        let direct = false;
        try {
          if (store && typeof store.setInputVolume === "function") {
            store.setInputVolume(v);
            direct = true;
          }
        } catch {
        }
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
          } catch {
          }
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
        } catch {
        }
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
        } catch {
        }
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
        } catch {
        }
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
        } catch {
        }
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
        } catch {
        }
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
        } catch {
        }
        return null;
      }
      async sendMessage(channelId, content) {
        if (!channelId) return { ok: false, message: "No channel selected." };
        if (!content || !String(content).trim()) return { ok: false, message: "Message text is empty." };
        if (String(content).length > 2e3) return { ok: false, message: "Message exceeds 2000 characters." };
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
        } catch {
        }
        try {
          const nav = globalThis.navigator;
          const plat = nav?.userAgentData?.platform || nav?.platform || "";
          if (/win/i.test(plat)) return "win32";
          if (/mac/i.test(plat)) return "darwin";
          if (/linux/i.test(plat)) return "linux";
        } catch {
        }
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
          darwin: (m) => m?.ctrl === 224,
          linux: (m) => m?.ctrl === 37,
          win32: (m) => m?.ctrl === 162
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
        } catch {
        }
        try {
          console.log(`[KeybindMacros] ${text}`);
        } catch {
        }
      }
    };
    module2.exports = { DiscordBridge: DiscordBridge2 };
  }
});

// src/lib/registrations.js
var require_registrations = __commonJS({
  "src/lib/registrations.js"(exports2, module2) {
    "use strict";
    var {
      WINDOWS_FALLBACK_VK,
      buildGlobalKeyArray,
      eventToKeyName,
      normalizeKeybind,
      pressedMatches,
      shouldSkipForTarget
    } = require_keybinds();
    var TRIGGER_DEBOUNCE_MS = 150;
    var GLOBAL_ID_BASE = 41e5;
    var GLOBAL_ID_RANGE = 5e4;
    function numericIdFor(macroId) {
      const s = String(macroId);
      let h = 0;
      for (let i = 0; i < s.length; i++) h = h * 31 + s.charCodeAt(i) | 0;
      return GLOBAL_ID_BASE + Math.abs(h) % GLOBAL_ID_RANGE;
    }
    var MacroEngine2 = class {
      constructor({ discord, getMacros, notify, runMacroById }) {
        this.discord = discord;
        this.getMacros = getMacros;
        this.notify = notify || (() => {
        });
        this.runMacroById = runMacroById;
        this.pressed = /* @__PURE__ */ new Set();
        this.fired = /* @__PURE__ */ new Set();
        this.lastFired = /* @__PURE__ */ new Map();
        this.globalIds = /* @__PURE__ */ new Map();
        this.globalStatus = { errors: [], registered: 0, supported: false };
        this.lastGlobalErrorSig = "";
        this.started = false;
        this.onKeyDown = (e) => this.handleKeyDown(e);
        this.onKeyUp = (e) => this.handleKeyUp(e);
        this.onBlur = () => this.handleBlur();
      }
      start() {
        if (this.started) return;
        this.started = true;
        if (typeof window !== "undefined" && window.addEventListener) {
          window.addEventListener("keydown", this.onKeyDown);
          window.addEventListener("keyup", this.onKeyUp);
          window.addEventListener("blur", this.onBlur);
        }
        this.refresh();
      }
      stop() {
        this.started = false;
        if (typeof window !== "undefined" && window.removeEventListener) {
          window.removeEventListener("keydown", this.onKeyDown);
          window.removeEventListener("keyup", this.onKeyUp);
          window.removeEventListener("blur", this.onBlur);
        }
        this.unregisterAllGlobal();
        this.pressed.clear();
        this.fired.clear();
      }
      refresh() {
        this.refreshGlobal();
      }
      activeMacros() {
        return (this.getMacros() || []).filter((m) => m && m.enabled && m.keybind && m.keybind.length);
      }
      handleKeyDown(event) {
        if (!event || event.repeat || event.defaultPrevented) return;
        const key = eventToKeyName(event);
        if (!key) return;
        this.pressed.add(key);
        const now = Date.now();
        for (const macro of this.activeMacros()) {
          if (!pressedMatches(this.pressed, macro.keybind)) continue;
          if (this.fired.has(macro.id)) continue;
          if (shouldSkipForTarget(macro.keybind, event.target)) continue;
          if (now - (this.lastFired.get(macro.id) || 0) < TRIGGER_DEBOUNCE_MS) continue;
          this.fired.add(macro.id);
          this.lastFired.set(macro.id, now);
          try {
            this.runMacroById(macro.id, "in-app");
          } catch {
          }
        }
      }
      handleKeyUp(event) {
        const key = eventToKeyName(event);
        if (key) this.pressed.delete(key);
        if (this.fired.size === 0) return;
        const macros = new Map((this.getMacros() || []).map((m) => [m.id, m]));
        for (const id of [...this.fired]) {
          const macro = macros.get(id);
          const bind = normalizeKeybind(macro?.keybind, 99);
          if (!key || bind.includes(key) || !macro) this.fired.delete(id);
        }
      }
      handleBlur() {
        this.pressed.clear();
        this.fired.clear();
      }
      handleGlobalTrigger(macroId) {
        const now = Date.now();
        if (now - (this.lastFired.get(macroId) || 0) < TRIGGER_DEBOUNCE_MS) return;
        this.lastFired.set(macroId, now);
        try {
          this.runMacroById(macroId, "global");
        } catch {
        }
      }
      unregisterAllGlobal() {
        if (this.globalIds.size === 0) return;
        const utils = this.discord?.getDiscordUtils?.();
        for (const [, numId] of this.globalIds) {
          try {
            utils?.inputEventUnregister?.(numId);
          } catch {
          }
        }
        this.globalIds.clear();
      }
      // Global registrations cover Discord-blurred only; the in-app listener
      // covers the focused case so macros never double-fire.
      refreshGlobal() {
        this.unregisterAllGlobal();
        const supported = Boolean(this.discord?.hasGlobalSupport?.());
        this.globalStatus = { errors: [], registered: 0, supported };
        const wanted = (this.getMacros() || []).filter((m) => m && m.enabled && m.global && m.keybind && m.keybind.length);
        if (!wanted.length) {
          this.lastGlobalErrorSig = "";
          return;
        }
        if (!supported) {
          this.globalStatus.errors.push("DiscordNative global shortcuts unavailable; global macros work in-app only.");
          this.notifyGlobalErrors();
          return;
        }
        const utils = this.discord.getDiscordUtils();
        const map = this.discord.getKeycodeMap();
        for (const macro of wanted) {
          const { error, keys } = buildGlobalKeyArray(macro.keybind, map, WINDOWS_FALLBACK_VK);
          if (error || !keys) {
            this.globalStatus.errors.push(`"${macro.name}": ${error || "unresolvable keybind"}`);
            continue;
          }
          const numId = numericIdFor(macro.id);
          try {
            utils.inputEventRegister(
              numId,
              keys,
              (isDown) => {
                if (isDown) this.handleGlobalTrigger(macro.id);
              },
              { blurred: true, focused: false, keydown: true, keyup: false }
            );
            this.globalIds.set(macro.id, numId);
            this.globalStatus.registered += 1;
          } catch (err) {
            this.globalStatus.errors.push(`"${macro.name}": ${err?.message || err}`);
          }
        }
        this.notifyGlobalErrors();
      }
      notifyGlobalErrors() {
        const sig = this.globalStatus.errors.join("|");
        if (!sig || sig === this.lastGlobalErrorSig) return;
        this.lastGlobalErrorSig = sig;
        const first = this.globalStatus.errors[0];
        const extra = this.globalStatus.errors.length > 1 ? ` (+${this.globalStatus.errors.length - 1} more)` : "";
        this.notify(`Global keybinds: ${first}${extra}`, "warning");
      }
    };
    module2.exports = { GLOBAL_ID_BASE, MacroEngine: MacroEngine2, numericIdFor };
  }
});

// src/lib/actions.js
var require_actions = __commonJS({
  "src/lib/actions.js"(exports2, module2) {
    "use strict";
    var ACTION_DEFS = [
      {
        category: "Output volume",
        description: "Set speaker output to an exact percentage.",
        label: "Set output volume",
        params: [{ default: 100, key: "volume", label: "Volume %", max: 100, min: 0, type: "volume" }],
        type: "output.set"
      },
      {
        category: "Output volume",
        description: "Raise or lower speaker output relative to current.",
        label: "Adjust output volume",
        params: [{ default: 10, key: "delta", label: "Change (+/-)", max: 100, min: -100, type: "delta" }],
        type: "output.adjust"
      },
      {
        category: "Output volume",
        description: "Flip speaker output between two levels (nearest wins).",
        label: "Toggle output volume",
        params: [
          { default: 50, key: "a", label: "Level A %", max: 100, min: 0, type: "volume" },
          { default: 100, key: "b", label: "Level B %", max: 100, min: 0, type: "volume" }
        ],
        type: "output.toggle"
      },
      {
        category: "Input volume",
        description: "Set microphone input to an exact percentage.",
        label: "Set input volume",
        params: [{ default: 100, key: "volume", label: "Volume %", max: 100, min: 0, type: "volume" }],
        type: "input.set"
      },
      {
        category: "Input volume",
        description: "Raise or lower microphone input relative to current.",
        label: "Adjust input volume",
        params: [{ default: 10, key: "delta", label: "Change (+/-)", max: 100, min: -100, type: "delta" }],
        type: "input.adjust"
      },
      {
        category: "Self voice",
        description: "Mute yourself if unmuted, unmute if muted.",
        label: "Toggle self mute",
        params: [],
        type: "self.toggleMute"
      },
      {
        category: "Self voice",
        description: "Set an explicit mute state.",
        label: "Set self mute",
        params: [{ default: true, key: "muted", label: "Muted", type: "checkbox" }],
        type: "self.setMute"
      },
      {
        category: "Self voice",
        description: "Deafen yourself if hearing, undeafen if deafened.",
        label: "Toggle self deafen",
        params: [],
        type: "self.toggleDeafen"
      },
      {
        category: "Self voice",
        description: "Set an explicit deafen state.",
        label: "Set self deafen",
        params: [{ default: true, key: "deafened", label: "Deafened", type: "checkbox" }],
        type: "self.setDeafen"
      },
      {
        category: "Self voice",
        description: "Leave the current voice channel.",
        label: "Disconnect from voice",
        params: [],
        type: "voice.disconnect"
      },
      {
        category: "Channels",
        description: "Jump to a server channel by ID (right-click channel > Copy ID with Developer Mode on).",
        label: "Go to channel",
        params: [
          { key: "guildId", label: "Guild ID", placeholder: "123\u2026", required: true, type: "text" },
          { key: "channelId", label: "Channel ID", placeholder: "456\u2026", required: true, type: "text" }
        ],
        type: "nav.goToChannel"
      },
      {
        category: "Messages",
        description: "Send a message to the current or a saved channel.",
        label: "Send message",
        params: [
          {
            default: "current",
            key: "channelScope",
            label: "Channel",
            options: [
              { label: "Current channel", value: "current" },
              { label: "Saved channel ID", value: "saved" }
            ],
            type: "select"
          },
          { key: "channelId", label: "Channel ID (saved only)", placeholder: "456\u2026", type: "text" },
          { key: "text", label: "Text", placeholder: "Hello!", required: true, type: "textarea" }
        ],
        type: "message.send"
      },
      {
        category: "Utility",
        description: "Show a BetterDiscord toast notification.",
        label: "Show toast",
        params: [{ default: "Macro ran", key: "text", label: "Text", type: "text" }],
        type: "util.toast"
      },
      {
        category: "Utility",
        description: "Pause before the next action.",
        label: "Wait",
        params: [{ default: 500, key: "ms", label: "Milliseconds", max: 15e3, min: 0, type: "number" }],
        type: "util.wait"
      },
      {
        category: "Utility",
        description: "Open an https:// URL in the browser.",
        label: "Open URL",
        params: [{ key: "url", label: "URL", placeholder: "https://\u2026", required: true, type: "url" }],
        type: "util.openUrl"
      }
    ];
    function getActionDef(type) {
      return ACTION_DEFS.find((d) => d.type === type) || null;
    }
    function actionTypes2() {
      return ACTION_DEFS.map((d) => d.type);
    }
    function clampVolume(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      return Math.min(100, Math.max(0, Math.round(n)));
    }
    function resolveToggle(current, a, b) {
      const ca = clampVolume(a);
      const cb = clampVolume(b);
      if (ca === null || cb === null) return null;
      if (ca === cb) return ca;
      const c = Number(current);
      if (!Number.isFinite(c)) return cb;
      return Math.abs(c - cb) < Math.abs(c - ca) ? ca : cb;
    }
    function coerceNumber(raw, { max, min }) {
      if (raw === "" || raw === null || raw === void 0) return { error: "Value is required." };
      const n = Number(raw);
      if (!Number.isFinite(n)) return { error: `Not a number: ${raw}` };
      const rounded = Math.round(n);
      if (rounded < min || rounded > max) return { error: `Must be between ${min} and ${max}.` };
      return { value: rounded };
    }
    function coerceParams(def, params) {
      const values = {};
      const errors = [];
      for (const spec of def.params || []) {
        const raw = params ? params[spec.key] : void 0;
        if (spec.type === "checkbox") {
          values[spec.key] = raw === true || raw === "true" || raw === 1;
          continue;
        }
        if (spec.type === "select") {
          const allowed = (spec.options || []).map((o) => o.value);
          if (!allowed.includes(raw)) {
            errors.push(`${spec.label}: must be one of ${allowed.join(", ")}.`);
            continue;
          }
          values[spec.key] = raw;
          continue;
        }
        if (spec.type === "volume" || spec.type === "delta" || spec.type === "number") {
          const { error, value } = coerceNumber(raw, spec);
          if (error) {
            errors.push(`${spec.label}: ${error}`);
            continue;
          }
          values[spec.key] = value;
          continue;
        }
        if (spec.type === "url") {
          const s2 = String(raw ?? "").trim();
          if (!s2 && spec.required) {
            errors.push(`${spec.label} is required.`);
            continue;
          }
          if (s2 && !/^https?:\/\//i.test(s2)) {
            errors.push(`${spec.label} must start with http:// or https://.`);
            continue;
          }
          values[spec.key] = s2;
          continue;
        }
        const s = String(raw ?? "");
        if (spec.required && !s.trim()) {
          errors.push(`${spec.label} is required.`);
          continue;
        }
        values[spec.key] = s;
      }
      return { errors, values };
    }
    function validateAction(type, params) {
      const def = getActionDef(type);
      if (!def) return [`Unknown action: ${type}`];
      return coerceParams(def, params || {}).errors;
    }
    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async function runAction(type, params, ctx) {
      const def = getActionDef(type);
      if (!def) return { message: `Unknown action: ${type}`, ok: false };
      const { errors, values } = coerceParams(def, params || {});
      if (errors.length) return { message: errors[0], ok: false };
      const discord = ctx?.discord;
      if (!discord && !type.startsWith("util.")) return { message: "Discord bridge unavailable.", ok: false };
      try {
        switch (type) {
          case "output.set":
            return discord.setOutputVolume(values.volume);
          case "output.adjust": {
            const current = discord.getOutputVolume();
            if (current === null) return { message: "Could not read current output volume.", ok: false };
            return discord.setOutputVolume(current + values.delta);
          }
          case "output.toggle": {
            const current = discord.getOutputVolume();
            const target = resolveToggle(current, values.a, values.b);
            if (target === null) return { message: "Invalid toggle levels.", ok: false };
            const res = discord.setOutputVolume(target);
            if (!res.ok) return res;
            const from = current === null ? "?" : `${Math.round(current)}%`;
            return { message: `Output volume ${from} -> ${target}%`, ok: true };
          }
          case "input.set":
            return discord.setInputVolume(values.volume);
          case "input.adjust": {
            const current = discord.getInputVolume();
            if (current === null) return { message: "Could not read current input volume.", ok: false };
            return discord.setInputVolume(current + values.delta);
          }
          case "self.toggleMute":
            return discord.toggleSelfMute();
          case "self.setMute":
            return discord.setSelfMute(values.muted);
          case "self.toggleDeafen":
            return discord.toggleSelfDeaf();
          case "self.setDeafen":
            return discord.setSelfDeaf(values.deafened);
          case "voice.disconnect":
            return discord.disconnectVoice();
          case "nav.goToChannel":
            return discord.goToChannel(values.guildId.trim(), values.channelId.trim());
          case "message.send": {
            const channelId = values.channelScope === "saved" ? String(values.channelId || "").trim() : discord.getCurrentTextChannelId();
            if (!channelId) {
              return {
                message: values.channelScope === "saved" ? "Channel ID is required." : "No channel selected.",
                ok: false
              };
            }
            return await discord.sendMessage(channelId, values.text);
          }
          case "util.toast":
            discord?.showToast?.(values.text || "Macro ran", "info");
            return { message: "Toast shown", ok: true };
          case "util.wait":
            await sleep(values.ms);
            return { message: `Waited ${values.ms}ms`, ok: true };
          case "util.openUrl": {
            const opener = globalThis.open;
            if (typeof opener !== "function") return { message: "Cannot open URLs here.", ok: false };
            opener(values.url, "_blank", "noopener");
            return { message: "URL opened", ok: true };
          }
          default:
            return { message: `Unknown action: ${type}`, ok: false };
        }
      } catch (error) {
        return { message: `${def.label} failed: ${error?.message || error}`, ok: false };
      }
    }
    async function runMacroActions2(actions, ctx) {
      const results = [];
      for (const action of actions || []) {
        const res = await runAction(action?.type, action?.params, ctx);
        results.push({ message: res.message, ok: res.ok, type: action?.type || "unknown" });
        if (!res.ok && !(action?.type || "").startsWith("util.")) {
          return { aborted: true, ok: false, results };
        }
      }
      return { aborted: false, ok: results.every((r) => r.ok), results };
    }
    module2.exports = {
      ACTION_DEFS,
      actionTypes: actionTypes2,
      clampVolume,
      coerceParams,
      getActionDef,
      resolveToggle,
      runAction,
      runMacroActions: runMacroActions2,
      sleep,
      validateAction
    };
  }
});

// src/lib/store.js
var require_store = __commonJS({
  "src/lib/store.js"(exports2, module2) {
    "use strict";
    var { conflictKey, keybindToString, normalizeKeybind } = require_keybinds();
    var STATE_KEY = "state";
    var STATE_VERSION = 1;
    var MAX_ACTIONS_PER_MACRO = 20;
    var MAX_KEYBIND_KEYS = 5;
    var DEFAULT_SETTINGS = {
      defaultGlobal: false,
      defaultToast: true
    };
    function generateId(prefix = "m") {
      return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }
    function defaultPresets() {
      const base = { enabled: true, global: false, keybind: [], toastOnRun: true };
      return [
        {
          ...base,
          actions: [{ params: { a: 50, b: 100 }, type: "output.toggle" }],
          id: "preset-output-toggle",
          name: "Speaker 50/100 toggle"
        },
        {
          ...base,
          actions: [{ params: { volume: 50 }, type: "output.set" }],
          id: "preset-output-50",
          name: "Speaker 50%"
        },
        {
          ...base,
          actions: [{ params: { volume: 100 }, type: "output.set" }],
          id: "preset-output-100",
          name: "Speaker 100%"
        },
        {
          ...base,
          actions: [{ params: {}, type: "self.toggleMute" }],
          id: "preset-toggle-mute",
          name: "Toggle mute"
        },
        {
          ...base,
          actions: [{ params: {}, type: "self.toggleDeafen" }],
          id: "preset-toggle-deafen",
          name: "Toggle deafen"
        }
      ];
    }
    function sanitizeAction(action, knownTypes) {
      if (!action || typeof action.type !== "string" || !action.type) return null;
      const params = action.params && typeof action.params === "object" && !Array.isArray(action.params) ? { ...action.params } : {};
      const clean = { params, type: action.type };
      if (Array.isArray(knownTypes) && !knownTypes.includes(action.type)) clean.unknown = true;
      return clean;
    }
    function sanitizeMacro(macro, knownTypes) {
      if (!macro || typeof macro !== "object") return null;
      const actions = Array.isArray(macro.actions) ? macro.actions : [];
      const name = typeof macro.name === "string" && macro.name.trim() ? macro.name.trim().slice(0, 80) : "Untitled macro";
      return {
        actions: actions.map((a) => sanitizeAction(a, knownTypes)).filter(Boolean).slice(0, MAX_ACTIONS_PER_MACRO),
        enabled: macro.enabled !== false,
        global: macro.global === true,
        id: typeof macro.id === "string" && macro.id ? macro.id : generateId(),
        keybind: normalizeKeybind(macro.keybind, MAX_KEYBIND_KEYS),
        name,
        toastOnRun: macro.toastOnRun !== false
      };
    }
    function validateMacro(macro, knownTypes) {
      const errors = [];
      if (!macro.name || !macro.name.trim()) errors.push("Name is empty.");
      if (!macro.keybind || !macro.keybind.length) errors.push("No keybind assigned.");
      if (!macro.actions || !macro.actions.length) errors.push("No actions configured.");
      for (const action of macro.actions || []) {
        if (action.unknown || Array.isArray(knownTypes) && !knownTypes.includes(action.type)) {
          errors.push(`Unknown action type: ${action.type}`);
        }
      }
      return errors;
    }
    function sanitizeSettings(settings) {
      const s = settings && typeof settings === "object" ? settings : {};
      return {
        defaultGlobal: s.defaultGlobal === true ? true : DEFAULT_SETTINGS.defaultGlobal,
        defaultToast: s.defaultToast === false ? false : DEFAULT_SETTINGS.defaultToast
      };
    }
    function loadState2(BdApi, pluginName, knownTypes) {
      try {
        const raw = BdApi?.Data?.load(pluginName, STATE_KEY);
        if (raw === void 0 || raw === null) {
          const state = { macros: defaultPresets(), settings: { ...DEFAULT_SETTINGS }, version: STATE_VERSION };
          saveState2(BdApi, pluginName, state);
          return { fresh: true, state };
        }
        const macros = Array.isArray(raw.macros) ? raw.macros : [];
        return {
          fresh: false,
          state: {
            macros: macros.map((m) => sanitizeMacro(m, knownTypes)).filter(Boolean),
            settings: sanitizeSettings(raw.settings),
            version: STATE_VERSION
          }
        };
      } catch (error) {
        return {
          error,
          fresh: true,
          state: { macros: defaultPresets(), settings: { ...DEFAULT_SETTINGS }, version: STATE_VERSION }
        };
      }
    }
    function saveState2(BdApi, pluginName, state) {
      try {
        BdApi?.Data?.save(pluginName, STATE_KEY, {
          macros: state.macros,
          settings: state.settings,
          version: STATE_VERSION
        });
        return { ok: true };
      } catch (error) {
        return { ok: false, message: error?.message || String(error) };
      }
    }
    function exportState(state) {
      return JSON.stringify({
        app: "KeybindMacros",
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        macros: state.macros,
        version: STATE_VERSION
      }, null, 2);
    }
    function importState(text, knownTypes) {
      let parsed;
      try {
        parsed = JSON.parse(String(text));
      } catch {
        throw new Error("Import text is not valid JSON.");
      }
      const list = Array.isArray(parsed) ? parsed : parsed?.macros;
      if (!Array.isArray(list)) throw new Error("Import must be a macro array or {macros:[...]}.");
      if (!list.length) throw new Error("Import contains no macros.");
      const warnings = [];
      const seen = /* @__PURE__ */ new Set();
      const macros = [];
      for (const entry of list) {
        const clean = sanitizeMacro(entry, knownTypes);
        if (!clean) {
          warnings.push("Skipped an entry that is not a macro object.");
          continue;
        }
        if (seen.has(clean.id)) clean.id = generateId();
        seen.add(clean.id);
        if (!clean.actions.length) warnings.push(`"${clean.name}" has no actions.`);
        if (!clean.keybind.length) warnings.push(`"${clean.name}" has no keybind.`);
        for (const action of clean.actions) {
          if (action.unknown) warnings.push(`"${clean.name}" uses unknown action "${action.type}".`);
        }
        macros.push(clean);
      }
      if (!macros.length) throw new Error("Import contains no valid macros.");
      return { macros, warnings };
    }
    function detectConflicts(macros) {
      const groups = /* @__PURE__ */ new Map();
      for (const macro of macros || []) {
        if (!macro || macro.enabled === false) continue;
        const key = conflictKey(macro.keybind);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ id: macro.id, name: macro.name });
      }
      const out = [];
      for (const [key, entries] of groups) {
        if (entries.length > 1) out.push({ key, label: keybindToString(key.split("+")), macros: entries });
      }
      return out;
    }
    function ensureUniqueIds(macros, incoming) {
      const used = new Set((macros || []).map((m) => m.id));
      for (const macro of incoming || []) {
        if (used.has(macro.id)) macro.id = generateId();
        used.add(macro.id);
      }
      return incoming;
    }
    module2.exports = {
      DEFAULT_SETTINGS,
      MAX_ACTIONS_PER_MACRO,
      MAX_KEYBIND_KEYS,
      STATE_KEY,
      STATE_VERSION,
      defaultPresets,
      detectConflicts,
      ensureUniqueIds,
      exportState,
      generateId,
      importState,
      loadState: loadState2,
      sanitizeAction,
      sanitizeMacro,
      sanitizeSettings,
      saveState: saveState2,
      validateMacro
    };
  }
});

// src/ui/SettingsPanel.jsx
var require_SettingsPanel = __commonJS({
  "src/ui/SettingsPanel.jsx"(exports2, module2) {
    "use strict";
    var { ACTION_DEFS, getActionDef } = require_actions();
    var {
      defaultPresets,
      detectConflicts,
      ensureUniqueIds,
      exportState,
      generateId,
      importState,
      validateMacro
    } = require_store();
    var { eventToKeyName, keybindToString } = require_keybinds();
    var KNOWN_TYPES = ACTION_DEFS.map((d) => d.type);
    var MAX_RECORD_KEYS = 5;
    function defaultParamsFor(type) {
      const def = getActionDef(type);
      const params = {};
      for (const spec of def?.params || []) {
        params[spec.key] = spec.default ?? (spec.type === "checkbox" ? false : "");
      }
      return params;
    }
    function groupedDefs() {
      const groups = /* @__PURE__ */ new Map();
      for (const def of ACTION_DEFS) {
        if (!groups.has(def.category)) groups.set(def.category, []);
        groups.get(def.category).push(def);
      }
      return [...groups.entries()];
    }
    function SettingsPanel2(props) {
      const { React, discord, initialMacros, onMacros, onRun, settings } = props;
      const [macros, setMacros] = React.useState(initialMacros || []);
      const [selectedId, setSelectedId] = React.useState(initialMacros?.[0]?.id || null);
      const [recording, setRecording] = React.useState(false);
      const [recordedKeys, setRecordedKeys] = React.useState([]);
      const [ioText, setIoText] = React.useState("");
      const [notice, setNotice] = React.useState(null);
      const [addType, setAddType] = React.useState(ACTION_DEFS[0].type);
      const pressedRef = React.useRef(/* @__PURE__ */ new Set());
      const collectedRef = React.useRef([]);
      const selected = macros.find((m) => m.id === selectedId) || macros[0] || null;
      const conflicts = React.useMemo(() => detectConflicts(macros), [macros]);
      const globalSupported = React.useMemo(() => {
        try {
          return Boolean(discord?.hasGlobalSupport?.());
        } catch {
          return false;
        }
      }, [discord]);
      const selectedErrors = React.useMemo(
        () => selected ? validateMacro(selected, KNOWN_TYPES) : [],
        [selected]
      );
      function commit(next) {
        setMacros(next);
        onMacros(next);
      }
      function say(kind, text) {
        setNotice({ kind, text });
      }
      function finishRecording() {
        const keys = [...collectedRef.current];
        collectedRef.current = [];
        pressedRef.current = /* @__PURE__ */ new Set();
        setRecordedKeys([]);
        setRecording(false);
        if (!selected || !keys.length) return;
        commit(macros.map((m) => m.id === selected.id ? { ...m, keybind: keys } : m));
      }
      function startRecording() {
        if (!selected) return;
        collectedRef.current = [];
        pressedRef.current = /* @__PURE__ */ new Set();
        setRecordedKeys([]);
        setRecording(true);
      }
      function cancelRecording() {
        collectedRef.current = [];
        pressedRef.current = /* @__PURE__ */ new Set();
        setRecordedKeys([]);
        setRecording(false);
      }
      React.useEffect(() => {
        if (!recording) return void 0;
        const onDown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.repeat) return;
          const key = eventToKeyName(e);
          if (!key) return;
          pressedRef.current.add(key);
          if (!collectedRef.current.includes(key)) {
            collectedRef.current = [...collectedRef.current, key].slice(0, MAX_RECORD_KEYS);
            setRecordedKeys([...collectedRef.current]);
          }
        };
        const onUp = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const key = eventToKeyName(e);
          if (key) pressedRef.current.delete(key);
          if (pressedRef.current.size === 0 && collectedRef.current.length > 0) finishRecording();
        };
        window.addEventListener("keydown", onDown, true);
        window.addEventListener("keyup", onUp, true);
        return () => {
          window.removeEventListener("keydown", onDown, true);
          window.removeEventListener("keyup", onUp, true);
        };
      }, [recording, selectedId]);
      function updateSelected(patch) {
        if (!selected) return;
        commit(macros.map((m) => m.id === selected.id ? { ...m, ...patch } : m));
      }
      function updateAction(index, patchParams) {
        if (!selected) return;
        const actions = selected.actions.map((a, i) => i === index ? { ...a, params: { ...a.params, ...patchParams } } : a);
        updateSelected({ actions });
      }
      function changeActionType(index, type) {
        if (!selected) return;
        const actions = selected.actions.map((a, i) => i === index ? { params: defaultParamsFor(type), type } : a);
        updateSelected({ actions });
      }
      function moveAction(index, dir) {
        if (!selected) return;
        const next = index + dir;
        if (next < 0 || next >= selected.actions.length) return;
        const actions = [...selected.actions];
        [actions[index], actions[next]] = [actions[next], actions[index]];
        updateSelected({ actions });
      }
      function removeAction(index) {
        if (!selected) return;
        updateSelected({ actions: selected.actions.filter((_, i) => i !== index) });
      }
      function addAction() {
        if (!selected) return;
        updateSelected({
          actions: [...selected.actions, { params: defaultParamsFor(addType), type: addType }]
        });
      }
      function addMacro() {
        const macro = {
          actions: [{ params: defaultParamsFor("output.toggle"), type: "output.toggle" }],
          enabled: true,
          global: Boolean(settings?.defaultGlobal),
          id: generateId(),
          keybind: [],
          name: `Macro ${macros.length + 1}`,
          toastOnRun: settings?.defaultToast !== false
        };
        commit([...macros, macro]);
        setSelectedId(macro.id);
      }
      function duplicateMacro(id) {
        const src = macros.find((m) => m.id === id);
        if (!src) return;
        const copy = {
          ...src,
          actions: src.actions.map((a) => ({ params: { ...a.params }, type: a.type })),
          id: generateId(),
          keybind: [...src.keybind],
          name: `${src.name} (copy)`
        };
        commit([...macros, copy]);
        setSelectedId(copy.id);
      }
      function deleteMacro(id) {
        commit(macros.filter((m) => m.id !== id));
        if (selectedId === id) setSelectedId(macros.find((m) => m.id !== id)?.id || null);
      }
      function doExport() {
        setIoText(exportState({ macros }));
        say("info", `Exported ${macros.length} macro(s). Copy the text below to back up or share.`);
      }
      function doCopy() {
        const done = () => say("info", "Copied to clipboard.");
        try {
          if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(ioText).then(done, done);
          else say("warning", "Clipboard unavailable; select the text manually.");
        } catch {
          say("warning", "Clipboard unavailable; select the text manually.");
        }
      }
      function doImport(replace) {
        try {
          const { macros: imported, warnings } = importState(ioText, KNOWN_TYPES);
          ensureUniqueIds(macros, imported);
          commit(replace ? imported : [...macros, ...imported]);
          const extra = warnings.length ? ` Warnings: ${warnings.slice(0, 3).join(" ")}` : "";
          say("info", `Imported ${imported.length} macro(s).${extra}`);
        } catch (error) {
          say("error", error?.message || String(error));
        }
      }
      function doReset() {
        if (!window.confirm("Reset all macros to the starter presets? This replaces everything.")) return;
        commit(defaultPresets());
        say("info", "Reset to starter presets.");
      }
      const s = {
        actionCard: {
          background: "var(--background-secondary-alt, #2b2d31)",
          border: "1px solid var(--background-modifier-accent, #3f4248)",
          borderRadius: 8,
          marginBottom: 8,
          padding: 8
        },
        badge: (on) => ({
          background: on ? "#248046" : "#4e5058",
          borderRadius: 10,
          color: "#fff",
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 8px",
          whiteSpace: "nowrap"
        }),
        btn: {
          background: "var(--background-modifier-accent, #3f4248)",
          border: "1px solid transparent",
          borderRadius: 6,
          color: "var(--text-normal, #dbdee1)",
          cursor: "pointer",
          fontSize: 12,
          padding: "5px 10px"
        },
        btnDanger: {
          background: "#a12829",
          border: "1px solid transparent",
          borderRadius: 6,
          color: "#fff",
          cursor: "pointer",
          fontSize: 12,
          padding: "5px 10px"
        },
        btnPrimary: {
          background: "#5865f2",
          border: "1px solid transparent",
          borderRadius: 6,
          color: "#fff",
          cursor: "pointer",
          fontSize: 12,
          padding: "5px 10px"
        },
        checkRow: { alignItems: "center", display: "flex", gap: 6, marginTop: 8 },
        conflict: {
          background: "#7a5c00",
          borderRadius: 6,
          color: "#fff",
          fontSize: 12,
          marginTop: 8,
          padding: "6px 10px"
        },
        editor: { flex: "2 1 340px", minWidth: 0 },
        field: { marginTop: 8 },
        input: {
          background: "var(--background-tertiary, #1e1f22)",
          border: "1px solid var(--background-modifier-accent, #3f4248)",
          borderRadius: 6,
          boxSizing: "border-box",
          color: "var(--text-normal, #dbdee1)",
          fontSize: 13,
          padding: "6px 8px",
          width: "100%"
        },
        label: { color: "var(--text-muted, #949ba4)", display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 },
        list: { flex: "1 1 220px", maxWidth: 320, minWidth: 200 },
        listItem: (active) => ({
          background: active ? "var(--background-modifier-selected, #3f4248)" : "var(--background-secondary, #2b2d31)",
          border: "1px solid var(--background-modifier-accent, #3f4248)",
          borderRadius: 8,
          cursor: "pointer",
          marginBottom: 6,
          padding: "8px 10px"
        }),
        main: { display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 },
        notice: (kind) => ({
          background: kind === "error" ? "#a12829" : kind === "warning" ? "#7a5c00" : "#2c5f8a",
          borderRadius: 6,
          color: "#fff",
          fontSize: 12,
          marginTop: 8,
          padding: "6px 10px"
        }),
        root: { color: "var(--text-normal, #dbdee1)", fontSize: 13, padding: "4px 4px 16px" },
        row: { alignItems: "center", display: "flex", gap: 6 },
        small: { color: "var(--text-muted, #949ba4)", fontSize: 11 },
        title: { fontSize: 16, fontWeight: 700, margin: 0 },
        toolbar: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }
      };
      function renderParam(action, index, spec) {
        const value = action.params?.[spec.key] ?? spec.default ?? "";
        const set = (v) => updateAction(index, { [spec.key]: v });
        if (spec.type === "checkbox") {
          return /* @__PURE__ */ React.createElement("label", { key: spec.key, style: s.checkRow }, /* @__PURE__ */ React.createElement("input", { checked: Boolean(value), onChange: (e) => set(e.target.checked), type: "checkbox" }), /* @__PURE__ */ React.createElement("span", null, spec.label));
        }
        if (spec.type === "select") {
          return /* @__PURE__ */ React.createElement("div", { key: spec.key, style: s.field }, /* @__PURE__ */ React.createElement("label", { style: s.label }, spec.label), /* @__PURE__ */ React.createElement("select", { onChange: (e) => set(e.target.value), style: s.input, value }, (spec.options || []).map((o) => /* @__PURE__ */ React.createElement("option", { key: o.value, value: o.value }, o.label))));
        }
        if (spec.type === "textarea") {
          return /* @__PURE__ */ React.createElement("div", { key: spec.key, style: s.field }, /* @__PURE__ */ React.createElement("label", { style: s.label }, spec.label), /* @__PURE__ */ React.createElement(
            "textarea",
            {
              onChange: (e) => set(e.target.value),
              placeholder: spec.placeholder || "",
              rows: 2,
              style: s.input,
              value
            }
          ));
        }
        if (spec.type === "volume" || spec.type === "delta" || spec.type === "number") {
          return /* @__PURE__ */ React.createElement("div", { key: spec.key, style: s.field }, /* @__PURE__ */ React.createElement("label", { style: s.label }, spec.label), /* @__PURE__ */ React.createElement("div", { style: s.row }, /* @__PURE__ */ React.createElement(
            "input",
            {
              max: spec.max,
              min: spec.min,
              onChange: (e) => set(Number(e.target.value)),
              style: { ...s.input, padding: 0 },
              type: "range",
              value: Number(value) || 0
            }
          ), /* @__PURE__ */ React.createElement(
            "input",
            {
              max: spec.max,
              min: spec.min,
              onChange: (e) => set(Number(e.target.value)),
              style: { ...s.input, width: 76 },
              type: "number",
              value: Number(value) || 0
            }
          )));
        }
        return /* @__PURE__ */ React.createElement("div", { key: spec.key, style: s.field }, /* @__PURE__ */ React.createElement("label", { style: s.label }, spec.label), /* @__PURE__ */ React.createElement(
          "input",
          {
            onChange: (e) => set(e.target.value),
            placeholder: spec.placeholder || "",
            style: s.input,
            type: "text",
            value
          }
        ));
      }
      function renderActionCard(action, index) {
        const def = getActionDef(action.type);
        return /* @__PURE__ */ React.createElement("div", { key: `${action.type}-${index}`, style: s.actionCard }, /* @__PURE__ */ React.createElement("div", { style: s.row }, /* @__PURE__ */ React.createElement(
          "select",
          {
            onChange: (e) => changeActionType(index, e.target.value),
            style: { ...s.input, flex: 1 },
            value: action.type
          },
          groupedDefs().map(([cat, defs]) => /* @__PURE__ */ React.createElement("optgroup", { key: cat, label: cat }, defs.map((d) => /* @__PURE__ */ React.createElement("option", { key: d.type, value: d.type }, d.label))))
        ), /* @__PURE__ */ React.createElement("button", { onClick: () => moveAction(index, -1), style: s.btn, title: "Move up" }, "\u2191"), /* @__PURE__ */ React.createElement("button", { onClick: () => moveAction(index, 1), style: s.btn, title: "Move down" }, "\u2193"), /* @__PURE__ */ React.createElement("button", { onClick: () => removeAction(index), style: s.btnDanger, title: "Remove" }, "\u2715")), def?.description ? /* @__PURE__ */ React.createElement("div", { style: { ...s.small, marginTop: 4 } }, def.description) : null, action.unknown ? /* @__PURE__ */ React.createElement("div", { style: s.notice("warning") }, 'Unknown action "', action.type, '" \u2014 kept for forward compatibility.') : null, (def?.params || []).map((spec) => renderParam(action, index, spec)));
      }
      const enabledCount = macros.filter((m) => m.enabled).length;
      return /* @__PURE__ */ React.createElement("div", { style: s.root }, /* @__PURE__ */ React.createElement("div", { style: { ...s.row, justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("h2", { style: s.title }, "Keybind Macros"), /* @__PURE__ */ React.createElement("span", { style: s.badge(globalSupported), title: globalSupported ? "Global shortcuts available" : "DiscordNative unavailable" }, globalSupported ? "Global OK" : "In-app only")), /* @__PURE__ */ React.createElement("div", { style: s.small }, enabledCount, "/", macros.length, " macros enabled. Global macros also fire while Discord is unfocused."), conflicts.map((c) => /* @__PURE__ */ React.createElement("div", { key: c.key, style: s.conflict }, "Conflict on ", c.label, ": ", c.macros.map((m) => m.name).join(", "))), notice ? /* @__PURE__ */ React.createElement("div", { style: s.notice(notice.kind) }, notice.text) : null, /* @__PURE__ */ React.createElement("div", { style: s.toolbar }, /* @__PURE__ */ React.createElement("button", { onClick: addMacro, style: s.btnPrimary }, "+ Add macro"), /* @__PURE__ */ React.createElement("button", { onClick: doExport, style: s.btn }, "Export"), /* @__PURE__ */ React.createElement("button", { onClick: doCopy, style: s.btn }, "Copy box"), /* @__PURE__ */ React.createElement("button", { onClick: () => doImport(false), style: s.btn }, "Import (append)"), /* @__PURE__ */ React.createElement("button", { onClick: () => doImport(true), style: s.btn }, "Import (replace)"), /* @__PURE__ */ React.createElement("button", { onClick: doReset, style: s.btnDanger }, "Reset presets")), /* @__PURE__ */ React.createElement("div", { style: s.main }, /* @__PURE__ */ React.createElement("div", { style: s.list }, macros.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: s.small }, "No macros yet \u2014 add one to begin.") : null, macros.map((m) => /* @__PURE__ */ React.createElement("div", { key: m.id, onClick: () => setSelectedId(m.id), style: s.listItem(selected?.id === m.id) }, /* @__PURE__ */ React.createElement("div", { style: { ...s.row, justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("strong", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, m.name), /* @__PURE__ */ React.createElement(
        "input",
        {
          checked: m.enabled,
          onChange: (e) => {
            e.stopPropagation();
            commit(macros.map((x) => x.id === m.id ? { ...x, enabled: e.target.checked } : x));
          },
          onClick: (e) => e.stopPropagation(),
          title: "Enabled",
          type: "checkbox"
        }
      )), /* @__PURE__ */ React.createElement("div", { style: s.small }, keybindToString(m.keybind), m.global ? " \xB7 global" : "", " \xB7 ", m.actions.length, " action(s)"), /* @__PURE__ */ React.createElement("div", { style: { ...s.row, marginTop: 6 } }, /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: (e) => {
            e.stopPropagation();
            onRun(m.id);
          },
          style: s.btn
        },
        "Run"
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: (e) => {
            e.stopPropagation();
            duplicateMacro(m.id);
          },
          style: s.btn
        },
        "Duplicate"
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: (e) => {
            e.stopPropagation();
            deleteMacro(m.id);
          },
          style: s.btnDanger
        },
        "Delete"
      ))))), /* @__PURE__ */ React.createElement("div", { style: s.editor }, !selected ? /* @__PURE__ */ React.createElement("div", { style: s.small }, "Select a macro to edit it.") : /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: s.field }, /* @__PURE__ */ React.createElement("label", { style: s.label }, "Name"), /* @__PURE__ */ React.createElement(
        "input",
        {
          onChange: (e) => updateSelected({ name: e.target.value }),
          style: s.input,
          type: "text",
          value: selected.name
        }
      )), /* @__PURE__ */ React.createElement("div", { style: s.field }, /* @__PURE__ */ React.createElement("label", { style: s.label }, "Keybind"), /* @__PURE__ */ React.createElement("div", { style: s.row }, /* @__PURE__ */ React.createElement("input", { readOnly: true, style: { ...s.input, flex: 1 }, type: "text", value: recording ? keybindToString(recordedKeys) || "Press keys\u2026" : keybindToString(selected.keybind) }), !recording ? /* @__PURE__ */ React.createElement("button", { onClick: startRecording, style: s.btnPrimary }, "Record") : /* @__PURE__ */ React.createElement("button", { onClick: cancelRecording, style: s.btnDanger }, "Cancel"), /* @__PURE__ */ React.createElement("button", { onClick: () => updateSelected({ keybind: [] }), style: s.btn }, "Clear")), recording ? /* @__PURE__ */ React.createElement("div", { style: s.small }, "Press a key combo, then release all keys. Recording captures instead of triggering.") : null), /* @__PURE__ */ React.createElement("label", { style: s.checkRow }, /* @__PURE__ */ React.createElement("input", { checked: selected.global, onChange: (e) => updateSelected({ global: e.target.checked }), type: "checkbox" }), /* @__PURE__ */ React.createElement("span", null, "Global (fire while Discord is unfocused)", globalSupported ? "" : " \u2014 unavailable, in-app only")), /* @__PURE__ */ React.createElement("label", { style: s.checkRow }, /* @__PURE__ */ React.createElement("input", { checked: selected.toastOnRun, onChange: (e) => updateSelected({ toastOnRun: e.target.checked }), type: "checkbox" }), /* @__PURE__ */ React.createElement("span", null, "Show toast when macro runs")), selectedErrors.length ? /* @__PURE__ */ React.createElement("div", { style: s.notice("warning") }, selectedErrors.join(" ")) : null, /* @__PURE__ */ React.createElement("h3", { style: { fontSize: 13, margin: "12px 0 6px" } }, "Actions (run in order)"), selected.actions.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: s.small }, "No actions \u2014 add one below.") : null, selected.actions.map((a, i) => renderActionCard(a, i)), /* @__PURE__ */ React.createElement("div", { style: s.row }, /* @__PURE__ */ React.createElement("select", { onChange: (e) => setAddType(e.target.value), style: { ...s.input, flex: 1 }, value: addType }, groupedDefs().map(([cat, defs]) => /* @__PURE__ */ React.createElement("optgroup", { key: cat, label: cat }, defs.map((d) => /* @__PURE__ */ React.createElement("option", { key: d.type, value: d.type }, d.label))))), /* @__PURE__ */ React.createElement("button", { onClick: addAction, style: s.btnPrimary }, "+ Add action"), /* @__PURE__ */ React.createElement("button", { onClick: () => onRun(selected.id), style: s.btn }, "Test run"))))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 12 } }, /* @__PURE__ */ React.createElement("label", { style: s.label }, "Import / export box"), /* @__PURE__ */ React.createElement(
        "textarea",
        {
          onChange: (e) => setIoText(e.target.value),
          placeholder: "Export output or paste macros JSON here, then Import.",
          rows: 4,
          style: s.input,
          value: ioText
        }
      ), /* @__PURE__ */ React.createElement("div", { style: s.small }, "Single-character keybinds are ignored while typing. Exact chords only: Ctrl+K never fires during Ctrl+Shift+K.")));
    }
    module2.exports = SettingsPanel2;
  }
});

// src/index.js
var { DiscordBridge } = require_discord();
var { MacroEngine } = require_registrations();
var { actionTypes, runMacroActions } = require_actions();
var { loadState, saveState } = require_store();
var SettingsPanel = require_SettingsPanel();
module.exports = class KeybindMacros {
  constructor(meta) {
    this.meta = meta;
    this.state = null;
    this.discord = null;
    this.engine = null;
  }
  log(...args) {
    try {
      if (globalThis.BdApi?.Logger?.info) globalThis.BdApi.Logger.info("KeybindMacros", ...args);
      else console.log("[KeybindMacros]", ...args);
    } catch {
      console.log("[KeybindMacros]", ...args);
    }
  }
  start() {
    const BdApi = globalThis.BdApi;
    if (!BdApi) {
      console.error("[KeybindMacros] BdApi unavailable.");
      return;
    }
    this.discord = new DiscordBridge(BdApi);
    const pluginName = this.meta?.name || "KeybindMacros";
    const { fresh, state } = loadState(BdApi, pluginName, actionTypes());
    this.state = state;
    this.engine = new MacroEngine({
      discord: this.discord,
      getMacros: () => this.state.macros,
      notify: (message, type) => this.discord.showToast(message, type),
      runMacroById: (id, source) => void this.runMacroById(id, source)
    });
    this.engine.start();
    try {
      globalThis.KeybindMacros = this;
    } catch {
    }
    const enabled = state.macros.filter((m) => m.enabled).length;
    this.discord.showToast(
      fresh ? `KeybindMacros: ${state.macros.length} starter macros ready \u2014 assign keybinds in settings.` : `KeybindMacros: ${enabled}/${state.macros.length} macros active.`,
      "info"
    );
    try {
      const idle = globalThis.requestIdleCallback || ((cb) => setTimeout(cb, 2500));
      idle(() => {
        try {
          this.discord?.refresh();
          this.engine?.refresh();
        } catch {
        }
      });
    } catch {
    }
    this.log(`started (${enabled}/${state.macros.length} macros active)`);
  }
  stop() {
    try {
      this.engine?.stop();
    } catch {
    }
    this.engine = null;
    try {
      if (globalThis.KeybindMacros === this) delete globalThis.KeybindMacros;
    } catch {
    }
    this.log("stopped");
  }
  async runMacroById(id, source = "manual") {
    const macro = this.state?.macros.find((m) => m.id === id);
    if (!macro) return { message: "Macro not found.", ok: false };
    if (!macro.enabled) return { message: "Macro is disabled.", ok: false };
    const res = await runMacroActions(macro.actions || [], { discord: this.discord });
    if (macro.toastOnRun && this.discord) {
      const done = res.results.filter((r) => r.ok).length;
      const total = res.results.length;
      const firstFail = res.results.find((r) => !r.ok);
      this.discord.showToast(
        res.ok ? `${macro.name} (${source})` : `${macro.name}: ${firstFail?.message || `${done}/${total} ok`}`,
        res.ok ? "success" : "error"
      );
    }
    return res;
  }
  updateMacros(macros) {
    if (!this.state) return;
    this.state.macros = macros;
    try {
      saveState(globalThis.BdApi, this.meta?.name || "KeybindMacros", this.state);
    } catch {
    }
    try {
      this.engine?.refresh();
    } catch {
    }
  }
  updateSettings(settings) {
    if (!this.state) return;
    this.state.settings = settings;
    try {
      saveState(globalThis.BdApi, this.meta?.name || "KeybindMacros", this.state);
    } catch {
    }
  }
  getSettingsPanel() {
    const BdApi = globalThis.BdApi;
    const React = BdApi?.React;
    if (!React || !this.state) {
      return "<div style='padding:16px'>KeybindMacros: settings unavailable (BdApi.React missing).</div>";
    }
    return React.createElement(SettingsPanel, {
      discord: this.discord,
      initialMacros: this.state.macros,
      onMacros: (macros) => this.updateMacros(macros),
      onRun: (id) => void this.runMacroById(id, "manual"),
      React,
      settings: this.state.settings
    });
  }
};
