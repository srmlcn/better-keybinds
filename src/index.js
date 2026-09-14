"use strict";

const { DiscordBridge } = require("./lib/discord");
const { MacroEngine } = require("./lib/registrations");
const { actionTypes, runMacroActions } = require("./lib/actions");
const { loadState, saveState } = require("./lib/store");
const SettingsPanel = require("./ui/SettingsPanel");

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
    } catch { /* ignore */ }
    const enabled = state.macros.filter((m) => m.enabled).length;
    this.discord.showToast(
      fresh
        ? `KeybindMacros: ${state.macros.length} starter macros ready — assign keybinds in settings.`
        : `KeybindMacros: ${enabled}/${state.macros.length} macros active.`,
      "info"
    );
    // Discord lazy-loads modules; warm caches once the client idles.
    try {
      const idle = globalThis.requestIdleCallback || ((cb) => setTimeout(cb, 2500));
      idle(() => {
        try {
          this.discord?.refresh();
          this.engine?.refresh();
        } catch { /* next refresh covers it */ }
      });
    } catch { /* ignore */ }
    this.log(`started (${enabled}/${state.macros.length} macros active)`);
  }

  stop() {
    try {
      this.engine?.stop();
    } catch { /* ignore */ }
    this.engine = null;
    try {
      if (globalThis.KeybindMacros === this) delete globalThis.KeybindMacros;
    } catch { /* ignore */ }
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
    } catch { /* non-fatal */ }
    try {
      this.engine?.refresh();
    } catch { /* non-fatal */ }
  }

  updateSettings(settings) {
    if (!this.state) return;
    this.state.settings = settings;
    try {
      saveState(globalThis.BdApi, this.meta?.name || "KeybindMacros", this.state);
    } catch { /* non-fatal */ }
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
