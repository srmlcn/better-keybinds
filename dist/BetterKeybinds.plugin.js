/**
 * @name BetterKeybinds
 * @author Cognitive AI
 * @description Discord-style keybinds for speaker volume, mute/deafen, navigation, messages and utilities.
 * @version 2.6.5
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

// src/lib/volume.js
var require_volume = __commonJS({
  "src/lib/volume.js"(exports2, module2) {
    "use strict";
    var VOLUME_MAX = 100;
    function sliderToAmplitude(percent, max = VOLUME_MAX) {
      const p = Number(percent);
      if (!Number.isFinite(p) || p <= 0 || max <= 0) return 0;
      const n = Math.max(0, p / max);
      return max * n ** 3;
    }
    function amplitudeToSlider(amplitude, max = VOLUME_MAX) {
      const a = Number(amplitude);
      if (!Number.isFinite(a) || a <= 0 || max <= 0) return 0;
      const n = Math.max(0, a / max);
      return max * n ** (1 / 3);
    }
    function roundVolume(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      return Math.round(n);
    }
    module2.exports = {
      VOLUME_MAX,
      amplitudeToSlider,
      roundVolume,
      sliderToAmplitude
    };
  }
});

// src/lib/discord.js
var require_discord = __commonJS({
  "src/lib/discord.js"(exports2, module2) {
    "use strict";
    var { extractKeycodeMap } = require_keybinds();
    var { amplitudeToSlider, roundVolume, sliderToAmplitude } = require_volume();
    var DiscordBridge2 = class _DiscordBridge {
      constructor(BdApi, log = null) {
        this.BdApi = BdApi;
        this.log = log || null;
        this.cache = /* @__PURE__ */ new Map();
        this.lastAttempt = /* @__PURE__ */ new Map();
        this.retryTtlMs = 5e3;
        this.utilsTried = false;
        this.utilsCache = null;
        this.keymapCache = /* @__PURE__ */ new Map();
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
        } catch {
        }
      }
      info(message) {
        try {
          this.log?.info("discord", message);
        } catch {
        }
      }
      warn(message) {
        try {
          this.log?.warn("discord", message);
        } catch {
        }
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
        } catch {
        }
        try {
          if (typeof Webpack?.getStore === "function") {
            const store = Webpack.getStore.call(Webpack, name);
            if (store && (typeof store === "object" || typeof store === "function")) return store;
          }
        } catch {
        }
        try {
          const byStoreName = Webpack?.Filters?.byStoreName;
          if (byStoreName && typeof Webpack?.getModule === "function") {
            const store = Webpack.getModule(byStoreName(name));
            if (store && (typeof store === "object" || typeof store === "function")) return store;
          }
        } catch {
        }
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
          (m) => m && typeof m === "object" && props.every((p) => m[p] !== void 0),
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
        if (!mod || typeof mod !== "object" && typeof mod !== "function") return String(mod);
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
        } catch {
        }
        const ctor = mod?.constructor?.name && mod.constructor.name !== "Object" ? ` ctor:${mod.constructor.name}` : "";
        const shown = keys.slice(0, maxKeys).join(",");
        const protoShown = proto.length ? ` proto[${proto.slice(0, 20).join(",")}]${proto.length > 20 ? "\u2026" : ""}` : "";
        return `${keys.length} keys${ctor} [${shown}]${keys.length > maxKeys ? "\u2026" : ""}${protoShown}`;
      }
      getFlux() {
        return this.cached("flux", () => this.findByProps("dispatch", "subscribe", "unsubscribe") || this.findModule((m) => typeof m?.dispatch === "function" && typeof m?.subscribe === "function"));
      }
      getMediaEngineStore() {
        return this.cached("mediaEngine", () => {
          const named = this.getStoreByName("MediaEngineStore");
          if (named) {
            this.debug("mediaEngine via getStore");
            return named;
          }
          const strong = (m) => m && typeof m === "object" && !m.$$typeof && typeof m.getOutputVolume === "function" && (typeof m.getMediaEngine === "function" || typeof m.getInputVolume === "function" || typeof m.isSelfMute === "function");
          return this.findModule(strong, { searchExports: false }) || this.findModule(strong, { searchExports: true }) || this.findByProps("getOutputVolume", "getMediaEngine") || this.findModule((m) => typeof m?.getOutputVolume === "function");
        });
      }
      getVoiceActions() {
        return this.cached("voiceActions", () => this.findByProps("toggleSelfMute", "toggleSelfDeaf", "setOutputVolume") || this.findByProps("toggleSelfMute", "toggleSelfDeaf") || this.findModule((m) => typeof m?.toggleSelfMute === "function" && typeof m?.toggleSelfDeaf === "function"));
      }
      getChannelActions() {
        return this.cached("channelActions", () => this.findByProps("selectChannel", "selectVoiceChannel") || this.findModule((m) => typeof m?.selectChannel === "function" && typeof m?.selectVoiceChannel === "function") || this.findModule((m) => typeof m?.selectChannel === "function"));
      }
      getChannelRouter() {
        return this.cached("channelRouter", () => this.findByProps("transitionToChannel"));
      }
      getMessageActions() {
        return this.cached("messageActions", () => this.findByProps("sendMessage", "editMessage") || this.findModule((m) => typeof m?.sendMessage === "function" && typeof m?.receiveMessage === "function") || this.findModule((m) => typeof m?.sendMessage === "function"));
      }
      getSelectedChannelStore() {
        return this.cached("selectedChannel", () => this.getStoreByName("SelectedChannelStore") || this.findByProps("getCurrentlySelectedChannelId") || this.findByProps("getLastSelectedChannelId"));
      }
      getUserStore() {
        return this.cached("userStore", () => this.getStoreByName("UserStore") || this.findByProps("getCurrentUser"));
      }
      getRunningGameStore() {
        return this.cached("runningGame", () => this.getStoreByName("RunningGameStore") || this.findByProps("getRunningGames", "getVisibleGame") || this.findModule((m) => typeof m?.getGameForPID === "function" && typeof m?.getRunningGames === "function"));
      }
      getStreamingStore() {
        return this.cached("streaming", () => this.getStoreByName("ApplicationStreamingStore") || this.findByProps("getCurrentUserActiveStream"));
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
      getChannelStore() {
        return this.cached("channelStore", () => this.getStoreByName("ChannelStore") || this.findByProps("getChannel"));
      }
      getVoiceStateStore() {
        return this.cached("voiceState", () => this.getStoreByName("VoiceStateStore") || this.findByProps("getVoiceStateForUser", "getVoiceStatesForChannel"));
      }
      // Module referencing the volume Flux event (actions/handler side).
      // Resolved for diagnostics; never blind-called.
      getAudioActions() {
        return this.cached("audioActions", () => this.findByStrings("AUDIO_SET_OUTPUT_VOLUME"));
      }
      audioActionKeys(maxKeys = 12) {
        const mod = this.getAudioActions();
        if (!mod || typeof mod !== "object" && typeof mod !== "function") return [];
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
          return { ok: false, message: "Couldn't reach Discord's controls \u2014 Discord may have updated." };
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
        const v = _DiscordBridge.clampVolume(perceptual);
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
        } catch {
        }
        const label = kind === "input" ? "input" : "output";
        const friendly = kind === "input" ? "Microphone volume" : "Speaker volume";
        if (!viaActions && !res.ok && !direct) {
          this.warn(`${label} volume: no write path available`);
          return { ok: false, message: `Couldn't reach Discord's ${kind === "input" ? "microphone" : "speaker"} controls \u2014 Discord may have updated.` };
        }
        const via = [viaActions && "actions", res.ok && "flux", direct && "direct"].filter(Boolean).join("+");
        if (this[getterRaw]() === null) {
          if (kind === "input") this.lastSetInputVolume = v;
          else this.lastSetOutputVolume = v;
          const out2 = { ok: true, message: `${friendly} \u2192 ${v}%` };
          this.info(`${label} volume ${before ?? "?"} -> ${v} amp ${amplitude.toFixed(3)} via ${via} (unreadable, tracking): ${out2.message}`);
          return out2;
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
        if (after === null) return { ok: true, message: `${friendly} \u2192 ${wanted}% (couldn't confirm)` };
        if (Math.abs(after - wanted) > 1) {
          return { ok: false, message: `${friendly} didn't change \u2014 still ${Math.round(after)}%` };
        }
        const from = before === null ? "?" : `${Math.round(before)}%`;
        return { ok: true, message: `${friendly} ${from} \u2192 ${wanted}%` };
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
        } catch {
        }
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
        } catch {
        }
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
        } catch {
        }
        return null;
      }
      async sendMessage(channelId, content) {
        if (!channelId) return { ok: false, message: "Couldn't send \u2014 no channel is open." };
        if (!content || !String(content).trim()) return { ok: false, message: "Couldn't send \u2014 the message is empty." };
        if (String(content).length > 2e3) return { ok: false, message: "Couldn't send \u2014 the message is over 2000 characters." };
        const actions = this.getMessageActions();
        if (!actions || typeof actions.sendMessage !== "function") {
          return { ok: false, message: "Couldn't reach Discord's messaging \u2014 Discord may have updated." };
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
          } catch {
          }
        }
        return null;
      }
      // Find an action creator by a string literal in its source (same idea as
      // Vencord's findByCode). Misses cache for 60s: the full sweep is slow.
      findCodeFunction(needle) {
        const key = `code:${needle}`;
        if (this.cache.has(key)) return this.cache.get(key);
        const now = Date.now();
        if (now - (this.lastAttempt.get(key) || 0) < 6e4) return null;
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
        } catch {
        }
        return null;
      }
      getVoiceChannelId() {
        try {
          const selected = this.getSelectedChannelStore();
          if (typeof selected?.getVoiceChannelId === "function") {
            const id = selected.getVoiceChannelId();
            if (id) return String(id);
          }
        } catch {
        }
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
          const state = me && typeof store?.getVoiceStateForUser === "function" ? store.getVoiceStateForUser(me) : null;
          if (state?.channelId) return String(state.channelId);
        } catch {
        }
        return null;
      }
      getSelfStream() {
        try {
          const store = this.getStreamingStore();
          if (store && typeof store.getCurrentUserActiveStream === "function") {
            return store.getCurrentUserActiveStream() || null;
          }
        } catch {
        }
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
        const parts = [s.guildId ?? s.guild_id, s.channelId ?? s.channel_id, s.ownerId ?? s.owner_id].filter(Boolean).map(String);
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
          } catch {
          }
        };
        this.onStreamDelete = () => {
          this.streamKey = null;
          this.debug("stream key cleared");
        };
        try {
          flux.subscribe("STREAM_CREATE", this.onStreamCreate);
          flux.subscribe("STREAM_DELETE", this.onStreamDelete);
          this.streamSubscribed = true;
        } catch {
        }
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
        } catch {
        }
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
        } catch {
        }
        try {
          if (typeof store.getVisibleGame === "function") {
            const visible = store.getVisibleGame();
            if (visible && !visible.hidden) return { detection, game: visible, reason: "visible" };
          }
        } catch {
        }
        let running = [];
        try {
          if (typeof store.getRunningGames === "function") running = store.getRunningGames() || [];
        } catch {
        }
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
      // Match a detected game to a desktop capture source: process ID first,
      // then game/exe name against window titles.
      matchGameSource(sources, game) {
        if (!Array.isArray(sources) || !game) return null;
        const pid = Number(game.pid);
        if (Number.isFinite(pid) && pid > 0) {
          const byPid = sources.find((s) => Number(s?.sourcePid) === pid);
          if (byPid) return byPid;
        }
        const norm = (s) => String(s || "").toLowerCase().replace(/\.exe$/i, "").replace(/[^a-z0-9]+/g, " ").trim();
        const exeBase = String(game.exePath || "").split(/[\\/]/).pop();
        const wants = [game.name, exeBase].map(norm).filter(Boolean);
        for (const want of wants) {
          const hit = sources.find((s) => {
            const name = norm(s?.name);
            return name && (name.includes(want) || want.includes(name));
          });
          if (hit) return hit;
        }
        return null;
      }
      pickScreenSource(sources) {
        if (!Array.isArray(sources)) return null;
        return sources.find((s) => s?.type === "screen" || String(s?.id || "").startsWith("screen:")) || null;
      }
      // Discord's current enumerator is:
      //   getDesktopSources(mediaEngine, isWindows, ["screen","window"], extra)
      // Older builds omit the isWindows flag. Never call with a null engine —
      // that path reads `.supports` and throws.
      async getDesktopSources() {
        const engine = this.getMediaEngine();
        const fn = this.findCodeFunction("desktop sources");
        const types = ["screen", "window"];
        const isWindows = this.getPlatform() === "win32";
        let lastError = null;
        if (fn && engine) {
          const attempts = [
            { args: [engine, isWindows, types, null], label: `enumerator-winflag(arity ${fn.length})` },
            { args: [engine, types, null], label: "enumerator-legacy" }
          ];
          for (const attempt of attempts) {
            try {
              const sources = await fn(...attempt.args);
              if (Array.isArray(sources)) {
                this.debug(`desktop sources via ${attempt.label}: ${sources.length}`);
                return sources;
              }
              lastError = new Error("capture-bad-result");
            } catch (error) {
              lastError = error;
              this.debug(`desktop sources via ${attempt.label} threw: ${error?.message || error}`);
            }
          }
        } else if (fn && !engine) {
          this.debug("desktop sources: enumerator found but media engine is null");
        } else if (!fn) {
          this.debug("desktop sources: enumerator missing");
        }
        const previews = await this.getPreviewSources();
        if (previews.length) {
          this.debug(`desktop sources via previews: ${previews.length}`);
          return previews;
        }
        throw lastError || new Error("capture-unavailable");
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
        } catch {
        }
        return true;
      }
      // Resolves the predicate's truthy value, or null on timeout.
      async waitFor(predicate, { intervalMs = 400, timeoutMs = 3500 } = {}) {
        const started = Date.now();
        for (; ; ) {
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
      async beginStream({ channelId, guildId, label, pid = null, source }) {
        const startFn = this.findCodeFunction('type:"STREAM_START"');
        if (!startFn || !source?.id) {
          return { ok: false, message: "Couldn't reach Discord's streaming controls \u2014 Discord may have updated." };
        }
        const sound = this.isSoundshareEnabled();
        const sourceName = source.name || label;
        try {
          await startFn(guildId ?? null, channelId, {
            audioSourceId: sourceName,
            pid: pid ?? null,
            sound,
            sourceId: source.id,
            sourceName
          });
        } catch (error) {
          this.warn(`stream start threw: ${error?.message || error}`);
          return { ok: false, message: `Couldn't start streaming ${label}.` };
        }
        const live = await this.waitFor(() => this.getSelfStream());
        if (live) {
          this.info(`streaming ${label} (sound ${sound ? "on" : "off"})`);
          return { ok: true, message: `Streaming ${label}` };
        }
        return { ok: false, message: `Couldn't start streaming ${label} \u2014 try again.` };
      }
      async startGameStream() {
        const target = await this.resolveStreamTarget();
        if (target.error) return { ok: false, message: target.error };
        if (this.getSelfStream()) return { ok: true, message: "Already streaming \u2014 stop first to switch." };
        const { detection, game } = this.pickGame();
        if (!game) {
          if (detection === false) {
            return { ok: false, message: "Game detection is off \u2014 turn it on in Discord Settings \u2192 Game Activity." };
          }
          if (!this.getRunningGameStore()) {
            return { ok: false, message: "Couldn't reach Discord's game detection \u2014 Discord may have updated." };
          }
          return { ok: false, message: "No game detected \u2014 launch a game first." };
        }
        let sources;
        try {
          sources = await this.getDesktopSources();
        } catch (error) {
          this.warn(`desktop sources failed: ${error?.message || error}`);
          return { ok: false, message: "Couldn't reach screen capture \u2014 reload Discord (Ctrl+R) and try again." };
        }
        if (!sources.length) return { ok: false, message: "No capture sources found." };
        const label = game.name || "your game";
        const source = this.matchGameSource(sources, game);
        if (!source) {
          return { ok: false, message: `Couldn't find a window for ${label} \u2014 make sure it's not minimized.` };
        }
        return this.beginStream({ channelId: target.channelId, guildId: target.guildId, label, pid: game.pid ?? null, source });
      }
      async startScreenStream() {
        const target = await this.resolveStreamTarget();
        if (target.error) return { ok: false, message: target.error };
        if (this.getSelfStream()) return { ok: true, message: "Already streaming \u2014 stop first to switch." };
        let sources;
        try {
          sources = await this.getDesktopSources();
        } catch (error) {
          this.warn(`desktop sources failed: ${error?.message || error}`);
          return { ok: false, message: "Couldn't reach screen capture \u2014 reload Discord (Ctrl+R) and try again." };
        }
        const source = this.pickScreenSource(sources);
        if (!source) return { ok: false, message: "Couldn't find your screen to share." };
        return this.beginStream({ channelId: target.channelId, guildId: target.guildId, label: "your screen", source });
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
          return { ok: false, message: "Couldn't stop the stream \u2014 try again." };
        }
        const stopped = await this.waitFor(() => !this.getSelfStream(), { timeoutMs: 2500 });
        if (stopped) {
          this.info("stream stopped");
          this.streamKey = null;
          return { ok: true, message: "Stream stopped." };
        }
        return { ok: false, message: "Couldn't stop the stream \u2014 try again." };
      }
      async toggleGameStream() {
        return this.getSelfStream() ? this.stopOwnStream() : this.startGameStream();
      }
      async toggleScreenStream() {
        return this.getSelfStream() ? this.stopOwnStream() : this.startScreenStream();
      }
      // Probe native helper modules for capture/voice APIs (keys only, cached).
      inspectNativeModules() {
        if (this.nativeCache) return this.nativeCache;
        const out = {};
        try {
          const req = globalThis.DiscordNative?.nativeModules?.requireModule;
          if (typeof req === "function") {
            for (const name of [
              "discord_utils",
              "discord_voice",
              "discord_rpc",
              "discord_overlay",
              "discord_hook",
              "discord_game_sdk",
              "discord_dispatch",
              "discord_cloudsync",
              "discord_desktop_capture",
              "discord_screen_capture",
              "discord_video",
              "discord_av",
              "discord_krisp",
              "discord_clips"
            ]) {
              try {
                const mod = req(name);
                if (mod && (typeof mod === "object" || typeof mod === "function")) {
                  let keys = [];
                  try {
                    keys = Object.keys(mod).sort();
                  } catch {
                    keys = [];
                  }
                  out[name] = keys.slice(0, 40);
                }
              } catch {
              }
            }
          }
        } catch {
        }
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
        const seen = /* @__PURE__ */ new Set();
        const hits = [];
        const match = (m) => {
          if (!m || typeof m !== "object" && typeof m !== "function") return null;
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
              "getMediaEngine",
              "getOutputDevice",
              "getOutputDeviceId",
              "isSelfMute",
              "isSelfDeaf",
              "getOutputVolume",
              "setOutputVolume",
              "getInputVolume",
              "setInputVolume"
            ].some((k) => k in m);
          } catch {
          }
          let hasVolumeSetting = false;
          try {
            hasVolumeSetting = typeof m.outputVolume === "number" || typeof m.inputVolume === "number";
          } catch {
          }
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
            } catch {
            }
          }
        } catch {
        }
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
              out.fluxAudioTypes = handlerTypes.map(String).sort().filter((t) => /AUDIO|VOLUME|VOICE|MEDIA|SPEAK|MUTE|DEAF/i.test(t)).slice(0, 30);
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
              out.fluxSubAudioTypes = subTypes.map(String).sort().filter((t) => /AUDIO|VOLUME|VOICE|MEDIA|SPEAK|MUTE|DEAF/i.test(t)).slice(0, 30);
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
        } catch {
        }
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
            } catch {
              visible = null;
            }
            gameName = visible?.name ?? list.find((g) => g && !g.hidden)?.name ?? null;
          }
        } catch {
        }
        return {
          channel,
          engine,
          gameName,
          games,
          ready: runningGame && store && startFn && stopFn && sourcesFn,
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
          mediaMethods: media ? ["getOutputVolume", "getInputVolume", "getMediaEngine", "isSelfMute", "isSelfDeaf", "getGoLiveSource", "getGoLiveContext"].filter((k) => typeof media[k] === "function") : [],
          messageActions: Boolean(this.getMessageActions()),
          nativeModules: this.inspectNativeModules(),
          outputAmplitude: this.getOutputVolumeRaw(),
          outputTracked: this.lastSetOutputVolume,
          outputVolume: this.getOutputVolume(),
          platform: this.getPlatform(),
          selectedChannel: Boolean(this.getSelectedChannelStore()),
          selfDeaf: this.isSelfDeaf(),
          selfMute: this.isSelfMute(),
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
        const oh = ap.hasOutputVolumeHandler === true ? `yes${typeof ap.fluxHandlerCount === "number" ? `(${ap.fluxHandlerCount})` : ""}` : ap.hasOutputVolumeHandler === false ? "NO" : "?";
        const osub = ap.hasOutputVolumeSubscriber === true ? `yes${typeof ap.fluxSubCount === "number" ? `(${ap.fluxSubCount})` : ""}` : ap.hasOutputVolumeSubscriber === false ? "NO" : "?";
        const s = p.streaming || {};
        const stm = `stm:${s.ready ? "ok" : "MISS"} live:${s.selfStream ? "Y" : "n"} g:${s.games ?? "?"}`;
        return `${mods} vset:${vset} ovolh:${oh} ovols:${osub} out:${p.outputVolume ?? "?"} in:${p.inputVolume ?? "?"} ${stm}`;
      }
      diagnosticsText(header = "") {
        const p = this.probe();
        const yn = (v) => v ? "found" : "MISSING";
        const val = (v) => v === null || v === void 0 ? "unreadable" : String(v);
        const s = p.streaming || {};
        const natives = p.nativeModules && typeof p.nativeModules === "object" ? p.nativeModules : {};
        const nativeNames = Object.keys(natives);
        const nativeSummary = nativeNames.length ? nativeNames.map((n) => `${n}(${natives[n].length}): ${natives[n].slice(0, 10).join(",")}`).join(" | ") : "none";
        return [
          header,
          `time: ${(/* @__PURE__ */ new Date()).toISOString()}`,
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
          `streamFns: start ${yn(s.startFn)}, stop ${yn(s.stopFn)}, sources ${yn(s.sourcesFn)}`,
          `streamEngine: ${yn(s.engine)}`,
          `games: ${s.games ?? "unreadable"}${s.gameName ? ` (visible: ${s.gameName})` : ""}`,
          `voiceChannel: ${s.voiceChannel || "none"}`,
          `selfStream: ${s.selfStream ? "yes" : "no"} (trackedKey: ${s.trackedKey ? "yes" : "no"})`,
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
        } catch {
        }
        try {
          console.log(`[BetterKeybinds] ${text}`);
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
    function numericIdFor(bindId) {
      const s = String(bindId);
      let h = 0;
      for (let i = 0; i < s.length; i++) h = h * 31 + s.charCodeAt(i) | 0;
      return GLOBAL_ID_BASE + Math.abs(h) % GLOBAL_ID_RANGE;
    }
    var BindEngine2 = class {
      constructor({ discord, getBinds, notify, runBindById }) {
        this.discord = discord;
        this.getBinds = getBinds;
        this.notify = notify || (() => {
        });
        this.runBindById = runBindById;
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
      activeBinds() {
        return (this.getBinds() || []).filter((b) => b && b.enabled && b.keybind && b.keybind.length);
      }
      handleKeyDown(event) {
        if (!event || event.repeat || event.defaultPrevented) return;
        const key = eventToKeyName(event);
        if (!key) return;
        this.pressed.add(key);
        const now = Date.now();
        for (const bind of this.activeBinds()) {
          if (!pressedMatches(this.pressed, bind.keybind)) continue;
          if (this.fired.has(bind.id)) continue;
          if (shouldSkipForTarget(bind.keybind, event.target)) continue;
          if (now - (this.lastFired.get(bind.id) || 0) < TRIGGER_DEBOUNCE_MS) continue;
          this.fired.add(bind.id);
          this.lastFired.set(bind.id, now);
          try {
            this.runBindById(bind.id, "in-app");
          } catch {
          }
        }
      }
      handleKeyUp(event) {
        const key = eventToKeyName(event);
        if (key) this.pressed.delete(key);
        if (this.fired.size === 0) return;
        const binds = new Map((this.getBinds() || []).map((b) => [b.id, b]));
        for (const id of [...this.fired]) {
          const bind = binds.get(id);
          const chord = normalizeKeybind(bind?.keybind, 99);
          if (!key || chord.includes(key) || !bind) this.fired.delete(id);
        }
      }
      handleBlur() {
        this.pressed.clear();
        this.fired.clear();
      }
      handleGlobalTrigger(bindId) {
        const now = Date.now();
        if (now - (this.lastFired.get(bindId) || 0) < TRIGGER_DEBOUNCE_MS) return;
        this.lastFired.set(bindId, now);
        try {
          this.runBindById(bindId, "global");
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
      // covers the focused case so binds never double-fire.
      refreshGlobal() {
        this.unregisterAllGlobal();
        const supported = Boolean(this.discord?.hasGlobalSupport?.());
        this.globalStatus = { errors: [], registered: 0, supported };
        const wanted = (this.getBinds() || []).filter((b) => b && b.enabled && b.global && b.keybind && b.keybind.length);
        if (!wanted.length) {
          this.lastGlobalErrorSig = "";
          return;
        }
        if (!supported) {
          this.globalStatus.errors.push("Global shortcuts aren't available \u2014 keybinds only work while Discord is focused.");
          this.notifyGlobalErrors();
          return;
        }
        const utils = this.discord.getDiscordUtils();
        const map = this.discord.getKeycodeMap();
        for (const bind of wanted) {
          const label = bind.type || bind.id;
          const { error, keys } = buildGlobalKeyArray(bind.keybind, map, WINDOWS_FALLBACK_VK);
          if (error || !keys) {
            this.globalStatus.errors.push(`"${label}": ${error || "unresolvable keybind"}`);
            continue;
          }
          const numId = numericIdFor(bind.id);
          try {
            utils.inputEventRegister(
              numId,
              keys,
              (isDown) => {
                if (isDown) this.handleGlobalTrigger(bind.id);
              },
              { blurred: true, focused: false, keydown: true, keyup: false }
            );
            this.globalIds.set(bind.id, numId);
            this.globalStatus.registered += 1;
          } catch (err) {
            this.globalStatus.errors.push(`"${label}": ${err?.message || err}`);
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
        this.notify(`Global shortcuts: ${first}${extra}`, "warning");
      }
    };
    module2.exports = { BindEngine: BindEngine2, GLOBAL_ID_BASE, numericIdFor };
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
        category: "Streaming",
        description: "Start streaming your detected game, or stop if already live.",
        label: "Toggle game stream",
        params: [],
        type: "stream.startGame"
      },
      {
        category: "Streaming",
        description: "Start streaming your screen, or stop if already live.",
        label: "Toggle screen stream",
        params: [],
        type: "stream.startScreen"
      },
      {
        category: "Streaming",
        description: "Stop your active stream.",
        label: "Stop streaming",
        params: [],
        type: "stream.stop"
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
        description: "Open an https:// URL in the browser.",
        label: "Open URL",
        params: [{ key: "url", label: "URL", placeholder: "https://\u2026", required: true, type: "url" }],
        type: "util.openUrl"
      }
    ];
    var ACTION_ALIASES = {
      "stream.toggleGame": "stream.startGame"
    };
    function resolveActionType(type) {
      return ACTION_ALIASES[type] || type;
    }
    function getActionDef(type) {
      return ACTION_DEFS.find((d) => d.type === resolveActionType(type)) || null;
    }
    function actionTypes2() {
      return ACTION_DEFS.map((d) => d.type).concat(Object.keys(ACTION_ALIASES));
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
      if (!def) return { message: `Sorry, this action isn't supported: ${type}`, ok: false };
      const { errors, values } = coerceParams(def, params || {});
      if (errors.length) return { message: errors[0], ok: false };
      const discord = ctx?.discord;
      if (!discord && !type.startsWith("util.")) return { message: "Couldn't reach Discord.", ok: false };
      try {
        switch (type) {
          case "output.set":
            return discord.setOutputVolume(values.volume);
          case "output.adjust": {
            const { value: current } = discord.resolveOutputVolume();
            if (current === null) return { message: "Couldn't read the speaker volume yet \u2014 run any Set bind first.", ok: false };
            return discord.setOutputVolume(current + values.delta);
          }
          case "output.toggle": {
            const { value: current } = discord.resolveOutputVolume();
            const target = resolveToggle(current, values.a, values.b);
            if (target === null) return { message: "This keybind's volume levels are invalid.", ok: false };
            return discord.setOutputVolume(target);
          }
          case "input.set":
            return discord.setInputVolume(values.volume);
          case "input.adjust": {
            const { value: current } = discord.resolveInputVolume();
            if (current === null) return { message: "Couldn't read the microphone volume yet \u2014 run any Set bind first.", ok: false };
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
          case "stream.startGame":
          case "stream.toggleGame":
            return await discord.toggleGameStream();
          case "stream.startScreen":
            return await discord.toggleScreenStream();
          case "stream.stop":
            return await discord.stopOwnStream();
          case "nav.goToChannel":
            return discord.goToChannel(values.guildId.trim(), values.channelId.trim());
          case "message.send": {
            const channelId = values.channelScope === "saved" ? String(values.channelId || "").trim() : discord.getCurrentTextChannelId();
            if (!channelId) {
              return {
                message: values.channelScope === "saved" ? "This keybind needs a channel ID." : "Couldn't send \u2014 no channel is open.",
                ok: false
              };
            }
            return await discord.sendMessage(channelId, values.text);
          }
          case "util.toast":
            discord?.showToast?.(values.text || "Macro ran", "info");
            return { message: "Toast shown", ok: true };
          case "util.openUrl": {
            const opener = globalThis.open;
            if (typeof opener !== "function") return { message: "Couldn't open that link here.", ok: false };
            opener(values.url, "_blank", "noopener");
            return { message: "Link opened", ok: true };
          }
          default:
            return { message: `Sorry, this action isn't supported: ${type}`, ok: false };
        }
      } catch (error) {
        return { message: `${def.label} failed: ${error?.message || error}`, ok: false };
      }
    }
    async function runBind2(bind, ctx) {
      if (!bind || typeof bind.type !== "string" || !bind.type) {
        return { message: "Bind has no action selected.", ok: false };
      }
      return runAction(bind.type, bind.params, ctx);
    }
    module2.exports = {
      ACTION_DEFS,
      actionTypes: actionTypes2,
      clampVolume,
      coerceParams,
      getActionDef,
      resolveToggle,
      runAction,
      runBind: runBind2,
      sleep,
      validateAction
    };
  }
});

// src/lib/logger.js
var require_logger = __commonJS({
  "src/lib/logger.js"(exports2, module2) {
    "use strict";
    var LEVELS = ["debug", "info", "warn", "error"];
    var DebugLog2 = class {
      constructor({ limit = 300 } = {}) {
        this.limit = Math.max(1, Number(limit) || 300);
        this.entries = [];
        this.seq = 0;
        this.listeners = /* @__PURE__ */ new Set();
      }
      push(level, tag, message) {
        const entry = {
          level: LEVELS.includes(level) ? level : "info",
          message: String(message ?? ""),
          seq: this.seq + 1,
          tag: String(tag ?? ""),
          time: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.seq = entry.seq;
        this.entries.push(entry);
        while (this.entries.length > this.limit) this.entries.shift();
        for (const fn of [...this.listeners]) {
          try {
            fn(entry);
          } catch {
          }
        }
        return entry;
      }
      debug(tag, message) {
        return this.push("debug", tag, message);
      }
      info(tag, message) {
        return this.push("info", tag, message);
      }
      warn(tag, message) {
        return this.push("warn", tag, message);
      }
      error(tag, message) {
        return this.push("error", tag, message);
      }
      getEntries() {
        return [...this.entries];
      }
      clear() {
        this.entries = [];
      }
      toText(limit = 120) {
        return this.entries.slice(-Math.max(1, limit)).map((e) => `[${e.time}] ${e.level.toUpperCase()} ${e.tag}: ${e.message}`).join("\n");
      }
      subscribe(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
      }
    };
    module2.exports = { DebugLog: DebugLog2 };
  }
});

// src/lib/store.js
var require_store = __commonJS({
  "src/lib/store.js"(exports2, module2) {
    "use strict";
    var { validateAction } = require_actions();
    var { conflictKey, keybindToString, normalizeKeybind } = require_keybinds();
    var STATE_KEY = "state";
    var STATE_VERSION = 2;
    var MAX_KEYBIND_KEYS = 5;
    var DEFAULT_SETTINGS = {
      debugLogging: true,
      defaultGlobal: false,
      defaultToast: true
    };
    function generateId(prefix = "b") {
      return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }
    function freshState() {
      return { binds: [], settings: { ...DEFAULT_SETTINGS }, version: STATE_VERSION };
    }
    function sanitizeBind(bind, knownTypes) {
      if (!bind || typeof bind !== "object") return null;
      if (typeof bind.type !== "string" || !bind.type) return null;
      const params = bind.params && typeof bind.params === "object" && !Array.isArray(bind.params) ? { ...bind.params } : {};
      const clean = {
        enabled: bind.enabled !== false,
        global: bind.global === true,
        id: typeof bind.id === "string" && bind.id ? bind.id : generateId(),
        keybind: normalizeKeybind(bind.keybind, MAX_KEYBIND_KEYS),
        params,
        toastOnRun: bind.toastOnRun !== false,
        type: bind.type
      };
      if (Array.isArray(knownTypes) && !knownTypes.includes(bind.type)) clean.unknown = true;
      return clean;
    }
    function validateBind(bind, knownTypes) {
      const errors = [];
      if (!bind.type) errors.push("No action selected.");
      else if (Array.isArray(knownTypes) && !knownTypes.includes(bind.type)) {
        errors.push(`Unknown action type: ${bind.type}`);
      } else {
        errors.push(...validateAction(bind.type, bind.params));
      }
      if (!bind.keybind || !bind.keybind.length) errors.push("No keybind assigned.");
      return errors;
    }
    function sanitizeSettings(settings) {
      const s = settings && typeof settings === "object" ? settings : {};
      return {
        debugLogging: s.debugLogging === false ? false : DEFAULT_SETTINGS.debugLogging,
        defaultGlobal: s.defaultGlobal === true ? true : DEFAULT_SETTINGS.defaultGlobal,
        defaultToast: s.defaultToast === false ? false : DEFAULT_SETTINGS.defaultToast
      };
    }
    function loadState2(BdApi, pluginName, knownTypes) {
      try {
        const raw = BdApi?.Data?.load(pluginName, STATE_KEY);
        if (raw === void 0 || raw === null) {
          const state = freshState();
          saveState2(BdApi, pluginName, state);
          return { fresh: true, state };
        }
        const binds = Array.isArray(raw.binds) ? raw.binds : [];
        return {
          fresh: false,
          state: {
            binds: binds.map((b) => sanitizeBind(b, knownTypes)).filter(Boolean),
            settings: sanitizeSettings(raw.settings),
            version: STATE_VERSION
          }
        };
      } catch (error) {
        return { error, fresh: true, state: freshState() };
      }
    }
    function saveState2(BdApi, pluginName, state) {
      try {
        BdApi?.Data?.save(pluginName, STATE_KEY, {
          binds: state.binds,
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
        app: "BetterKeybinds",
        binds: state.binds,
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
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
      const list = Array.isArray(parsed) ? parsed : parsed?.binds;
      if (!Array.isArray(list)) throw new Error("Import must be a bind array or {binds:[...]}.");
      if (!list.length) throw new Error("Import contains no binds.");
      const warnings = [];
      const seen = /* @__PURE__ */ new Set();
      const binds = [];
      for (const entry of list) {
        const clean = sanitizeBind(entry, knownTypes);
        if (!clean) {
          warnings.push("Skipped an entry that is not a bind object.");
          continue;
        }
        if (seen.has(clean.id)) clean.id = generateId();
        seen.add(clean.id);
        if (clean.unknown) warnings.push(`Unknown action "${clean.type}" kept for forward compatibility.`);
        if (!clean.keybind.length) warnings.push(`"${clean.type}" has no keybind.`);
        binds.push(clean);
      }
      if (!binds.length) throw new Error("Import contains no valid binds.");
      return { binds, warnings };
    }
    function detectConflicts(binds) {
      const groups = /* @__PURE__ */ new Map();
      for (const bind of binds || []) {
        if (!bind || bind.enabled === false) continue;
        const key = conflictKey(bind.keybind);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ id: bind.id, type: bind.type });
      }
      const out = [];
      for (const [key, entries] of groups) {
        if (entries.length > 1) out.push({ key, label: keybindToString(key.split("+")), binds: entries });
      }
      return out;
    }
    function ensureUniqueIds(binds, incoming) {
      const used = new Set((binds || []).map((b) => b.id));
      for (const bind of incoming || []) {
        if (used.has(bind.id)) bind.id = generateId();
        used.add(bind.id);
      }
      return incoming;
    }
    module2.exports = {
      DEFAULT_SETTINGS,
      MAX_KEYBIND_KEYS,
      STATE_KEY,
      STATE_VERSION,
      detectConflicts,
      ensureUniqueIds,
      exportState,
      freshState,
      generateId,
      importState,
      loadState: loadState2,
      sanitizeBind,
      sanitizeSettings,
      saveState: saveState2,
      validateBind
    };
  }
});

// src/ui/SettingsPanel.jsx
var require_SettingsPanel = __commonJS({
  "src/ui/SettingsPanel.jsx"(exports2, module2) {
    "use strict";
    var { ACTION_DEFS, getActionDef } = require_actions();
    var {
      detectConflicts,
      ensureUniqueIds,
      exportState,
      generateId,
      importState,
      validateBind
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
    function bindLabel(bind) {
      return getActionDef(bind.type)?.label || bind.type || "Unknown action";
    }
    function SettingsPanel2(props) {
      const { React, diagnosticsText, discord, initialBinds, log, onBinds, onRun, onSettings, probe, settings } = props;
      const [binds, setBinds] = React.useState(initialBinds || []);
      const [recordingId, setRecordingId] = React.useState(null);
      const [recordedKeys, setRecordedKeys] = React.useState([]);
      const [ioText, setIoText] = React.useState("");
      const [notice, setNotice] = React.useState(null);
      const [lastResult, setLastResult] = React.useState(null);
      const [status, setStatus] = React.useState(() => safeProbe());
      const [logTick, setLogTick] = React.useState(0);
      const [debugOn, setDebugOn] = React.useState(settings?.debugLogging !== false);
      const pressedRef = React.useRef(/* @__PURE__ */ new Set());
      const collectedRef = React.useRef([]);
      const bindsRef = React.useRef(binds);
      const logPreRef = React.useRef(null);
      const ioDetailsRef = React.useRef(null);
      bindsRef.current = binds;
      function safeProbe() {
        try {
          return probe?.() || null;
        } catch {
          return null;
        }
      }
      const conflicts = React.useMemo(() => detectConflicts(binds), [binds]);
      const globalSupported = React.useMemo(() => {
        try {
          return Boolean(discord?.hasGlobalSupport?.());
        } catch {
          return false;
        }
      }, [discord]);
      function commit(next) {
        setBinds(next);
        onBinds(next);
      }
      function say(kind, text) {
        setNotice({ kind, text });
      }
      function finishRecording() {
        const keys = [...collectedRef.current];
        const id = recordingId;
        collectedRef.current = [];
        pressedRef.current = /* @__PURE__ */ new Set();
        setRecordedKeys([]);
        setRecordingId(null);
        if (!id || !keys.length) return;
        const next = bindsRef.current.map((b) => b.id === id ? { ...b, keybind: keys } : b);
        setBinds(next);
        onBinds(next);
      }
      function startRecording(id) {
        collectedRef.current = [];
        pressedRef.current = /* @__PURE__ */ new Set();
        setRecordedKeys([]);
        setRecordingId(id);
      }
      function cancelRecording() {
        collectedRef.current = [];
        pressedRef.current = /* @__PURE__ */ new Set();
        setRecordedKeys([]);
        setRecordingId(null);
      }
      React.useEffect(() => {
        if (!recordingId) return void 0;
        const onDown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.repeat) return;
          if (e.key === "Escape") {
            cancelRecording();
            return;
          }
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
      }, [recordingId]);
      function updateBind(id, patch) {
        commit(bindsRef.current.map((b) => b.id === id ? { ...b, ...patch } : b));
      }
      function changeType(id, type) {
        updateBind(id, { params: defaultParamsFor(type), type, unknown: false });
      }
      function addBind() {
        const bind = {
          enabled: true,
          global: Boolean(settings?.defaultGlobal),
          id: generateId(),
          keybind: [],
          params: defaultParamsFor("output.toggle"),
          toastOnRun: settings?.defaultToast !== false,
          type: "output.toggle"
        };
        commit([...bindsRef.current, bind]);
      }
      function removeBind(id) {
        if (recordingId === id) cancelRecording();
        commit(bindsRef.current.filter((b) => b.id !== id));
      }
      async function testRun(id) {
        try {
          const res = await onRun(id);
          setLastResult({ id, message: res?.message || "", ok: Boolean(res?.ok) });
        } catch (error) {
          setLastResult({ id, message: error?.message || String(error), ok: false });
        }
      }
      function doExport() {
        setIoText(exportState({ binds }));
        say("info", `Exported ${binds.length} bind(s). Copy the text below to back up or share.`);
      }
      function doImport(replace) {
        try {
          const { binds: imported, warnings } = importState(ioText, KNOWN_TYPES);
          ensureUniqueIds(binds, imported);
          commit(replace ? imported : [...binds, ...imported]);
          const extra = warnings.length ? ` Warnings: ${warnings.slice(0, 3).join(" ")}` : "";
          say("info", `Imported ${imported.length} bind(s).${extra}`);
        } catch (error) {
          say("error", error?.message || String(error));
        }
      }
      function doClear() {
        if (!window.confirm("Delete all binds?")) return;
        commit([]);
        say("info", "All binds deleted.");
      }
      function copyDiagnostics() {
        let text = "";
        try {
          text = `${diagnosticsText?.() || ""}

--- log ---
${log?.toText(150) || "(no log)"}`;
        } catch (error) {
          say("error", error?.message || String(error));
          return;
        }
        const fallback = () => {
          setIoText(text);
          try {
            if (ioDetailsRef.current) ioDetailsRef.current.open = true;
          } catch {
          }
          say("warning", "Clipboard unavailable \u2014 diagnostics placed in the import/export box below.");
        };
        try {
          if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => say("info", "Diagnostics copied."), fallback);
          else fallback();
        } catch {
          fallback();
        }
      }
      function toggleDebug(checked) {
        setDebugOn(checked);
        try {
          onSettings?.({ ...settings, debugLogging: checked });
        } catch {
        }
      }
      function deepScan() {
        let hits = [];
        try {
          hits = discord?.scanAudioCandidates?.() || [];
        } catch (error) {
          say("error", error?.message || String(error));
          return;
        }
        say("info", hits.length ? `Deep scan found ${hits.length} audio candidate(s) \u2014 see the log.` : "Deep scan found no audio modules.");
      }
      React.useEffect(() => {
        if (!log?.subscribe) return void 0;
        const unsub = log.subscribe(() => setLogTick((t) => t + 1));
        return unsub;
      }, [log]);
      React.useEffect(() => {
        const el = logPreRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, [logTick]);
      const s = {
        badge: (on) => ({
          background: on ? "#248046" : "#4e5058",
          borderRadius: 10,
          color: "#fff",
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 8px",
          whiteSpace: "nowrap"
        }),
        bindCard: {
          background: "var(--background-secondary, #2b2d31)",
          border: "1px solid var(--background-modifier-accent, #3f4248)",
          borderRadius: 8,
          marginTop: 8,
          padding: 10
        },
        btn: {
          background: "var(--background-modifier-accent, #3f4248)",
          border: "1px solid transparent",
          borderRadius: 6,
          color: "var(--text-normal, #dbdee1)",
          cursor: "pointer",
          fontSize: 12,
          padding: "5px 10px",
          whiteSpace: "nowrap"
        },
        btnDanger: {
          background: "#a12829",
          border: "1px solid transparent",
          borderRadius: 6,
          color: "#fff",
          cursor: "pointer",
          fontSize: 12,
          padding: "5px 10px",
          whiteSpace: "nowrap"
        },
        btnPrimary: {
          background: "#5865f2",
          border: "1px solid transparent",
          borderRadius: 6,
          color: "#fff",
          cursor: "pointer",
          fontSize: 12,
          padding: "5px 10px",
          whiteSpace: "nowrap"
        },
        checkRow: { alignItems: "center", display: "flex", gap: 6 },
        conflict: {
          background: "#7a5c00",
          borderRadius: 6,
          color: "#fff",
          fontSize: 12,
          marginTop: 8,
          padding: "6px 10px"
        },
        details: {
          background: "var(--background-secondary, #2b2d31)",
          border: "1px solid var(--background-modifier-accent, #3f4248)",
          borderRadius: 8,
          marginTop: 12,
          padding: "8px 10px"
        },
        input: {
          background: "var(--background-tertiary, #1e1f22)",
          border: "1px solid var(--background-modifier-accent, #3f4248)",
          borderRadius: 6,
          boxSizing: "border-box",
          color: "var(--text-normal, #dbdee1)",
          fontSize: 13,
          padding: "6px 8px"
        },
        keyButton: (recording) => ({
          background: recording ? "#a12829" : "var(--background-tertiary, #1e1f22)",
          border: "1px solid var(--background-modifier-accent, #3f4248)",
          borderRadius: 6,
          color: recording ? "#fff" : "var(--text-normal, #dbdee1)",
          cursor: "pointer",
          flex: "1 1 160px",
          fontSize: 12,
          minWidth: 140,
          overflow: "hidden",
          padding: "6px 10px",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }),
        label: { color: "var(--text-muted, #949ba4)", fontSize: 11, fontWeight: 600 },
        logPre: {
          background: "var(--background-tertiary, #1e1f22)",
          border: "1px solid var(--background-modifier-accent, #3f4248)",
          borderRadius: 6,
          boxSizing: "border-box",
          color: "var(--text-normal, #dbdee1)",
          fontFamily: "monospace",
          fontSize: 11,
          marginTop: 6,
          maxHeight: 180,
          overflowY: "auto",
          padding: 8,
          whiteSpace: "pre-wrap",
          width: "100%"
        },
        notice: (kind) => ({
          background: kind === "error" ? "#a12829" : kind === "warning" ? "#7a5c00" : "#2c5f8a",
          borderRadius: 6,
          color: "#fff",
          fontSize: 12,
          marginTop: 8,
          padding: "6px 10px"
        }),
        param: { alignItems: "center", display: "flex", gap: 6 },
        result: (ok) => ({
          background: ok ? "#248046" : "#a12829",
          borderRadius: 6,
          color: "#fff",
          fontSize: 12,
          marginTop: 6,
          padding: "4px 8px"
        }),
        root: { color: "var(--text-normal, #dbdee1)", fontSize: 13, padding: "4px 4px 16px" },
        row: { alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 },
        sectionTitle: { fontSize: 13, fontWeight: 700, margin: "14px 0 4px" },
        small: { color: "var(--text-muted, #949ba4)", fontSize: 11 },
        statusDot: (ok) => ({
          background: ok ? "#248046" : "#a12829",
          borderRadius: "50%",
          display: "inline-block",
          height: 8,
          marginRight: 6,
          width: 8
        }),
        statusGrid: { display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 6 },
        summary: { cursor: "pointer", fontSize: 12, fontWeight: 600, listStyle: "none", textAlign: "right" },
        title: { fontSize: 16, fontWeight: 700, margin: 0 },
        toolbar: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }
      };
      function renderParam(bind, spec) {
        const value = bind.params?.[spec.key] ?? spec.default ?? "";
        const set = (v) => updateBind(bind.id, { params: { ...bind.params, [spec.key]: v } });
        if (spec.type === "checkbox") {
          return /* @__PURE__ */ React.createElement("label", { key: spec.key, style: s.checkRow }, /* @__PURE__ */ React.createElement("input", { checked: Boolean(value), onChange: (e) => set(e.target.checked), type: "checkbox" }), /* @__PURE__ */ React.createElement("span", null, spec.label));
        }
        if (spec.type === "select") {
          return /* @__PURE__ */ React.createElement("label", { key: spec.key, style: s.param }, /* @__PURE__ */ React.createElement("span", { style: s.label }, spec.label), /* @__PURE__ */ React.createElement("select", { onChange: (e) => set(e.target.value), style: s.input, value }, (spec.options || []).map((o) => /* @__PURE__ */ React.createElement("option", { key: o.value, value: o.value }, o.label))));
        }
        if (spec.type === "textarea") {
          return /* @__PURE__ */ React.createElement("label", { key: spec.key, style: { ...s.param, flex: "1 1 220px" } }, /* @__PURE__ */ React.createElement("span", { style: s.label }, spec.label), /* @__PURE__ */ React.createElement(
            "textarea",
            {
              onChange: (e) => set(e.target.value),
              placeholder: spec.placeholder || "",
              rows: 1,
              style: { ...s.input, flex: 1 },
              value
            }
          ));
        }
        if (spec.type === "volume" || spec.type === "delta" || spec.type === "number") {
          return /* @__PURE__ */ React.createElement("label", { key: spec.key, style: s.param }, /* @__PURE__ */ React.createElement("span", { style: s.label }, spec.label), /* @__PURE__ */ React.createElement(
            "input",
            {
              max: spec.max,
              min: spec.min,
              onChange: (e) => set(Number(e.target.value)),
              style: { ...s.input, width: 72 },
              type: "number",
              value: Number(value) || 0
            }
          ));
        }
        return /* @__PURE__ */ React.createElement("label", { key: spec.key, style: { ...s.param, flex: spec.type === "url" ? "1 1 200px" : "0 1 auto" } }, /* @__PURE__ */ React.createElement("span", { style: s.label }, spec.label), /* @__PURE__ */ React.createElement(
          "input",
          {
            onChange: (e) => set(e.target.value),
            placeholder: spec.placeholder || "",
            style: { ...s.input, flex: spec.type === "url" ? 1 : "0 1 130px" },
            type: "text",
            value
          }
        ));
      }
      function renderBind(bind) {
        const def = getActionDef(bind.type);
        const recording = recordingId === bind.id;
        const errors = validateBind(bind, KNOWN_TYPES);
        const result = lastResult?.id === bind.id ? lastResult : null;
        return /* @__PURE__ */ React.createElement("div", { key: bind.id, style: s.bindCard }, /* @__PURE__ */ React.createElement("div", { style: s.row }, /* @__PURE__ */ React.createElement(
          "input",
          {
            checked: bind.enabled,
            onChange: (e) => updateBind(bind.id, { enabled: e.target.checked }),
            title: "Enabled",
            type: "checkbox"
          }
        ), /* @__PURE__ */ React.createElement(
          "select",
          {
            onChange: (e) => changeType(bind.id, e.target.value),
            style: { ...s.input, flex: "2 1 200px" },
            value: bind.type
          },
          groupedDefs().map(([cat, defs]) => /* @__PURE__ */ React.createElement("optgroup", { key: cat, label: cat }, defs.map((d) => /* @__PURE__ */ React.createElement("option", { key: d.type, value: d.type }, d.label))))
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: () => recording ? cancelRecording() : startRecording(bind.id),
            style: s.keyButton(recording),
            title: recording ? "Recording\u2026 press keys, Esc cancels" : "Click to set keybind"
          },
          recording ? keybindToString(recordedKeys) === "Not set" ? "Press keys\u2026" : keybindToString(recordedKeys) : keybindToString(bind.keybind)
        ), /* @__PURE__ */ React.createElement("button", { onClick: () => updateBind(bind.id, { keybind: [] }), style: s.btn, title: "Clear keybind" }, "\u2715"), /* @__PURE__ */ React.createElement("button", { onClick: () => testRun(bind.id), style: s.btn, title: "Run now" }, "Run"), /* @__PURE__ */ React.createElement("button", { onClick: () => removeBind(bind.id), style: s.btnDanger, title: "Delete bind" }, "Delete")), (def?.params || []).length ? /* @__PURE__ */ React.createElement("div", { style: { ...s.row, marginTop: 8 } }, (def.params || []).map((spec) => renderParam(bind, spec))) : null, /* @__PURE__ */ React.createElement("div", { style: { ...s.row, marginTop: 8 } }, /* @__PURE__ */ React.createElement("label", { style: s.checkRow }, /* @__PURE__ */ React.createElement("input", { checked: bind.global, onChange: (e) => updateBind(bind.id, { global: e.target.checked }), type: "checkbox" }), /* @__PURE__ */ React.createElement("span", null, "Global", globalSupported ? "" : " (unavailable)")), /* @__PURE__ */ React.createElement("label", { style: s.checkRow }, /* @__PURE__ */ React.createElement("input", { checked: bind.toastOnRun, onChange: (e) => updateBind(bind.id, { toastOnRun: e.target.checked }), type: "checkbox" }), /* @__PURE__ */ React.createElement("span", null, "Toast on run")), def?.description ? /* @__PURE__ */ React.createElement("span", { style: s.small }, def.description) : null), bind.unknown ? /* @__PURE__ */ React.createElement("div", { style: s.notice("warning") }, 'Unknown action "', bind.type, '" \u2014 kept for forward compatibility.') : null, errors.length ? /* @__PURE__ */ React.createElement("div", { style: s.notice("warning") }, errors.join(" ")) : null, result ? /* @__PURE__ */ React.createElement("div", { style: s.result(result.ok) }, result.message || (result.ok ? "OK" : "Failed")) : null);
      }
      const enabledCount = binds.filter((b) => b.enabled).length;
      return /* @__PURE__ */ React.createElement("div", { style: s.root }, /* @__PURE__ */ React.createElement("div", { style: { ...s.row, justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("h2", { style: s.title }, "Better Keybinds"), /* @__PURE__ */ React.createElement("span", { style: s.badge(globalSupported), title: globalSupported ? "Global shortcuts available" : "DiscordNative unavailable" }, globalSupported ? "Global OK" : "In-app only")), /* @__PURE__ */ React.createElement("div", { style: s.small }, enabledCount, "/", binds.length, " binds enabled. Global binds also fire while Discord is unfocused."), conflicts.map((c) => /* @__PURE__ */ React.createElement("div", { key: c.key, style: s.conflict }, "Conflict on ", c.label, ": ", c.binds.map((b) => bindLabel(binds.find((x) => x.id === b.id) || b)).join(", "))), notice ? /* @__PURE__ */ React.createElement("div", { style: s.notice(notice.kind) }, notice.text) : null, /* @__PURE__ */ React.createElement("div", { style: s.toolbar }, /* @__PURE__ */ React.createElement("button", { onClick: addBind, style: s.btnPrimary }, "+ Add keybind")), /* @__PURE__ */ React.createElement("details", { ref: ioDetailsRef, style: s.details }, /* @__PURE__ */ React.createElement("summary", { style: s.summary }, "Import / export / reset \u25BE"), /* @__PURE__ */ React.createElement("div", { style: s.toolbar }, /* @__PURE__ */ React.createElement("button", { onClick: doExport, style: s.btn }, "Export"), /* @__PURE__ */ React.createElement("button", { onClick: () => doImport(false), style: s.btn }, "Import (append)"), /* @__PURE__ */ React.createElement("button", { onClick: () => doImport(true), style: s.btn }, "Import (replace)"), /* @__PURE__ */ React.createElement("button", { onClick: doClear, style: s.btnDanger }, "Delete all")), /* @__PURE__ */ React.createElement(
        "textarea",
        {
          onChange: (e) => setIoText(e.target.value),
          placeholder: "Export output or paste binds JSON here, then Import.",
          rows: 4,
          style: { ...s.input, marginTop: 6, width: "100%" },
          value: ioText
        }
      )), /* @__PURE__ */ React.createElement("div", { style: { ...s.small, marginTop: 6 } }, "Click a keybind button, press a chord, release to save (Esc cancels). Single-character binds are ignored while typing. Exact chords only: Ctrl+K never fires during Ctrl+Shift+K."), binds.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { ...s.small, marginTop: 12 } }, "No keybinds yet. Add one, pick an action from the dropdown, then click its keybind button and press your chord.") : null, binds.map(renderBind), /* @__PURE__ */ React.createElement("h3", { style: s.sectionTitle }, "Diagnostics"), /* @__PURE__ */ React.createElement("div", { style: s.toolbar }, /* @__PURE__ */ React.createElement("button", { onClick: () => setStatus(safeProbe()), style: s.btn }, "Refresh status"), /* @__PURE__ */ React.createElement("button", { onClick: deepScan, style: s.btn }, "Deep scan"), /* @__PURE__ */ React.createElement("button", { onClick: copyDiagnostics, style: s.btnPrimary }, "Copy diagnostics"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
        try {
          log?.clear();
        } catch {
        }
        setLogTick((t) => t + 1);
      }, style: s.btn }, "Clear log"), /* @__PURE__ */ React.createElement("label", { style: s.checkRow }, /* @__PURE__ */ React.createElement("input", { checked: debugOn, onChange: (e) => toggleDebug(e.target.checked), type: "checkbox" }), /* @__PURE__ */ React.createElement("span", null, "Debug logging to console"))), status ? /* @__PURE__ */ React.createElement("div", { style: s.statusGrid }, /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { style: s.statusDot(status.flux) }), "Flux"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { style: s.statusDot(status.mediaEngine) }), "MediaEngine (", status.mediaMethods.length, "/7)"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { style: s.statusDot(status.audioActions) }), "AudioActions"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { style: s.statusDot(Boolean(status.audioPath?.setters?.setOutputVolume)) }), "VSet"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { style: s.statusDot(status.voiceActions) }), "Voice"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { style: s.statusDot(status.channelActions) }), "Channel"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { style: s.statusDot(status.messageActions) }), "Message"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { style: s.statusDot(status.selectedChannel) }), "SelectedCh"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { style: s.statusDot(status.discordUtils) }), "Native"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { style: s.statusDot(status.keycodeMap) }), "Keymap"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("span", { style: s.statusDot(status.streaming?.ready) }), "Stream"), /* @__PURE__ */ React.createElement("span", { style: s.small }, "platform: ", status.platform), /* @__PURE__ */ React.createElement("span", { style: s.small }, "out: ", status.outputVolume ?? (status.outputTracked ?? "?"), status.outputVolume == null && status.outputTracked != null ? "~" : "", status.outputAmplitude != null ? ` amp ${Math.round(status.outputAmplitude * 10) / 10}` : ""), /* @__PURE__ */ React.createElement("span", { style: s.small }, "in: ", status.inputVolume ?? (status.inputTracked ?? "?"), status.inputVolume == null && status.inputTracked != null ? "~" : "", status.inputAmplitude != null ? ` amp ${Math.round(status.inputAmplitude * 10) / 10}` : ""), /* @__PURE__ */ React.createElement("span", { style: s.small }, "mute: ", String(status.selfMute ?? "?")), /* @__PURE__ */ React.createElement("span", { style: s.small }, "deaf: ", String(status.selfDeaf ?? "?")), /* @__PURE__ */ React.createElement("span", { style: s.small }, "live: ", status.streaming?.selfStream ? "yes" : "no"), /* @__PURE__ */ React.createElement("span", { style: s.small }, "games: ", status.streaming?.games ?? "?", status.streaming?.gameName ? ` (${status.streaming.gameName})` : "")) : /* @__PURE__ */ React.createElement("div", { style: s.small }, "Status unavailable."), status && !status.mediaEngine ? /* @__PURE__ */ React.createElement("div", { style: s.small }, "Speaker controls not found \u2014 hit Deep scan, then Copy diagnostics.") : null, /* @__PURE__ */ React.createElement("pre", { ref: logPreRef, style: s.logPre }, log?.toText(80) || "(empty)"));
    }
    module2.exports = SettingsPanel2;
  }
});

