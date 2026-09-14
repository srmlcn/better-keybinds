"use strict";

// Action registry: metadata for the settings UI plus executors.
// Executors only touch Discord through ctx.discord (see lib/discord.js).

const ACTION_DEFS = [
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
      { key: "guildId", label: "Guild ID", placeholder: "123…", required: true, type: "text" },
      { key: "channelId", label: "Channel ID", placeholder: "456…", required: true, type: "text" }
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
      { key: "channelId", label: "Channel ID (saved only)", placeholder: "456…", type: "text" },
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
    description: "Open an https:// URL in the browser.",
    label: "Open URL",
    params: [{ key: "url", label: "URL", placeholder: "https://…", required: true, type: "url" }],
    type: "util.openUrl"
  }
];

function getActionDef(type) {
  return ACTION_DEFS.find((d) => d.type === type) || null;
}

function actionTypes() {
  return ACTION_DEFS.map((d) => d.type);
}

function clampVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

// Nearest-flip: current closer to B goes to A, otherwise B.
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
  if (raw === "" || raw === null || raw === undefined) return { error: "Value is required." };
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
    const raw = params ? params[spec.key] : undefined;
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
      const s = String(raw ?? "").trim();
      if (!s && spec.required) {
        errors.push(`${spec.label} is required.`);
        continue;
      }
      if (s && !/^https?:\/\//i.test(s)) {
        errors.push(`${spec.label} must start with http:// or https://.`);
        continue;
      }
      values[spec.key] = s;
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
        if (current === null) return { message: "Couldn't read the speaker volume yet — run any Set bind first.", ok: false };
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
        if (current === null) return { message: "Couldn't read the microphone volume yet — run any Set bind first.", ok: false };
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
        const channelId = values.channelScope === "saved"
          ? String(values.channelId || "").trim()
          : discord.getCurrentTextChannelId();
        if (!channelId) {
          return {
            message: values.channelScope === "saved" ? "This keybind needs a channel ID." : "Couldn't send — no channel is open.",
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

// Single-action bind execution.
async function runBind(bind, ctx) {
  if (!bind || typeof bind.type !== "string" || !bind.type) {
    return { message: "Bind has no action selected.", ok: false };
  }
  return runAction(bind.type, bind.params, ctx);
}

module.exports = {
  ACTION_DEFS,
  actionTypes,
  clampVolume,
  coerceParams,
  getActionDef,
  resolveToggle,
  runAction,
  runBind,
  sleep,
  validateAction
};
