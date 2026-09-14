# Better Keybinds (BetterDiscord plugin)

Discord-style keybinds for things Discord doesn't bind: speaker volume 50% ↔ 100% toggle, mute/deafen, channel jumps, messages, toasts, URLs. Each row picks an action from a dropdown, sets its options, and records a chord.

Installable file: `dist/BetterKeybinds.plugin.js` (single file, no dependencies).

## Install

1. Install [BetterDiscord](https://betterdiscord.app).
2. If you used the previous `KeybindMacros.plugin.js`, delete it from the plugins folder first (this release renames the plugin and starts fresh).
3. Copy `dist/BetterKeybinds.plugin.js` into the BetterDiscord plugins folder (Discord Settings → BetterDiscord → Plugins → Open Plugin Folder).
4. Enable **BetterKeybinds** in the plugin list.
5. Open its Settings → **Add keybind** → pick an action → click the keybind button → press your chord → release.

## Quick start

1. **Add keybind** (defaults to Toggle output volume 50/100).
2. Click the keybind button, press e.g. `Ctrl+Shift+U`, release.
3. Tick **Global** to fire while Discord is unfocused.
4. Press the chord: a toast shows the verified result, e.g. `Output volume 50% -> 100%`.

## Actions

| Category | Action | Notes |
|---|---|---|
| Output volume | Set / Adjust / Toggle | Toggle flips between levels A and B; default 50/100 |
| Input volume | Set / Adjust | Mic level, same 0–100 scale |
| Self voice | Toggle/Set mute, Toggle/Set deafen, Disconnect | Set is a no-op when already in that state |
| Streaming | Toggle game, Toggle screen, Stop | Streams to your current voice channel |
| Channels | Go to channel | Needs Guild + Channel ID (Developer Mode → Copy ID) |
| Messages | Send message | Current channel, or a saved channel ID |
| Utility | Toast, Open URL | Toast is handy for testing that a chord fires |

## Keybind behavior

- **In-app**: fires when Discord is focused. Always available.
- **Global**: also fires while Discord is unfocused. Requires Discord's native shortcut module; the settings header shows **Global OK** or **In-app only**.
- Chords match exactly: `Ctrl+K` never fires during `Ctrl+Shift+K`.
- Single-character binds are ignored while typing in inputs.
- Duplicate chords across enabled binds raise a conflict warning in settings.
- Esc cancels recording; ✕ clears a chord.

## Volume and the Discord settings slider

Binds use Discord's **slider percent** (what Voice & Video shows), not the raw store number. Discord's UI is perceptual (50 dB below 100%, 6 dB boost above). The audio engine stores linear amplitude, so 40 on the store is about 84% on the slider. The plugin converts both ways so "set 50" lands on 50% in Discord.

Every volume write is verified by reading the value back from Discord's own audio store, and the toast reports ground truth. Writes use Discord's own voice-action setters first, then Flux, then the store directly:

- `Speaker volume 50% → 100%` — applied and confirmed.
- `Speaker volume didn't change — still 50%` — Discord rejected or ignored the write; the bind genuinely did not work.
- `... (couldn't confirm)` — write sent but the value couldn't be read back.

When Discord's volume store isn't readable, the plugin tracks the last value it set, so toggle and adjust binds keep working across presses. Tracking resets on reload (the first toggle press then sets level B). If you change volume in Discord's own settings, the next toggle press resyncs within one hop.

Discord's Settings → Voice & Video slider does not always repaint while open; close and reopen Settings to see the new position. The toast value is authoritative, not the slider.

## Streaming

The Streaming actions Go Live in your current voice channel and reuse Discord's own streaming controls, so quality/sound defaults match the normal Go Live button. Requirements:

- You're in a voice channel (server or DM call).
- For **Toggle game stream**: Discord detects your game. Detection comes from Settings → **Game Activity** — if your game isn't listed there as "Now playing", start the game first, or add it manually in Game Activity.
- The game window isn't minimized (minimized windows often disappear from capture sources).

Behavior:

- **Toggle game stream** picks your foreground game, or the most recently focused running game, and streams that window — no picker. Press again to stop.
- **Toggle screen stream** streams your primary screen. Press again to stop.
- **Stop streaming** ends your stream; it's a no-op when you're not live.

Every stream start/stop is verified against Discord's live stream state before the toast reports success. Toggling while already live stops the current stream (game or screen).

## Import / export

Under the **Import / export / reset** dropdown in settings: **Export** dumps JSON, paste JSON then **Import (append/replace)**. Unknown future action types are preserved with a warning.

## Development

```bash
npm install
npm test          # node:test unit suite
npm run build     # -> dist/BetterKeybinds.plugin.js
npm run watch     # rebuild on change
```

Layout: `src/index.js` (plugin entry) · `src/lib/discord.js` (webpack bridge) · `src/lib/keybinds.js` · `src/lib/registrations.js` (in-app + global engine) · `src/lib/store.js` (persistence, import/export) · `src/lib/actions.js` (registry + executors) · `src/ui/SettingsPanel.jsx` (editor, native controls + `BdApi.React` only).

To change author/update URL, edit `src/meta.js` and rebuild.

## Debugging

Yes — three layers, easiest first:

1. **In-plugin diagnostics** (this plugin's Settings → Diagnostics): module status dots (Flux, MediaEngine, Voice, …), live output/input readings, a scrolling debug log, and **Copy diagnostics** for sharing. Every bind run and volume write is logged with its verified result.
2. **Discord console**: Settings → BetterDiscord → Developer → enable **DevTools**, then `Ctrl+Shift+I` (`Cmd+Opt+I` on Mac). `[BetterKeybinds]` lines mirror the in-plugin log (disable with "Debug logging to console"). Useful probes:
   - `BetterKeybinds.discord.getOutputVolume()` — current speaker value
   - `BetterKeybinds.discord.probeSummary()` — one-line module status
   - `BetterKeybinds.discord.pickGame()` — detected game for streaming
   - `BetterKeybinds.discord.getSelfStream()` — your active stream, if any
   - `BetterKeybinds.runBindById("b_…", "console")` — run a bind by ID
3. **Debug log file**: Settings → BetterDiscord → Developer → **Debug Logs** writes all console output to `debug.log` in the BetterDiscord folder (`%appdata%/BetterDiscord` on Windows, `~/.config/BetterDiscord` on Linux). Turn off when done — it grows fast.

If volume "doesn't change", check in order: toast message (success/stuck/unavailable?) → Diagnostics dots (MediaEngine found? methods count?) → debug log (which write path was used?) → console for red errors.

If MediaEngine shows MISSING while you're in voice, hit **Deep scan**: it sweeps every loaded module for audio-related APIs and logs each candidate's shape, which identifies the real method names. Then **Copy diagnostics** and share the result.

## Troubleshooting

- **"Didn't change" toast**: Discord ignored the write. Try reopening Discord; if it persists after a Discord update, the audio internals likely moved and the bridge needs an update.
- **"Couldn't reach" toast**: Discord renamed internals. Check console (`Ctrl+Shift+I`) for `[BetterKeybinds]` lines.
- **Global shows In-app only**: native module blocked or unsupported client — in-app still works. Re-check after Discord restart.
- **Global chord does nothing on Linux/Mac**: platform keycodes come from Discord's key map with a Windows fallback; unresolvable keys are reported.
- **"No game detected" toast**: Discord doesn't see a running game. Check Settings → Game Activity for "Now playing"; add the game manually if needed.
- **"Couldn't find a window" toast**: the game was detected but has no capture source. Unminimize/restore the game window and retry.
- **"Couldn't reach screen capture" toast**: Discord's capture enumerator rejected the call. Reload Discord (Ctrl+R) and retry; if it persists, Copy diagnostics.
- **Bind doesn't fire**: bind enabled? Chord assigned? No conflict? Single letters don't fire while typing.
- Console access: the running instance is exposed as `globalThis.BetterKeybinds`.

## Notes

- Overlay toggle is omitted: no verified Discord internal for it.
- BetterDiscord is third-party software that modifies the Discord client, which Discord does not support. Use at your own risk.

## License

MIT — see [LICENSE](LICENSE).
