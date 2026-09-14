"use strict";

const {
  WINDOWS_FALLBACK_VK,
  buildGlobalKeyArray,
  eventToKeyName,
  normalizeKeybind,
  pressedMatches,
  shouldSkipForTarget
} = require("./keybinds");

const TRIGGER_DEBOUNCE_MS = 150;
const GLOBAL_ID_BASE = 4100000;
const GLOBAL_ID_RANGE = 50000;

function numericIdFor(bindId) {
  const s = String(bindId);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return GLOBAL_ID_BASE + (Math.abs(h) % GLOBAL_ID_RANGE);
}

// Owns in-app listeners plus global shortcut registrations.
class BindEngine {
  constructor({ discord, getBinds, notify, runBindById }) {
    this.discord = discord;
    this.getBinds = getBinds;
    this.notify = notify || (() => {});
    this.runBindById = runBindById;
    this.pressed = new Set();
    this.fired = new Set();
    this.lastFired = new Map();
    this.globalIds = new Map();
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
      } catch { /* runner reports its own errors */ }
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
    } catch { /* runner reports its own errors */ }
  }

  unregisterAllGlobal() {
    if (this.globalIds.size === 0) return;
    const utils = this.discord?.getDiscordUtils?.();
    for (const [, numId] of this.globalIds) {
      try {
        utils?.inputEventUnregister?.(numId);
      } catch { /* already gone */ }
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
      this.globalStatus.errors.push("DiscordNative global shortcuts unavailable; global binds work in-app only.");
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
    this.notify(`Global keybinds: ${first}${extra}`, "warning");
  }
}

module.exports = { BindEngine, GLOBAL_ID_BASE, numericIdFor };
