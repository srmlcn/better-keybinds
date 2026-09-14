"use strict";

const { DiscordBridge } = require("./lib/discord");
const { BindEngine } = require("./lib/registrations");
const { actionTypes, runBind } = require("./lib/actions");
const { loadState, saveState } = require("./lib/store");
const SettingsPanel = require("./ui/SettingsPanel");

module.exports = class BetterKeybinds {
  constructor(meta) {
    this.meta = meta;
    this.state = null;
    this.discord = null;
    this.engine = null;
  }

  log(...args) {
    try {
      if (globalThis.BdApi?.Logger?.info) globalThis.BdApi.Logger.info("BetterKeybinds", ...args);
      else console.log("[BetterKeybinds]", ...args);
    } catch {
      console.log("[BetterKeybinds]", ...args);
    }
  }

  start() {
    const BdApi = globalThis.BdApi;
    if (!BdApi) {
      console.error("[BetterKeybinds] BdApi unavailable.");
      return;
    }
    this.discord = new DiscordBridge(BdApi);
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
      globalThis.BetterKeybinds = this;
    } catch { /* ignore */ }
    const enabled = state.binds.filter((b) => b.enabled).length;
    this.discord.showToast(
      fresh || state.binds.length === 0
        ? "BetterKeybinds: add your first keybind in settings."
        : `BetterKeybinds: ${enabled}/${state.binds.length} binds active.`,
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
    this.log(`started (${enabled}/${state.binds.length} binds active)`);
  }

  stop() {
    try {
      this.engine?.stop();
    } catch { /* ignore */ }
    this.engine = null;
    try {
      if (globalThis.BetterKeybinds === this) delete globalThis.BetterKeybinds;
    } catch { /* ignore */ }
    this.log("stopped");
  }

  async runBindById(id, source = "manual") {
    const bind = this.state?.binds.find((b) => b.id === id);
    if (!bind) return { message: "Bind not found.", ok: false };
    if (!bind.enabled) return { message: "Bind is disabled.", ok: false };
    const res = await runBind(bind, { discord: this.discord });
    if (!res.ok || bind.toastOnRun) {
      this.discord?.showToast(
        res.ok ? `${res.message || "OK"} (${source})` : (res.message || "Bind failed"),
        res.ok ? "success" : "error"
      );
    }
    return res;
  }

  updateBinds(binds) {
    if (!this.state) return;
    this.state.binds = binds;
    try {
      saveState(globalThis.BdApi, this.meta?.name || "BetterKeybinds", this.state);
    } catch { /* non-fatal */ }
    try {
      this.engine?.refresh();
    } catch { /* non-fatal */ }
  }

  updateSettings(settings) {
    if (!this.state) return;
    this.state.settings = settings;
    try {
      saveState(globalThis.BdApi, this.meta?.name || "BetterKeybinds", this.state);
    } catch { /* non-fatal */ }
  }

  getSettingsPanel() {
    const BdApi = globalThis.BdApi;
    const React = BdApi?.React;
    if (!React || !this.state) {
      return "<div style='padding:16px'>BetterKeybinds: settings unavailable (BdApi.React missing).</div>";
    }
    return React.createElement(SettingsPanel, {
      discord: this.discord,
      initialBinds: this.state.binds,
      onBinds: (binds) => this.updateBinds(binds),
      onRun: (id) => this.runBindById(id, "manual"),
      React,
      settings: this.state.settings
    });
  }
};
