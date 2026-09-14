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

function numericIdFor(macroId) {
  const s = String(macroId);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return GLOBAL_ID_BASE + (Math.abs(h) % GLOBAL_ID_RANGE);
}

// Owns in-app listeners plus global shortcut registrations.
class MacroEngine {
  constructor({ discord, getMacros, notify, runMacroById }) {
    this.discord = discord;
    this.getMacros = getMacros;
    this.notify = notify || (() => {});
    this.runMacroById = runMacroById;
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
      } catch { /* runner reports its own errors */ }
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
}

module.exports = { GLOBAL_ID_BASE, MacroEngine, numericIdFor };