// src/index.js
var { DiscordBridge } = require_discord();
var { BindEngine } = require_registrations();
var { actionTypes, runBind } = require_actions();
var { DebugLog } = require_logger();
var { loadState, saveState } = require_store();
var SettingsPanel = require_SettingsPanel();
module.exports = class BetterKeybinds {
  constructor(meta) {
    this.meta = meta;
    this.state = null;
    this.discord = null;
    this.engine = null;
    this.log = new DebugLog({ limit: 300 });
  }
  mirrorToConsole(entry) {
    if (entry.level === "debug" && !this.state?.settings?.debugLogging) return;
    const text = `[BetterKeybinds] ${entry.tag}: ${entry.message}`;
    try {
      const Logger = globalThis.BdApi?.Logger;
      const fn = Logger && typeof Logger[entry.level] === "function" ? Logger[entry.level] : null;
      if (fn) fn.call(Logger, text);
      else console.log(text);
    } catch {
      console.log(text);
    }
  }
  logProbeSummary(context) {
    try {
      this.log.info("probe", `${context}: ${this.discord.probeSummary()}`);
    } catch {
    }
  }
  start() {
    const BdApi = globalThis.BdApi;
    if (!BdApi) {
      console.error("[BetterKeybinds] BdApi unavailable.");
      return;
    }
    this.discord = new DiscordBridge(BdApi, this.log);
    this.log.subscribe((entry) => this.mirrorToConsole(entry));
    const pluginName = this.meta?.name || "BetterKeybinds";
    const { fresh, state } = loadState(BdApi, pluginName, actionTypes());
    this.state = state;
    this.engine = new BindEngine({
      discord: this.discord,
      getBinds: () => this.state.binds,
      notify: (message, type) => this.discord.showToast(message, type),
      runBindById: (id, source) => void this.runBindById(id, source)
    });
    this.engine.start();
    try {
      this.discord.subscribeStreamEvents();
    } catch {
    }
    try {
      globalThis.BetterKeybinds = this;
    } catch {
    }
    const enabled = state.binds.filter((b) => b.enabled).length;
    this.discord.showToast(
      fresh || state.binds.length === 0 ? "Better Keybinds is ready \u2014 add your first keybind in settings." : `Better Keybinds is on \u2014 ${enabled} of ${state.binds.length} keybinds active.`,
      "info"
    );
    try {
      const idle = globalThis.requestIdleCallback || ((cb) => setTimeout(cb, 2500));
      idle(() => {
        try {
          this.discord?.refresh();
          this.engine?.refresh();
          this.logProbeSummary("idle-refresh");
        } catch {
        }
      });
    } catch {
    }
    this.logProbeSummary("startup");
    this.log.info("plugin", `started (${enabled}/${state.binds.length} binds active)`);
  }
  stop() {
    try {
      this.engine?.stop();
    } catch {
    }
    this.engine = null;
    try {
      this.discord?.unsubscribeStreamEvents();
    } catch {
    }
    try {
      if (globalThis.BetterKeybinds === this) delete globalThis.BetterKeybinds;
    } catch {
    }
    try {
      this.log.info("plugin", "stopped");
    } catch {
    }
  }
  async runBindById(id, source = "manual") {
    const bind = this.state?.binds.find((b) => b.id === id);
    if (!bind) return { message: "Bind not found.", ok: false };
    if (!bind.enabled) return { message: "Bind is disabled.", ok: false };
    const res = await runBind(bind, { discord: this.discord });
    try {
      this.log[res.ok ? "info" : "warn"]("run", `${bind.type} via ${source}: ${res.message || (res.ok ? "OK" : "failed")}`);
    } catch {
    }
    const silentSuccess = res.ok && bind.type === "util.toast";
    if ((!res.ok || bind.toastOnRun) && !silentSuccess) {
      this.discord?.showToast(res.message || (res.ok ? "Done" : "That keybind didn't work"), res.ok ? "success" : "error");
    }
    return res;
  }
  updateBinds(binds) {
    if (!this.state) return;
    this.state.binds = binds;
    try {
      saveState(globalThis.BdApi, this.meta?.name || "BetterKeybinds", this.state);
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
      saveState(globalThis.BdApi, this.meta?.name || "BetterKeybinds", this.state);
    } catch {
    }
  }
  getSettingsPanel() {
    const BdApi = globalThis.BdApi;
    const React = BdApi?.React;
    if (!React || !this.state) {
      return "<div style='padding:16px'>BetterKeybinds: settings unavailable (BdApi.React missing).</div>";
    }
    return React.createElement(SettingsPanel, {
      diagnosticsText: () => this.discord.diagnosticsText(`BetterKeybinds diagnostics (v${this.meta?.version || "?"})`),
      discord: this.discord,
      initialBinds: this.state.binds,
      log: this.log,
      onBinds: (binds) => this.updateBinds(binds),
      onRun: (id) => this.runBindById(id, "manual"),
      onSettings: (settings) => this.updateSettings(settings),
      probe: () => this.discord.probe(),
      React,
      settings: this.state.settings
    });
  }
};
