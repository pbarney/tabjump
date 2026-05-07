# Tab Hotkeys & Shortcuts

Development v0.1.0.

Assign numbered keyboard shortcuts to open tabs and jump to them instantly. Tree Style Tab users can also show compact Jump Slot badges in the TST sidebar.

## v1 scope

Implemented:

- Global Jump Slots `0` through `9`
- Jump commands:
  - Windows/default: `Alt+0` through `Alt+9`
  - Linux: `Ctrl+0` through `Ctrl+9`
  - macOS: `MacCtrl+0` through `MacCtrl+9`
- Assignment commands:
  - Windows/default: `Alt+Shift+0` through `Alt+Shift+9`
  - Linux: `Ctrl+Shift+0` through `Ctrl+Shift+9`
  - macOS: `MacCtrl+Shift+0` through `MacCtrl+Shift+9`
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
