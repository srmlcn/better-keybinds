# Better Keybinds (BetterDiscord plugin)

Discord-style keybinds for things Discord doesn't bind: speaker volume 50% ↔ 100% toggle, mute/deafen, channel jumps, messages, toasts, URLs. Each row picks an action from a dropdown, sets its options, and records a chord.

Installable file: `dist/BetterKeybinds.plugin.js` (single file, no dependencies).

## Install

1. Install [BetterDiscord](https://betterdiscord.app).
2. If you used the previous `KeybindMacros.plugin.js`, delete it from the plugins folder first (this release renames the plugin and starts fresh).
3. Build the plugin (`npm ci && npm run build`), or use a CI artifact named `BetterKeybinds-plugin`.
4. Copy `dist/BetterKeybinds.plugin.js` into the BetterDiscord plugins folder (Discord Settings → BetterDiscord → Plugins → Open Plugin Folder).
5. Enable **BetterKeybinds** in the plugin list.
6. Open its Settings → **Add keybind** → pick an action → click the keybind button → press your chord → release.

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
| Streaming | Toggle game, Toggle screen, Stop | Game/screen picker on the bind; Auto uses detection / primary display |
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

Binds use Discord's **slider percent** (what Voice & Video shows), not the raw store number. The speaker/mic sliders are cubic in amplitude; Discord's label sits 2 points below a pure cube-root, so the plugin biases the conversion by +2. The 50 dB curve Discord uses for per-user volume does not apply here.

Every volume write is verified by reading the value back from Discord's own audio store, and the toast reports ground truth. Writes use Discord's own voice-action setters first, then Flux, then the store directly:

- `Speaker volume 50% → 100%` — applied and confirmed.
- `Speaker volume didn't change — still 50%` — Discord rejected or ignored the write; the bind genuinely did not work.
- `... (couldn't confirm)` — write sent but the value couldn't be read back.

When Discord's volume store isn't readable, the plugin tracks the last value it set, so toggle and adjust binds keep working across presses. Tracking resets on reload (the first toggle press then sets level B). If you change volume in Discord's own settings, the next toggle press resyncs within one hop.

Discord's Settings → Voice & Video slider does not always repaint while open; close and reopen Settings to see the new position. The toast value is authoritative, not the slider.

## Streaming

The Streaming actions Go Live in your current voice channel and reuse Discord's own streaming controls, so quality/sound defaults match the normal Go Live button. Requirements:

- You're in a voice channel (server or DM call).
- For **Toggle game stream**: Discord's Game Activity list, or a game you pick on that keybind row. If Auto misses, hit **Refresh** and choose the game.
- The game window isn't minimized (minimized windows often disappear from capture sources).
- For **Toggle screen stream**: Auto uses the primary display. If that fails, pick a screen on the keybind row and Refresh.

Behavior:

- **Toggle game stream** streams the selected game, or Auto (foreground / most recently focused). Press again to stop.
- **Toggle screen stream** streams the selected display, or Auto (primary screen, `screen:0`). Press again to stop.
- **Stop streaming** ends your stream; it's a no-op when you're not live.

Every stream start/stop is verified against Discord's live stream state before the toast reports success. Toggling while already live stops the current stream (game or screen).

## Import / export

Under the **Import / export / reset** dropdown in settings: **Export** dumps JSON, paste JSON then **Import (append/replace)**. Unknown future action types are preserved with a warning.

## Development

```bash
npm install
npm run lint      # ESLint
npm test          # node:test unit suite
npm run build     # -> dist/BetterKeybinds.plugin.js
npm run watch     # rebuild on change
```

## CI and release

GitHub Actions (`.github/workflows/ci.yml`) on pull requests and `main`:

| Job | When | What |
|---|---|---|
| **lint** | PR + `main` | ESLint. Pull requests also run commitlint on the PR commit range |
| **test** | PR + `main` | `npm test` |
| **build** | after lint + test | `npm run build`, uploads `BetterKeybinds-plugin` |
| **release** | `main` only | [semantic-release](https://semantic-release.gitbook.io): bump, changelog, rebuild plugin, git tag, GitHub Release |

Version bumps follow Conventional Commits: `feat` → minor, `fix` / `perf` → patch, `BREAKING CHANGE` footer → major. `ci`, `chore`, `docs`, `test`, `refactor`, and `build` do not bump.

The GitHub Release attaches `dist/BetterKeybinds.plugin.js`. Release commits use `[skip ci]` so they do not loop.

Baseline tag is `v2.6.6`. GitHub Actions needs that tag on `main` before the first automated release.

Layout: `src/index.js` (plugin entry) · `src/lib/discord.js` (webpack bridge) · `src/lib/keybinds.js` · `src/lib/registrations.js` (in-app + global engine) · `src/lib/store.js` (persistence, import/export) · `src/lib/actions.js` (registry + executors) · `src/ui/SettingsPanel.jsx` (editor, native controls + `BdApi.React` only).

To change author/update URL, edit `src/meta.js` and rebuild.

## Debugging

Yes — three layers, easiest first:

1. **In-plugin diagnostics** (this plugin's Settings → Diagnostics): module status dots (Flux, MediaEngine, Voice, …), live output/input readings, a scrolling debug log, and **Copy diagnostics** for sharing. Every bind run and volume write is logged with its verified result.
2. **Discord console**: Settings → BetterDiscord → Developer → enable **DevTools**, then `Ctrl+Shift+I` (`Cmd+Opt+I` on Mac). `[BetterKeybinds]` lines mirror the in-plugin log (disable with "Debug logging to console"). Useful probes:
   - `BetterKeybinds.discord.getOutputVolume()` — current speaker value
   - `BetterKeybinds.discord.probeSummary()` — one-line module status
   - `BetterKeybinds.discord.pickGame()` — detected game for streaming
   - `BetterKeybinds.discord.listGames()` — Game Activity candidates for the picker
   - `BetterKeybinds.discord.listScreenSources()` — displays for the screen picker
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
- **"No game detected" toast**: Discord doesn't see a running game. Open the keybind, hit Refresh, and pick the game; or check Settings → Game Activity for "Now playing".
- **"Couldn't find a window" toast**: the game was detected but has no capture source. Unminimize/restore the game window and retry.
- **"Couldn't find your screen" toast**: Auto couldn't classify a display. Open the keybind, hit Refresh, and pick a screen. Default is the primary display (`screen:0`).
- **"Couldn't reach screen capture" toast**: Discord's capture enumerator rejected the call. Reload Discord (Ctrl+R) and retry; if it persists, Copy diagnostics.
- **Bind doesn't fire**: bind enabled? Chord assigned? No conflict? Single letters don't fire while typing.
- Console access: the running instance is exposed as `globalThis.BetterKeybinds`.

## Notes

- Overlay toggle is omitted: no verified Discord internal for it.
- BetterDiscord is third-party software that modifies the Discord client, which Discord does not support. Use at your own risk.

## License

MIT — see [LICENSE](LICENSE).
