# TabJump: Shortcuts for Open Tabs

Development v0.1.5.

Assign temporary jump keys to open tabs so you can quickly move between them while you work. Tree Style Tab users can also show compact Jump Slot badges in the TST sidebar.

## v1 scope

Implemented:

- In-popup help screen with default shortcut reference
- Global Jump Slots `1` through `9`
- Jump commands:
  - Windows/default: `Alt+1` through `Alt+9`
  - Linux: `Ctrl+1` through `Ctrl+9`
  - macOS: `MacCtrl+1` through `MacCtrl+9`
- Assignment commands:
  - Windows/default: `Alt+Shift+1` through `Alt+Shift+9`
  - Linux: `Ctrl+Shift+1` through `Ctrl+Shift+9`
  - macOS: `MacCtrl+Shift+1` through `MacCtrl+Shift+9`
- Toolbar popup fallback
- Tab context-menu fallback
- Options page with:
  - Firefox shortcut settings button
  - TST badge toggle
  - toolbar-icon feedback toggle
- Optional Tree Style Tab badges via TST Extra Tab Contents API
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
3. Choose `manifest.json` from this folder.
4. Open several tabs.
5. Use the toolbar popup or tab context menu to assign slots.
6. Try the keyboard shortcuts.
7. If shortcuts do not fire, open **Manage Extension Shortcuts** from the options page and adjust them.

## Notes

Firefox controls final shortcut assignment. Some shortcut defaults may be unavailable if Firefox, the OS/window manager, or another add-on has already taken them.

Tree Style Tab integration is optional. If TST is not installed or its sidebar is not visible, the extension still works through commands, the toolbar popup, and tab context menus.

### Firefox attached-popup dark-mode behavior

When `popup.html` is opened as a normal extension tab (via the Options page), Firefox's color scheme can be detected and the popup will render according to the light mode/dark mode setting.

But when the same page is opened as an attached extension popup (e.g., from Alt-J), Firefox only reports `prefers-color-scheme: light` even when a dark theme is being used. TabJump does not force its own light/dark appearance setting. The popup still uses system colors where it can, but we have avoided adding any separate extension-specific theme layer.

## Popup development

For real extension state, open the options page and click **Open Popup as Tab**. This opens `popup.html` as a normal extension tab, so it does not disappear when DevTools focus changes.


## v0.1.3 changes

- Removed configurable Unicode badge styles.
- TST badges now render standard slot digits using CSS-controlled circular badge styling.
- Options page no longer exposes badge style configuration.
- Popup continues to consume a background-owned slot view model.


## v0.1.4 changes

- Added in-popup Help view.
- Added Help button beside Options.
- Added Back button from Help to Jump Slots.
- Added static default shortcut reference text.
- Added always-visible “Manage Extension Shortcuts” button in Help.
- Added simple warning if current command shortcuts differ from known defaults.
- Added `_execute_browser_action` command with `Alt+J` / `MacCtrl+J` defaults.
- Updated Options button so it opens options and closes the popup.
- Removed the visible refresh-badges button/listener from the options UI.
- Disabling TST badges now clears existing badges immediately.


## v0.1.5 changes

- CSS improvements and layout changes for popup
- Includes OS-specific help shortcut text.
- Header Help button becomes Back while viewing help.
- Shortcut key combinations in help are wrapped to prevent awkward line breaks.
- Documented Firefox attached-popup dark-mode behavior.
- Removed `popup-dev.html` and `mock-browser.js` from the documented development workflow.

## v0.1.6 changes

- Transparent-background icon.
- Removed `popup-dev.html` and `mock-browser.js`.
- Slot number badge in the popup now acts as the Jump button.
- Popup Assign button now becomes Unassign when a slot is already assigned.
- Popup digit keys `1` through `9` jump to the assigned slot and close the popup.
- Added keyboard command for unassigning the current tab:
  - Windows/default: `Alt+Shift+0`
  - Linux: `Ctrl+Shift+0`
  - macOS: `MacCtrl+Shift+0`
- Renamed toolbar badge feedback option to “Briefly flash tab assignments on the TabJump toolbar icon.”
- Removed multi-key chord assignment from the roadmap.

