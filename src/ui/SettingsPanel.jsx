"use strict";

const { ACTION_DEFS, getActionDef } = require("../lib/actions");
const {
  detectConflicts,
  ensureUniqueIds,
  exportState,
  generateId,
  importState,
  validateBind
} = require("../lib/store");
const { eventToKeyName, keybindToString } = require("../lib/keybinds");

const KNOWN_TYPES = ACTION_DEFS.map((d) => d.type);
const MAX_RECORD_KEYS = 5;

function defaultParamsFor(type) {
  const def = getActionDef(type);
  const params = {};
  for (const spec of def?.params || []) {
    params[spec.key] = spec.default ?? (spec.type === "checkbox" ? false : "");
  }
  return params;
}

function groupedDefs() {
  const groups = new Map();
  for (const def of ACTION_DEFS) {
    if (!groups.has(def.category)) groups.set(def.category, []);
    groups.get(def.category).push(def);
  }
  return [...groups.entries()];
}

function bindLabel(bind) {
  return getActionDef(bind.type)?.label || bind.type || "Unknown action";
}

// Discord keybind-settings style: one row per bind, action dropdown plus
// keybind capture button. Native controls only (no BdApi.Components
// dependency). React is injected via props.
function SettingsPanel(props) {
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
  const pressedRef = React.useRef(new Set());
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
    pressedRef.current = new Set();
    setRecordedKeys([]);
    setRecordingId(null);
    if (!id || !keys.length) return;
    const next = bindsRef.current.map((b) => (b.id === id ? { ...b, keybind: keys } : b));
    setBinds(next);
    onBinds(next);
  }

  function startRecording(id) {
    collectedRef.current = [];
    pressedRef.current = new Set();
    setRecordedKeys([]);
    setRecordingId(id);
  }

  function cancelRecording() {
    collectedRef.current = [];
    pressedRef.current = new Set();
    setRecordedKeys([]);
    setRecordingId(null);
  }

  React.useEffect(() => {
    if (!recordingId) return undefined;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingId]);

  function updateBind(id, patch) {
    commit(bindsRef.current.map((b) => (b.id === id ? { ...b, ...patch } : b)));
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
      text = `${diagnosticsText?.() || ""}\n\n--- log ---\n${log?.toText(150) || "(no log)"}`;
    } catch (error) {
      say("error", error?.message || String(error));
      return;
    }
    const fallback = () => {
      setIoText(text);
      try {
        if (ioDetailsRef.current) ioDetailsRef.current.open = true;
      } catch { /* ignore */ }
      say("warning", "Clipboard unavailable — diagnostics placed in the import/export box below.");
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
    } catch { /* non-fatal */ }
  }

  function deepScan() {
    let hits = [];
    try {
      hits = discord?.scanAudioCandidates?.() || [];
    } catch (error) {
      say("error", error?.message || String(error));
      return;
    }
    say("info", hits.length ? `Deep scan found ${hits.length} audio candidate(s) — see the log.` : "Deep scan found no audio modules.");
  }

  React.useEffect(() => {
    if (!log?.subscribe) return undefined;
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
      return (
        <label key={spec.key} style={s.checkRow}>
          <input checked={Boolean(value)} onChange={(e) => set(e.target.checked)} type="checkbox" />
          <span>{spec.label}</span>
        </label>
      );
    }
    if (spec.type === "select") {
      return (
        <label key={spec.key} style={s.param}>
          <span style={s.label}>{spec.label}</span>
          <select onChange={(e) => set(e.target.value)} style={s.input} value={value}>
            {(spec.options || []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      );
    }
    if (spec.type === "textarea") {
      return (
        <label key={spec.key} style={{ ...s.param, flex: "1 1 220px" }}>
          <span style={s.label}>{spec.label}</span>
          <textarea
            onChange={(e) => set(e.target.value)}
            placeholder={spec.placeholder || ""}
            rows={1}
            style={{ ...s.input, flex: 1 }}
            value={value}
          />
        </label>
      );
    }
    if (spec.type === "volume" || spec.type === "delta" || spec.type === "number") {
      return (
        <label key={spec.key} style={s.param}>
          <span style={s.label}>{spec.label}</span>
          <input
            max={spec.max}
            min={spec.min}
            onChange={(e) => set(Number(e.target.value))}
            style={{ ...s.input, width: 72 }}
            type="number"
            value={Number(value) || 0}
          />
        </label>
      );
    }
    return (
      <label key={spec.key} style={{ ...s.param, flex: spec.type === "url" ? "1 1 200px" : "0 1 auto" }}>
        <span style={s.label}>{spec.label}</span>
        <input
          onChange={(e) => set(e.target.value)}
          placeholder={spec.placeholder || ""}
          style={{ ...s.input, flex: spec.type === "url" ? 1 : "0 1 130px" }}
          type="text"
          value={value}
        />
      </label>
    );
  }

  function renderBind(bind) {
    const def = getActionDef(bind.type);
    const recording = recordingId === bind.id;
    const errors = validateBind(bind, KNOWN_TYPES);
    const result = lastResult?.id === bind.id ? lastResult : null;
    return (
      <div key={bind.id} style={s.bindCard}>
        <div style={s.row}>
          <input
            checked={bind.enabled}
            onChange={(e) => updateBind(bind.id, { enabled: e.target.checked })}
            title="Enabled"
            type="checkbox"
          />
          <select
            onChange={(e) => changeType(bind.id, e.target.value)}
            style={{ ...s.input, flex: "2 1 200px" }}
            value={bind.type}
          >
            {groupedDefs().map(([cat, defs]) => (
              <optgroup key={cat} label={cat}>
                {defs.map((d) => (
                  <option key={d.type} value={d.type}>{d.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            onClick={() => (recording ? cancelRecording() : startRecording(bind.id))}
            style={s.keyButton(recording)}
            title={recording ? "Recording… press keys, Esc cancels" : "Click to set keybind"}
          >
            {recording ? (keybindToString(recordedKeys) === "Not set" ? "Press keys…" : keybindToString(recordedKeys)) : keybindToString(bind.keybind)}
          </button>
          <button onClick={() => updateBind(bind.id, { keybind: [] })} style={s.btn} title="Clear keybind">✕</button>
          <button onClick={() => testRun(bind.id)} style={s.btn} title="Run now">Run</button>
          <button onClick={() => removeBind(bind.id)} style={s.btnDanger} title="Delete bind">Delete</button>
        </div>
        {(def?.params || []).length ? (
          <div style={{ ...s.row, marginTop: 8 }}>
            {(def.params || []).map((spec) => renderParam(bind, spec))}
          </div>
        ) : null}
        <div style={{ ...s.row, marginTop: 8 }}>
          <label style={s.checkRow}>
            <input checked={bind.global} onChange={(e) => updateBind(bind.id, { global: e.target.checked })} type="checkbox" />
            <span>Global{globalSupported ? "" : " (unavailable)"}</span>
          </label>
          <label style={s.checkRow}>
            <input checked={bind.toastOnRun} onChange={(e) => updateBind(bind.id, { toastOnRun: e.target.checked })} type="checkbox" />
            <span>Toast on run</span>
          </label>
          {def?.description ? <span style={s.small}>{def.description}</span> : null}
        </div>
        {bind.unknown ? <div style={s.notice("warning")}>Unknown action "{bind.type}" — kept for forward compatibility.</div> : null}
        {errors.length ? <div style={s.notice("warning")}>{errors.join(" ")}</div> : null}
        {result ? <div style={s.result(result.ok)}>{result.message || (result.ok ? "OK" : "Failed")}</div> : null}
      </div>
    );
  }

  const enabledCount = binds.filter((b) => b.enabled).length;

  return (
    <div style={s.root}>
      <div style={{ ...s.row, justifyContent: "space-between" }}>
        <h2 style={s.title}>Better Keybinds</h2>
        <span style={s.badge(globalSupported)} title={globalSupported ? "Global shortcuts available" : "DiscordNative unavailable"}>
          {globalSupported ? "Global OK" : "In-app only"}
        </span>
      </div>
      <div style={s.small}>{enabledCount}/{binds.length} binds enabled. Global binds also fire while Discord is unfocused.</div>

      {conflicts.map((c) => (
        <div key={c.key} style={s.conflict}>
          Conflict on {c.label}: {c.binds.map((b) => bindLabel(binds.find((x) => x.id === b.id) || b)).join(", ")}
        </div>
      ))}
      {notice ? <div style={s.notice(notice.kind)}>{notice.text}</div> : null}

      <div style={s.toolbar}>
        <button onClick={addBind} style={s.btnPrimary}>+ Add keybind</button>
      </div>

      <details ref={ioDetailsRef} style={s.details}>
        <summary style={s.summary}>Import / export / reset ▾</summary>
        <div style={s.toolbar}>
          <button onClick={doExport} style={s.btn}>Export</button>
          <button onClick={() => doImport(false)} style={s.btn}>Import (append)</button>
          <button onClick={() => doImport(true)} style={s.btn}>Import (replace)</button>
          <button onClick={doClear} style={s.btnDanger}>Delete all</button>
        </div>
        <textarea
          onChange={(e) => setIoText(e.target.value)}
          placeholder="Export output or paste binds JSON here, then Import."
          rows={4}
          style={{ ...s.input, marginTop: 6, width: "100%" }}
          value={ioText}
        />
      </details>
      <div style={{ ...s.small, marginTop: 6 }}>Click a keybind button, press a chord, release to save (Esc cancels). Single-character binds are ignored while typing. Exact chords only: Ctrl+K never fires during Ctrl+Shift+K.</div>

      {binds.length === 0 ? (
        <div style={{ ...s.small, marginTop: 12 }}>
          No keybinds yet. Add one, pick an action from the dropdown, then click its keybind button and press your chord.
        </div>
      ) : null}
      {binds.map(renderBind)}

      <h3 style={s.sectionTitle}>Diagnostics</h3>
      <div style={s.toolbar}>
        <button onClick={() => setStatus(safeProbe())} style={s.btn}>Refresh status</button>
        <button onClick={deepScan} style={s.btn}>Deep scan</button>
        <button onClick={copyDiagnostics} style={s.btnPrimary}>Copy diagnostics</button>
        <button onClick={() => { try { log?.clear(); } catch { /* ignore */ } setLogTick((t) => t + 1); }} style={s.btn}>Clear log</button>
        <label style={s.checkRow}>
          <input checked={debugOn} onChange={(e) => toggleDebug(e.target.checked)} type="checkbox" />
          <span>Debug logging to console</span>
        </label>
      </div>
      {status ? (
        <div style={s.statusGrid}>
          <span><span style={s.statusDot(status.flux)} />Flux</span>
          <span><span style={s.statusDot(status.mediaEngine)} />MediaEngine ({status.mediaMethods.length}/7)</span>
          <span><span style={s.statusDot(status.audioActions)} />AudioActions</span>
          <span><span style={s.statusDot(Boolean(status.audioPath?.setters?.setOutputVolume))} />VSet</span>
          <span><span style={s.statusDot(status.voiceActions)} />Voice</span>
          <span><span style={s.statusDot(status.channelActions)} />Channel</span>
          <span><span style={s.statusDot(status.messageActions)} />Message</span>
          <span><span style={s.statusDot(status.selectedChannel)} />SelectedCh</span>
          <span><span style={s.statusDot(status.discordUtils)} />Native</span>
          <span><span style={s.statusDot(status.keycodeMap)} />Keymap</span>
          <span><span style={s.statusDot(status.streaming?.ready)} />Stream</span>
          <span style={s.small}>platform: {status.platform}</span>
          <span style={s.small}>out: {status.outputVolume ?? (status.outputTracked ?? "?")}{status.outputVolume == null && status.outputTracked != null ? "~" : ""}{status.outputAmplitude != null ? ` amp ${Math.round(status.outputAmplitude * 10) / 10}` : ""}</span>
          <span style={s.small}>in: {status.inputVolume ?? (status.inputTracked ?? "?")}{status.inputVolume == null && status.inputTracked != null ? "~" : ""}{status.inputAmplitude != null ? ` amp ${Math.round(status.inputAmplitude * 10) / 10}` : ""}</span>
          <span style={s.small}>mute: {String(status.selfMute ?? "?")}</span>
          <span style={s.small}>deaf: {String(status.selfDeaf ?? "?")}</span>
          <span style={s.small}>live: {status.streaming?.selfStream ? "yes" : "no"}</span>
          <span style={s.small}>games: {status.streaming?.games ?? "?"}{status.streaming?.gameName ? ` (${status.streaming.gameName})` : ""}</span>
        </div>
      ) : (
        <div style={s.small}>Status unavailable.</div>
      )}
      {status && !status.mediaEngine ? (
        <div style={s.small}>Speaker controls not found — hit Deep scan, then Copy diagnostics.</div>
      ) : null}
      <pre ref={logPreRef} style={s.logPre}>{log?.toText(80) || "(empty)"}</pre>
    </div>
  );
}

module.exports = SettingsPanel;
