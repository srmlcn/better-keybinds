# KeybindMacros (BetterDiscord plugin)

Custom keybind macros for Discord. Flagship use: flip speaker volume 50% ↔ 100% with a keypress. Fully fledged: each macro binds one chord to an ordered list of actions — volume, mute/deafen, channel jumps, messages, toasts, waits, URLs.

Installable file: `dist/KeybindMacros.plugin.js` (single file, no dependencies).

## Install

1. Install [BetterDiscord](https://betterdiscord.app).
2. Copy `dist/KeybindMacros.plugin.js` into the BetterDiscord plugins folder (Discord Settings → BetterDiscord → Plugins → Open Plugin Folder).
3. Enable **KeybindMacros** in the plugin list.
4. Open its Settings and assign keybinds — starter macros ship with none assigned.

## Quick start

1. Settings → KeybindMacros → select **Speaker 50/100 toggle** → **Record** → press e.g. `Ctrl+Shift+U` → release.
2. Tick **Global** if you want it to fire while Discord is unfocused.
3. Press the chord: output flips 50 → 100 → 50. A toast confirms each run.

## Actions

| Category | Action | Notes |
|---|---|---|
| Output volume | Set / Adjust / Toggle | Toggle flips between levels A and B (nearest wins); default 50/100 |
| Input volume | Set / Adjust | Mic level, same 0–100 scale |
| Self voice | Toggle/Set mute, Toggle/Set deafen, Disconnect | Set is a no-op when already in that state |
| Channels | Go to channel | Needs Guild + Channel ID (Developer Mode → Copy ID) |
| Messages | Send message | Current channel, or a saved channel ID |
| Utility | Toast, Wait, Open URL | Wait pauses the chain; URLs must be http(s) |

Macro runs are sequential. A failed non-utility action aborts the rest; utility failures don't.

## Keybind behavior

- **In-app**: fires when Discord is focused. Always available.
- **Global**: also fires while Discord is unfocused. Requires Discord's native shortcut module; the settings header shows **Global OK** or **In-app only**.
- Chords match exactly: `Ctrl+K` never fires during `Ctrl+Shift+K`.
- Single-character binds are ignored while typing in inputs.
- Duplicate chords across enabled macros raise a conflict warning in settings.
- Recording a keybind captures keys instead of triggering macros.

## Import / export

Settings bottom box: **Export** dumps JSON, paste JSON then **Import (append/replace)**. Unknown future action types are preserved with a warning.

## Development

```bash
npm install
npm test          # node:test unit suite
npm run build     # -> dist/KeybindMacros.plugin.js
npm run watch     # rebuild on change
```

Layout: `src/index.js` (plugin entry) · `src/lib/discord.js` (webpack bridge) · `src/lib/keybinds.js` · `src/lib/registrations.js` (in-app + global engine) · `src/lib/store.js` (presets, persistence, import/export) · `src/lib/actions.js` (registry + executors) · `src/ui/SettingsPanel.jsx` (editor, native controls + `BdApi.React` only).

To change author/update URL, edit `src/meta.js` and rebuild.

## Troubleshooting

- **Volume/mute action fails after a Discord update**: Discord renames internals regularly. The plugin reports which action failed instead of crashing; usually a bridge update restores it. Check console (`Ctrl+Shift+I`) for `[KeybindMacros]` lines.
- **Global shows In-app only**: native module blocked or unsupported client — in-app still works. Re-check after Discord restart.
- **Global chord does nothing on Linux/Mac**: platform keycodes come from Discord's key map with a Windows fallback; some keys may not resolve and are reported in settings.
- **Macro doesn't fire**: macro enabled? Keybind assigned? No conflict? Single letters don't fire while typing.
- Console access: the running instance is exposed as `globalThis.KeybindMacros`.

## Notes

- Overlay toggle was deliberately omitted from v1: no verified Discord internal for it. Candidate for a later release.
- BetterDiscord is third-party software that modifies the Discord client, which Discord does not support. Use at your own risk.

## License

MIT — see [LICENSE](LICENSE).
