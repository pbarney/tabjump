# TabJump: Shortcuts for Open Tabs

Development v0.1.1.

Assign temporary jump keys to open tabs so you can quickly move between them while you work. Tree Style Tab users can also show compact Jump Slot badges in the TST sidebar.

## v1 scope

Implemented:

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
  - badge style selector
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


## Popup development

For real extension state, open the options page and click **Open Popup as Tab**. This opens `popup.html` as a normal extension tab, so it does not disappear when DevTools focus changes.

For pure CSS/layout mocking outside the extension runtime, open `popup-dev.html` directly. It loads `mock-browser.js`, which provides mock slot data including long URLs.
