"use strict";

const { ACTION_DEFS, getActionDef } = require("../lib/actions");
const {
  defaultPresets,
  detectConflicts,
  ensureUniqueIds,
  exportState,
  generateId,
  importState,
  validateMacro
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

// Native controls only (no BdApi.Components dependency) so the panel works
// across BetterDiscord versions. React is injected via props.
function SettingsPanel(props) {
  const { React, discord, initialMacros, onMacros, onRun, settings } = props;
  const [macros, setMacros] = React.useState(initialMacros || []);
  const [selectedId, setSelectedId] = React.useState(initialMacros?.[0]?.id || null);
  const [recording, setRecording] = React.useState(false);
  const [recordedKeys, setRecordedKeys] = React.useState([]);
  const [ioText, setIoText] = React.useState("");
  const [notice, setNotice] = React.useState(null);
  const [addType, setAddType] = React.useState(ACTION_DEFS[0].type);
  const pressedRef = React.useRef(new Set());
  const collectedRef = React.useRef([]);

  const selected = macros.find((m) => m.id === selectedId) || macros[0] || null;
  const conflicts = React.useMemo(() => detectConflicts(macros), [macros]);
  const globalSupported = React.useMemo(() => {
    try {
      return Boolean(discord?.hasGlobalSupport?.());
    } catch {
      return false;
    }
  }, [discord]);
  const selectedErrors = React.useMemo(
    () => (selected ? validateMacro(selected, KNOWN_TYPES) : []),
    [selected]
  );

  function commit(next) {
    setMacros(next);
    onMacros(next);
  }

  function say(kind, text) {
    setNotice({ kind, text });
  }

  function finishRecording() {
    const keys = [...collectedRef.current];
    collectedRef.current = [];
    pressedRef.current = new Set();
    setRecordedKeys([]);
    setRecording(false);
    if (!selected || !keys.length) return;
    commit(macros.map((m) => (m.id === selected.id ? { ...m, keybind: keys } : m)));
  }

  function startRecording() {
    if (!selected) return;
    collectedRef.current = [];
    pressedRef.current = new Set();
    setRecordedKeys([]);
    setRecording(true);
  }

  function cancelRecording() {
    collectedRef.current = [];
    pressedRef.current = new Set();
    setRecordedKeys([]);
    setRecording(false);
  }

  React.useEffect(() => {
    if (!recording) return undefined;
    const onDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
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
  }, [recording, selectedId]);

  function updateSelected(patch) {
    if (!selected) return;
    commit(macros.map((m) => (m.id === selected.id ? { ...m, ...patch } : m)));
  }

  function updateAction(index, patchParams) {
    if (!selected) return;
    const actions = selected.actions.map((a, i) => (
      i === index ? { ...a, params: { ...a.params, ...patchParams } } : a
    ));
    updateSelected({ actions });
  }

  function changeActionType(index, type) {
    if (!selected) return;
    const actions = selected.actions.map((a, i) => (
      i === index ? { params: defaultParamsFor(type), type } : a
    ));
    updateSelected({ actions });
  }

  function moveAction(index, dir) {
    if (!selected) return;
    const next = index + dir;
    if (next < 0 || next >= selected.actions.length) return;
    const actions = [...selected.actions];
    [actions[index], actions[next]] = [actions[next], actions[index]];
    updateSelected({ actions });
  }

  function removeAction(index) {
    if (!selected) return;
    updateSelected({ actions: selected.actions.filter((_, i) => i !== index) });
  }

  function addAction() {
    if (!selected) return;
    updateSelected({
      actions: [...selected.actions, { params: defaultParamsFor(addType), type: addType }]
    });
  }

  function addMacro() {
    const macro = {
      actions: [{ params: defaultParamsFor("output.toggle"), type: "output.toggle" }],
      enabled: true,
      global: Boolean(settings?.defaultGlobal),
      id: generateId(),
      keybind: [],
      name: `Macro ${macros.length + 1}`,
      toastOnRun: settings?.defaultToast !== false
    };
    commit([...macros, macro]);
    setSelectedId(macro.id);
  }

  function duplicateMacro(id) {
    const src = macros.find((m) => m.id === id);
    if (!src) return;
    const copy = {
      ...src,
      actions: src.actions.map((a) => ({ params: { ...a.params }, type: a.type })),
      id: generateId(),
      keybind: [...src.keybind],
      name: `${src.name} (copy)`
    };
    commit([...macros, copy]);
    setSelectedId(copy.id);
  }

  function deleteMacro(id) {
    commit(macros.filter((m) => m.id !== id));
    if (selectedId === id) setSelectedId(macros.find((m) => m.id !== id)?.id || null);
  }

  function doExport() {
    setIoText(exportState({ macros }));
    say("info", `Exported ${macros.length} macro(s). Copy the text below to back up or share.`);
  }

  function doCopy() {
    const done = () => say("info", "Copied to clipboard.");
    try {
      if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(ioText).then(done, done);
      else say("warning", "Clipboard unavailable; select the text manually.");
    } catch {
      say("warning", "Clipboard unavailable; select the text manually.");
    }
  }

  function doImport(replace) {
    try {
      const { macros: imported, warnings } = importState(ioText, KNOWN_TYPES);
      ensureUniqueIds(macros, imported);
      commit(replace ? imported : [...macros, ...imported]);
      const extra = warnings.length ? ` Warnings: ${warnings.slice(0, 3).join(" ")}` : "";
      say("info", `Imported ${imported.length} macro(s).${extra}`);
    } catch (error) {
      say("error", error?.message || String(error));
    }
  }

  function doReset() {
    if (!window.confirm("Reset all macros to the starter presets? This replaces everything.")) return;
    commit(defaultPresets());
    say("info", "Reset to starter presets.");
  }

  const s = {
    actionCard: {
      background: "var(--background-secondary-alt, #2b2d31)",
      border: "1px solid var(--background-modifier-accent, #3f4248)",
      borderRadius: 8,
      marginBottom: 8,
      padding: 8
    },
    badge: (on) => ({
      background: on ? "#248046" : "#4e5058",
      borderRadius: 10,
      color: "#fff",
      fontSize: 11,
      fontWeight: 600,
      padding: "2px 8px",
      whiteSpace: "nowrap"
    }),
    btn: {
      background: "var(--background-modifier-accent, #3f4248)",
      border: "1px solid transparent",
      borderRadius: 6,
      color: "var(--text-normal, #dbdee1)",
      cursor: "pointer",
      fontSize: 12,
      padding: "5px 10px"
    },
    btnDanger: {
      background: "#a12829",
      border: "1px solid transparent",
      borderRadius: 6,
      color: "#fff",
      cursor: "pointer",
      fontSize: 12,
      padding: "5px 10px"
    },
    btnPrimary: {
      background: "#5865f2",
      border: "1px solid transparent",
      borderRadius: 6,
      color: "#fff",
      cursor: "pointer",
      fontSize: 12,
      padding: "5px 10px"
    },
    checkRow: { alignItems: "center", display: "flex", gap: 6, marginTop: 8 },
    conflict: {
      background: "#7a5c00",
      borderRadius: 6,
      color: "#fff",
      fontSize: 12,
      marginTop: 8,
      padding: "6px 10px"
    },
    editor: { flex: "2 1 340px", minWidth: 0 },
    field: { marginTop: 8 },
    input: {
      background: "var(--background-tertiary, #1e1f22)",
      border: "1px solid var(--background-modifier-accent, #3f4248)",
      borderRadius: 6,
      boxSizing: "border-box",
      color: "var(--text-normal, #dbdee1)",
      fontSize: 13,
      padding: "6px 8px",
      width: "100%"
    },
    label: { color: "var(--text-muted, #949ba4)", display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 },
    list: { flex: "1 1 220px", maxWidth: 320, minWidth: 200 },
    listItem: (active) => ({
      background: active ? "var(--background-modifier-selected, #3f4248)" : "var(--background-secondary, #2b2d31)",
      border: "1px solid var(--background-modifier-accent, #3f4248)",
      borderRadius: 8,
      cursor: "pointer",
      marginBottom: 6,
      padding: "8px 10px"
    }),
    main: { display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 },
    notice: (kind) => ({
      background: kind === "error" ? "#a12829" : kind === "warning" ? "#7a5c00" : "#2c5f8a",
      borderRadius: 6,
      color: "#fff",
      fontSize: 12,
      marginTop: 8,
      padding: "6px 10px"
    }),
    root: { color: "var(--text-normal, #dbdee1)", fontSize: 13, padding: "4px 4px 16px" },
    row: { alignItems: "center", display: "flex", gap: 6 },
    small: { color: "var(--text-muted, #949ba4)", fontSize: 11 },
    title: { fontSize: 16, fontWeight: 700, margin: 0 },
    toolbar: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }
  };

  function renderParam(action, index, spec) {
    const value = action.params?.[spec.key] ?? spec.default ?? "";
    const set = (v) => updateAction(index, { [spec.key]: v });
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
        <div key={spec.key} style={s.field}>
          <label style={s.label}>{spec.label}</label>
          <select onChange={(e) => set(e.target.value)} style={s.input} value={value}>
            {(spec.options || []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      );
    }
    if (spec.type === "textarea") {
      return (
        <div key={spec.key} style={s.field}>
          <label style={s.label}>{spec.label}</label>
          <textarea
            onChange={(e) => set(e.target.value)}
            placeholder={spec.placeholder || ""}
            rows={2}
            style={s.input}
            value={value}
          />
        </div>
      );
    }
    if (spec.type === "volume" || spec.type === "delta" || spec.type === "number") {
      return (
        <div key={spec.key} style={s.field}>
          <label style={s.label}>{spec.label}</label>
          <div style={s.row}>
            <input
              max={spec.max}
              min={spec.min}
              onChange={(e) => set(Number(e.target.value))}
              style={{ ...s.input, padding: 0 }}
              type="range"
              value={Number(value) || 0}
            />
            <input
              max={spec.max}
              min={spec.min}
              onChange={(e) => set(Number(e.target.value))}
              style={{ ...s.input, width: 76 }}
              type="number"
              value={Number(value) || 0}
            />
          </div>
        </div>
      );
    }
    return (
      <div key={spec.key} style={s.field}>
        <label style={s.label}>{spec.label}</label>
        <input
          onChange={(e) => set(e.target.value)}
          placeholder={spec.placeholder || ""}
          style={s.input}
          type="text"
          value={value}
        />
      </div>
    );
  }

  function renderActionCard(action, index) {
    const def = getActionDef(action.type);
    return (
      <div key={`${action.type}-${index}`} style={s.actionCard}>
        <div style={s.row}>
          <select
            onChange={(e) => changeActionType(index, e.target.value)}
            style={{ ...s.input, flex: 1 }}
            value={action.type}
          >
            {groupedDefs().map(([cat, defs]) => (
              <optgroup key={cat} label={cat}>
                {defs.map((d) => (
                  <option key={d.type} value={d.type}>{d.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button onClick={() => moveAction(index, -1)} style={s.btn} title="Move up">↑</button>
          <button onClick={() => moveAction(index, 1)} style={s.btn} title="Move down">↓</button>
          <button onClick={() => removeAction(index)} style={s.btnDanger} title="Remove">✕</button>
        </div>
        {def?.description ? <div style={{ ...s.small, marginTop: 4 }}>{def.description}</div> : null}
        {action.unknown ? (
          <div style={s.notice("warning")}>Unknown action "{action.type}" — kept for forward compatibility.</div>
        ) : null}
        {(def?.params || []).map((spec) => renderParam(action, index, spec))}
      </div>
    );
  }

  const enabledCount = macros.filter((m) => m.enabled).length;

  return (
    <div style={s.root}>
      <div style={{ ...s.row, justifyContent: "space-between" }}>
        <h2 style={s.title}>Keybind Macros</h2>
        <span style={s.badge(globalSupported)} title={globalSupported ? "Global shortcuts available" : "DiscordNative unavailable"}>
          {globalSupported ? "Global OK" : "In-app only"}
        </span>
      </div>
      <div style={s.small}>{enabledCount}/{macros.length} macros enabled. Global macros also fire while Discord is unfocused.</div>

      {conflicts.map((c) => (
        <div key={c.key} style={s.conflict}>
          Conflict on {c.label}: {c.macros.map((m) => m.name).join(", ")}
        </div>
      ))}
      {notice ? <div style={s.notice(notice.kind)}>{notice.text}</div> : null}

      <div style={s.toolbar}>
        <button onClick={addMacro} style={s.btnPrimary}>+ Add macro</button>
        <button onClick={doExport} style={s.btn}>Export</button>
        <button onClick={doCopy} style={s.btn}>Copy box</button>
        <button onClick={() => doImport(false)} style={s.btn}>Import (append)</button>
        <button onClick={() => doImport(true)} style={s.btn}>Import (replace)</button>
        <button onClick={doReset} style={s.btnDanger}>Reset presets</button>
      </div>

      <div style={s.main}>
        <div style={s.list}>
          {macros.length === 0 ? <div style={s.small}>No macros yet — add one to begin.</div> : null}
          {macros.map((m) => (
            <div key={m.id} onClick={() => setSelectedId(m.id)} style={s.listItem(selected?.id === m.id)}>
              <div style={{ ...s.row, justifyContent: "space-between" }}>
                <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</strong>
                <input
                  checked={m.enabled}
                  onChange={(e) => {
                    e.stopPropagation();
                    commit(macros.map((x) => (x.id === m.id ? { ...x, enabled: e.target.checked } : x)));
                  }}
                  onClick={(e) => e.stopPropagation()}
                  title="Enabled"
                  type="checkbox"
                />
              </div>
              <div style={s.small}>{keybindToString(m.keybind)}{m.global ? " · global" : ""} · {m.actions.length} action(s)</div>
              <div style={{ ...s.row, marginTop: 6 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); onRun(m.id); }}
                  style={s.btn}
                >
                  Run
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); duplicateMacro(m.id); }}
                  style={s.btn}
                >
                  Duplicate
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteMacro(m.id); }}
                  style={s.btnDanger}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={s.editor}>
          {!selected ? (
            <div style={s.small}>Select a macro to edit it.</div>
          ) : (
            <div>
              <div style={s.field}>
                <label style={s.label}>Name</label>
                <input
                  onChange={(e) => updateSelected({ name: e.target.value })}
                  style={s.input}
                  type="text"
                  value={selected.name}
                />
              </div>
              <div style={s.field}>
                <label style={s.label}>Keybind</label>
                <div style={s.row}>
                  <input readOnly style={{ ...s.input, flex: 1 }} type="text" value={recording ? keybindToString(recordedKeys) || "Press keys…" : keybindToString(selected.keybind)} />
                  {!recording ? (
                    <button onClick={startRecording} style={s.btnPrimary}>Record</button>
                  ) : (
                    <button onClick={cancelRecording} style={s.btnDanger}>Cancel</button>
                  )}
                  <button onClick={() => updateSelected({ keybind: [] })} style={s.btn}>Clear</button>
                </div>
                {recording ? <div style={s.small}>Press a key combo, then release all keys. Recording captures instead of triggering.</div> : null}
              </div>
              <label style={s.checkRow}>
                <input checked={selected.global} onChange={(e) => updateSelected({ global: e.target.checked })} type="checkbox" />
                <span>Global (fire while Discord is unfocused){globalSupported ? "" : " — unavailable, in-app only"}</span>
              </label>
              <label style={s.checkRow}>
                <input checked={selected.toastOnRun} onChange={(e) => updateSelected({ toastOnRun: e.target.checked })} type="checkbox" />
                <span>Show toast when macro runs</span>
              </label>
              {selectedErrors.length ? (
                <div style={s.notice("warning")}>{selectedErrors.join(" ")}</div>
              ) : null}

              <h3 style={{ fontSize: 13, margin: "12px 0 6px" }}>Actions (run in order)</h3>
              {selected.actions.length === 0 ? <div style={s.small}>No actions — add one below.</div> : null}
              {selected.actions.map((a, i) => renderActionCard(a, i))}
              <div style={s.row}>
                <select onChange={(e) => setAddType(e.target.value)} style={{ ...s.input, flex: 1 }} value={addType}>
                  {groupedDefs().map(([cat, defs]) => (
                    <optgroup key={cat} label={cat}>
                      {defs.map((d) => (
                        <option key={d.type} value={d.type}>{d.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button onClick={addAction} style={s.btnPrimary}>+ Add action</button>
                <button onClick={() => onRun(selected.id)} style={s.btn}>Test run</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={s.label}>Import / export box</label>
        <textarea
          onChange={(e) => setIoText(e.target.value)}
          placeholder="Export output or paste macros JSON here, then Import."
          rows={4}
          style={s.input}
          value={ioText}
        />
        <div style={s.small}>Single-character keybinds are ignored while typing. Exact chords only: Ctrl+K never fires during Ctrl+Shift+K.</div>
      </div>
    </div>
  );
}

module.exports = SettingsPanel;
