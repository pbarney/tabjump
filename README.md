# TabJump: Shortcuts for Open Tabs

TabJump lets you use keyboard shortcuts to jump to specific open tabs that you assign to up to nine "jump slots." You can also switch to those tabs via a toolbar popup. It's designed for tabs you're actively working with to speed up your workflow.

TabJump supports **Firefox** and **Chrome/Chromium**. Firefox users can also display slot-number badges in the [Tree Style Tab](https://addons.mozilla.org/firefox/addon/tree-style-tab/) sidebar.

## Features

- Assign any open tab to a numbered slot from **1** through **9**; jump back to it without having to search through your tabs.
- You can set to either **Global** slots (across all browser windows) or **Per-window** slots (each window has its own set of nine).
- Open the toolbar popup to see the tab assignments whicih includes titles, URLs and slot numbers.
- Use popup-specific keyboard shortcuts in the popup to jump, assign or unassign slots.
- Use browser-wide keyboard shortcuts to jump, assign, unassign the current tab and for opening the popup (see "Keyboard suggested defaults" below for default assignments).
- In Firefox, assign and unassign tabs from the tab context menu and optionally show Tree Style Tab badges for a good visual reminder.
- Optionally show toolbar badge feedback and desktop notifications.

## Getting started

1. Install TabJump in Firefox, or load the Chrome/Chromium build as an unpacked extension (instructions below).
2. Open a tab you want to return to and click the **TabJump toolbar button**.
3. Click an empty slot's **+** button, or press **A**, then **1–9**, while the popup is open.
4. To return to the assigned tab, open the popup and press its slot number **1–9** (or click anywhere in that slot's main area).
5. Open **Options** to choose Global or Per-window slots and configure feedback or Firefox/TST integration.

### Fast popup workflow

| While the popup is open | Action |
| --- | --- |
| `1`–`9` | Jump to the tab assigned to that slot |
| `A`, then `1`–`9` | Assign the current tab to a slot |
| `U`, then `1`–`9` | Unassign a slot |
| `U`, then `0` | Unassign the current tab |
| `H` | Toggle Help/Back |
| `O` | Open Options |

The shared slot list shows a **+** button for an empty slot and an **×** button for an occupied slot. Click an occupied slot's main area to jump; empty slot main areas do nothing, so use **+** to assign. Its **Clear All** button clears the global set in Global mode or the **current window's** set in Per-window mode.

## Global and Per-window slots

In **Global** mode, there is one set of slots 1–9 shared by all browser windows. A jump can activate a tab in another window.

In **Per-window** mode, each browser window has its own independent set of slots 1–9. Popup and keyboard commands operate on the relevant window's slots. You can use Slot 1 for different tabs in two different windows.

If you change the settings to switch between modes, just be aware of what will happen to your existing jump slot assignments:
- Switching from **Global to Per-window:** Your existing assignments will now be handled by each individual window. Slot numbers will not change. 
- Switching from **Per-window to Global:** If only one window has assignments, those assignments will not change. But if multiple windows have assignments, TabJump will ask you which window's assignments to keep; assignments from the other windows are cleared.
- **Moving an assigned tab between windows:** The tab retains its slot number. If that number already exists in the destination window, it will be removed from the old tab and the moved tab takes the slot.

Only one tab can occupy a particular slot within its scope (Global or Per-window), and a tab can have only one slot assignment.

## Browser-wide keyboard shortcuts

Unlike the popup-local keys above, these commands work without first opening the popup **when the browser has assigned the corresponding shortcut**. Shortcut availability varies based on your browser, operating system and other extensions. Firefox has all shortcuts assigned by default, but Chrome only allows a couple example assignments.

### Firefox defaults

| Action | Windows/default | Linux | macOS |
| --- | --- | --- | --- |
| Open TabJump popup | `Alt+J` | `Alt+J` | `MacCtrl+J` |
| Open TabJump sidebar | `Alt+Shift+J` | `Alt+Shift+J` | `MacCtrl+Shift+J` |
| Jump to Slot 1–9 | `Alt+1` … `Alt+9` | `Ctrl+1` … `Ctrl+9` | `MacCtrl+1` … `MacCtrl+9` |
| Assign current tab to Slot 1–9 | `Alt+Shift+1` … `Alt+Shift+9` | `Ctrl+Shift+1` … `Ctrl+Shift+9` | `MacCtrl+Shift+1` … `MacCtrl+Shift+9` |
| Unassign current tab | `Alt+Shift+0` | `Ctrl+Shift+0` | `MacCtrl+Shift+0` |

These are *suggested* defaults, but your particular configuration will affect this. Use **`Options → Manage Extension Shortcuts`** if a combination has conflicts or is unassigned.

### Chrome/Chromium

Chromium suggests four shortcuts: **Open Popup** (`Alt+J`), **Open Sidebar** (`Alt+Shift+J`), **Jump to Slot 1** (`Alt+1`), and **Assign Slot 1** (`Alt+Shift+1`). On macOS these use `MacCtrl` instead of `Alt`. The **Unassign Current Tab** command remains available but has no suggested shortcut. Assign other slot shortcuts manually in `chrome://extensions/shortcuts`. The popup's local keyboard workflow works without configuring browser-wide shortcuts. A dismissible shortcut-setup notice appears in the Chromium popup until you open shortcut settings or choose **Don't show again**.

## Options

- **Slot Scope:** Choose Global across all windows or Per-window slots.
- **Manage Extension Shortcuts:** Open the browser's shortcut-assignment interface.
- **Open Popup as Tab:** Open the popup in a normal extension tab, useful for testing or inspecting it without having the popup close on focus changes.
- **Tree Style Tab Badges (Firefox only):** Show or hide numbered badges in TST.
- **Toolbar feedback:** Briefly flash slot feedback on the TabJump toolbar icon.
- **Desktop notifications:** Enable or disable operating-system notifications when assignments change (off by default in Firefox, on by default in Chromium).
- **Clear All Jump Slots:** Clear all assignments across the browser, including every window in Per-window mode.

## Installation and local testing

### Firefox

**For normal use**, install the published extension from Firefox Add-ons (AMO) and you're good to go.

But if you want to test or edit the source code locally:

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select the repository-root `manifest.json`, or the `manifest.json` in `dist/firefox` after building.

### Chrome/Chromium

1. Run the build command below to generate `dist/chrome`.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked**, then select `dist/chrome`.
4. Open `chrome://extensions/shortcuts` if you want to configure browser-wide slot shortcuts.

Firefox has a tab context menu (right-click on the tab) for accessing TabJump. The Chrome/Chromium build mainly uses the toolbar popup and browser-wide shortcut keys, with shortcut settings available from the extension action menu.

## Slot assignment limitations

All slot assignments are **temporary**: If you close a tab, its assignment will be removed. If you restart the browser, your assignments will be cleared. Remember, the slot assignments are meant to be fluid and changing according to whatever you're working on at the moment; they're not intended to be long-term, permanent assignments.

TabJump doesn't inject shortcut handlers into websites or modify websites in any way. Tree Style Tab badges are optional and available only in Firefox with Tree Style Tab, but they are totally worth it and improve the experience considerably.

## Sidebar

The popup and sidebar now use one shared slot-row interface. Both show the tab title
and shortened URL, with compact **+** (assign) and **×** (unassign) buttons.
Use **Show shortcut keys** to switch the slot badges from numbers to the
configured jump shortcuts (assigned slots) or assign shortcuts (empty slots).
If a shortcut is not configured, its badge says **No key**. This preference is
shared between the popup and sidebar and persists across sessions.

Version 0.3.0 adds an optional persistent sidebar, bringing a visual indicator to browsers that don't (or can't) use Tree Style Tab. Open it using **Sidebar** in the toolbar popup, `Alt+Shift+J` (or `MacCtrl+Shift+J` on macOS), or **Open TabJump Sidebar** from the toolbar icon's right-click menu. The sidebar's **Shortcuts** button opens the browser's extension shortcut settings. The sidebar shows Global slots (across all windows) or Per-window slots (within the current window) depending on which mode you've selected in the options. It stays visible across tab switches, lets you jump or unassign, and updates when assignments change.

If you use TST in Firefox, you cannot have both the TST side bar and the TabJump sidebar at the same time. You'll have to choose which one you want.

## Development

The repository contains one shared source tree with browser-specific manifests:

- **Firefox:** Manifest V2, using the root `manifest.json`.
- **Chrome/Chromium:** Manifest V3, using `manifest.chrome.json`.
- **`platform.js`:** Compatibility helpers for differences in browser extension APIs.
- **`background.js`:** Slot management, commands, context menus, browser events, and TST integration.
- **`popup.*` / `options.*` / `style.css`:** User interface and shared styling.

Run from the repository root:

```sh
npm run build
```

This generates `dist/firefox` and `dist/chrome`. These folders are just **build outputs**, so don't modify them; they're only meant to be loaded into your browser. If you want to edit code, edit the root source files and rebuild.

If you intend to fork the repo and submit your own version to Mozilla Addons, you'll need to run `web-ext lint` against `dist/firefox`, then test the built extension before submitting to AMO.

`web-ext` lint may complain about minimum versions for Android. You can ignore this as TabJump is not an Android extension.

## Support, roadmap, and license

- [Report bugs or request features](https://github.com/pbarney/tabjump/issues)
- [Changelog](CHANGELOG)
- [Roadmap](ROADMAP.md)
- [MIT License](LICENSE)
