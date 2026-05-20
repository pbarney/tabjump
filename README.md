# TabJump: Shortcuts for Open Tabs

Development v0.1.7, with a dual-target Firefox/Chrome compatibility pass.

Assign temporary jump keys to open tabs so you can quickly move between them while you work. Tree Style Tab users can also show compact Jump Slot badges in the TST sidebar in the Firefox build.

## Builds

This source tree now supports two browser targets:

- Firefox: Manifest V2, loaded from `manifest.firefox.json` or the root `manifest.json`.
- Chrome/Chromium: Manifest V3, loaded from `manifest.chrome.json` or from the generated `dist/chrome/manifest.json`.

The recommended package layout is one repo with browser-specific build outputs, not separate repos.

## v1 scope

Implemented:

- In-popup help screen with shortcut reference
- Global Jump Slots `1` through `9`
- Jump commands:
  - Firefox defaults: `Alt+1` through `Alt+9` on Windows/default, `Ctrl+1` through `Ctrl+9` on Linux, `MacCtrl+1` through `MacCtrl+9` on macOS
  - Chrome/Chromium: commands are declared, but slot shortcuts should be assigned from the extension shortcut settings page
- Assignment commands:
  - Firefox defaults: `Alt+Shift+1` through `Alt+Shift+9` on Windows/default, `Ctrl+Shift+1` through `Ctrl+Shift+9` on Linux, `MacCtrl+Shift+1` through `MacCtrl+Shift+9` on macOS
  - Chrome/Chromium: commands are declared, but slot shortcuts should be assigned from the extension shortcut settings page
- Unassign-current-tab command:
  - Firefox defaults: `Alt+Shift+0` on Windows/default, `Ctrl+Shift+0` on Linux, `MacCtrl+Shift+0` on macOS
  - Chrome/Chromium: command is declared, but the shortcut should be assigned from the extension shortcut settings page
- Toolbar popup fallback
- Tab context-menu fallback
- Options page with:
  - browser-specific shortcut settings button
  - TST badge toggle in Firefox
  - toolbar-icon feedback toggle
  - desktop notification feedback toggle
- Optional Tree Style Tab badges via TST Extra Tab Contents API in Firefox
- Closed tabs lose their assignment
- Browser startup clears assignments

Not implemented in v1:

- Per-window slot scope
- Multi-key chord assignment
- Non-TST `document.title` mutation
- Page-defined shortcut interception

## Temporary testing in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**
3. Choose `manifest.json` from the Firefox build folder, or choose the root `manifest.json` from this source folder.
4. Open several tabs.
5. Use the toolbar popup or tab context menu to assign slots.
6. Try the keyboard shortcuts.
7. If shortcuts do not fire, open **Manage Extension Shortcuts** from the options page and adjust them.

## Temporary testing in Chrome/Chromium

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Choose the `dist/chrome` folder.
5. Open `chrome://extensions/shortcuts` to assign slot shortcuts.
6. Use the toolbar popup or tab context menu to assign slots.

## Browser-specific notes

Firefox controls final shortcut assignment. Some shortcut defaults may be unavailable if Firefox, the OS/window manager, or another add-on has already taken them.

Chrome/Chromium only gets a default shortcut for opening the toolbar popup. The jump/assign/unassign commands are declared, but most shortcut assignments should be made manually from Chrome's extension shortcuts page.

Tree Style Tab integration is optional and Firefox-only in this build. If TST is not installed or its sidebar is not visible, the Firefox build still works through commands, the toolbar popup, and tab context menus. The Chrome/Chromium build hides the TST badge option.

Desktop notifications depend on browser and operating-system notification settings.

The important extension state is already stored in `storage.local`: `slots` and `options`. Popup UI state, timers, command lists, context menus, and TST badge rendering are derived or temporary and do not need to be persisted.

## Development

### Loading and Building

For Firefox development, you can load the repository root as a temporary add-on.

For release builds:

```sh
npm run build
```

This creates:

- `dist/firefox`
- `dist/chrome`

When developing locally, `manifest.json` is the Firefox manifest source, and `manifest.chrome.json` is the Chrome/Chromium manifest source.

### Popup and Options page development

For real extension state, open the options page and click **Open Popup as Tab**. This opens `popup.html` as a normal extension tab, so it does not disappear when DevTools focus changes.

## v0.1.6 changes

- Transparent-background icon.
- Removed `popup-dev.html` and `mock-browser.js`.
- Slot number badge in the popup now acts as the Jump button.
- Popup Assign button now becomes Unassign when a slot is already assigned.
- Added keyboard command for unassigning the current tab.
- Renamed toolbar badge feedback option to “Briefly flash tab assignments on the TabJump toolbar icon.”
- Added optional desktop notifications for slot assignment/unassignment feedback.
- Desktop notifications default off in Firefox and on in Chrome/Chromium.
- Removed multi-key chord assignment from the roadmap.


## v0.1.7 changes (Chrome/Chromium support added)

- Added `manifest.chrome.json` for Manifest V3.
- Kept `manifest.firefox.json` and the root `manifest.json` for Firefox Manifest V2.
- Added `platform.js` to provide a small browser API compatibility layer.
- Added Chrome-compatible `action` and `contextMenus` support.
- Added browser-specific shortcut settings behavior.
- Kept the short toolbar badge `setTimeout`; it is intentionally not converted to `alarms`.
- Disabled/hid Tree Style Tab badge controls outside the Firefox build.
- Added optional desktop notifications as a more visible Chrome/Chromium feedback channel.
- Avoided rebuilding context menus on every Chrome MV3 service-worker wake.
- Added optional desktop notifications for slot assignment/unassignment feedback.
- Desktop notifications default off in Firefox and on in Chrome/Chromium.
- Added popup-local shortcuts:
  - Popup digit keys `1` to `9` jump to the assigned slot
  - `A` then `1`-`9` to assign,
  - `U` then `1`-`9` to unassign a slot
  - `U` then `0` to unassign the current tab.
  - `H` for Help/Back, `O` for Options
- Highlighted the slot assigned to the current tab in the popup.
