"use strict";

const { validateAction } = require("./actions");
const { conflictKey, keybindToString, normalizeKeybind } = require("./keybinds");

const STATE_KEY = "state";
const STATE_VERSION = 2;
const MAX_KEYBIND_KEYS = 5;

const DEFAULT_SETTINGS = {
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

// Bind: {id, type, params, keybind, enabled, global, toastOnRun}
function sanitizeBind(bind, knownTypes) {
  if (!bind || typeof bind !== "object") return null;
  if (typeof bind.type !== "string" || !bind.type) return null;
  const params = bind.params && typeof bind.params === "object" && !Array.isArray(bind.params)
    ? { ...bind.params }
    : {};
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

function loadState(BdApi, pluginName, knownTypes) {
  try {
    const raw = BdApi?.Data?.load(pluginName, STATE_KEY);
    if (raw === undefined || raw === null) {
      const state = freshState();
      saveState(BdApi, pluginName, state);
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

function saveState(BdApi, pluginName, state) {
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
    exportedAt: new Date().toISOString(),
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
  const seen = new Set();
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

// Groups of enabled binds sharing one chord, for conflict warnings.
function detectConflicts(binds) {
  const groups = new Map();
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

module.exports = {
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
  loadState,
  sanitizeBind,
  sanitizeSettings,
  saveState,
  validateBind
};
