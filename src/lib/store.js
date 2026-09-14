"use strict";

const { conflictKey, keybindToString, normalizeKeybind } = require("./keybinds");

const STATE_KEY = "state";
const STATE_VERSION = 1;
const MAX_ACTIONS_PER_MACRO = 20;
const MAX_KEYBIND_KEYS = 5;

const DEFAULT_SETTINGS = {
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
  const params = action.params && typeof action.params === "object" && !Array.isArray(action.params)
    ? { ...action.params }
    : {};
  const clean = { params, type: action.type };
  if (Array.isArray(knownTypes) && !knownTypes.includes(action.type)) clean.unknown = true;
  return clean;
}

function sanitizeMacro(macro, knownTypes) {
  if (!macro || typeof macro !== "object") return null;
  const actions = Array.isArray(macro.actions) ? macro.actions : [];
  const name = typeof macro.name === "string" && macro.name.trim()
    ? macro.name.trim().slice(0, 80)
    : "Untitled macro";
  return {
    actions: actions
      .map((a) => sanitizeAction(a, knownTypes))
      .filter(Boolean)
      .slice(0, MAX_ACTIONS_PER_MACRO),
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
    if (action.unknown || (Array.isArray(knownTypes) && !knownTypes.includes(action.type))) {
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

function loadState(BdApi, pluginName, knownTypes) {
  try {
    const raw = BdApi?.Data?.load(pluginName, STATE_KEY);
    if (raw === undefined || raw === null) {
      const state = { macros: defaultPresets(), settings: { ...DEFAULT_SETTINGS }, version: STATE_VERSION };
      saveState(BdApi, pluginName, state);
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

function saveState(BdApi, pluginName, state) {
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
    exportedAt: new Date().toISOString(),
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
  const seen = new Set();
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

// Groups of enabled macros sharing one chord, for conflict warnings.
function detectConflicts(macros) {
  const groups = new Map();
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

module.exports = {
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
  loadState,
  sanitizeAction,
  sanitizeMacro,
  sanitizeSettings,
  saveState,
  validateMacro
};
