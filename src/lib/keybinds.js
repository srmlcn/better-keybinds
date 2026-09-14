"use strict";

// Pure keybind helpers. No BdApi/DOM access so this module is unit-testable.

const MAX_KEYS = 5;

const MODIFIER_ALIASES = {
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

const SPECIAL_ALIASES = {
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

const ARROW_RE = /^arrow(up|down|left|right)$/i;
const CODE_SIDE_RE = /^(control|ctrl|shift|alt|meta)(left|right|l|r)$/i;
const ECODE_KEY_RE = /^key([a-z])$/i;
const ECODE_DIGIT_RE = /^digit([0-9])$/i;
const FKEY_RE = /^f(\d{1,2})$/i;

function normalizeKeyName(raw) {
  if (raw === null || raw === undefined) return null;
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

// Stable key for conflict detection. Empty binds return "" (never conflict).
function conflictKey(bind) {
  const sorted = sortedCopy(bind);
  return sorted.length ? sorted.join("+") : "";
}

function keybindToString(bind) {
  const norm = normalizeKeybind(bind, 99);
  return norm.length ? norm.join(" + ") : "Not set";
}

// Exact chord match: every bind key pressed and nothing extra. Prevents
// Ctrl+K from firing while pressing Ctrl+Shift+K.
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

// Single-character binds are skipped while typing so macros don't hijack text entry.
function shouldSkipForTarget(bind, target) {
  return isSinglePrintable(bind) && isEditableTarget(target);
}

// Candidate lookup keys (lowercase) for Discord's platform keycode maps.
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

// Windows virtual-key fallback used when Discord's keycode map is unavailable.
function buildWindowsFallback() {
  const map = {
    alt: 0xa4,
    apps: 0x5d,
    arrowdown: 0x28,
    arrowleft: 0x25,
    arrowright: 0x27,
    arrowup: 0x26,
    backspace: 0x08,
    break: 0x13,
    capslock: 0x14,
    cmd: 0x5b,
    command: 0x5b,
    contextmenu: 0x5d,
    control: 0xa2,
    ctrl: 0xa2,
    del: 0x2e,
    delete: 0x2e,
    down: 0x28,
    end: 0x23,
    enter: 0x0d,
    esc: 0x1b,
    escape: 0x1b,
    home: 0x24,
    ins: 0x2d,
    insert: 0x2d,
    left: 0x25,
    menu: 0x5d,
    meta: 0x5b,
    numlock: 0x90,
    option: 0xa4,
    pagedown: 0x22,
    pageup: 0x21,
    pause: 0x13,
    pgdn: 0x22,
    pgup: 0x21,
    printscreen: 0x2c,
    prtsc: 0x2c,
    return: 0x0d,
    right: 0x27,
    scrolllock: 0x91,
    shift: 0xa0,
    space: 0x20,
    spacebar: 0x20,
    super: 0x5b,
    tab: 0x09,
    up: 0x26,
    volumedown: 0xae,
    volumemute: 0xad,
    volumeup: 0xaf,
    win: 0x5b
  };
  for (let i = 0; i < 26; i++) map[String.fromCharCode(0x61 + i)] = 0x41 + i;
  for (let i = 0; i < 10; i++) map[String(i)] = 0x30 + i;
  for (let i = 1; i <= 24; i++) map[`f${i}`] = 0x6f + i;
  return map;
}

const WINDOWS_FALLBACK_VK = buildWindowsFallback();

// Returns {keys:[[0,code]...]} or {error, missing:[...]}.
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

// The webpack hit may be the map itself or an object containing it.
function extractKeycodeMap(mod) {
  if (!mod || typeof mod !== "object") return null;
  if (typeof mod.ctrl === "number") return mod;
  for (const value of Object.values(mod)) {
    if (value && typeof value === "object" && typeof value.ctrl === "number") return value;
  }
  return null;
}

module.exports = {
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
