# TabJump Roadmap

## Released

- **v0.2.0:** Global and per-window slot scope, with per-window tab movement and conflict rules.
- **v0.2.0.1:** System dark-mode readability hotfix and documentation updates. The context-menu polish previously planned for v0.2.1 is already part of the released code.

## In development: v0.3.0 — Persistent sidebar

**Goal:** Provide persistent visual feedback for jump-slot assignments without injecting code into websites or replacing the existing popup.

### Milestone 1: Cross-browser foundation (development branch; browser testing required)

- Firefox MV2 `sidebar_action`, not automatically opened at installation.
- Chromium MV3 `side_panel`, window-wide instead of tab-specific (Chrome 116+).
- Existing toolbar popup adds a **Sidebar** button; `Alt+J` remains the popup shortcut. Add a dedicated sidebar shortcut (`Alt+Shift+J` on Windows/Linux, `MacCtrl+Shift+J` on macOS) and toolbar context-menu entry.
- Sidebar shows all nine slots: shared assignments in Global mode, this window's assignments in Per-window mode.
- Assigned tab titles, active-tab highlighting, click-to-jump, and explicit +/- assign/unassign actions; shared popup/sidebar slot UI.
- Storage-change and tab-activation synchronization without polling or host permissions.
- Sidebar shortcut-settings access and a dismissible Chromium shortcut-onboarding notice.
- Build copies `sidebar.html`, `sidebar.js`, and `sidebar.css` into both targets.

### Milestone 2: Testing and hardening

- Automated lifecycle suite: 20/20 tests passed in Firefox and 20/20 in Chromium, covering multiple windows, slot scopes, and tab lifecycle.
- Verify sidebar actions target the window containing the sidebar, not an unrelated focused window.
- Verify live updates after assigning, unassigning, moving, closing, and renaming tabs.
- Verify Chrome MV3 service-worker restarts and panel lifecycle (worker restart/recovery manually confirmed).
- Test Chrome's `sidePanel.open()` user-gesture requirement.
- Verify interaction with Firefox Tree Style Tab, which occupies the Firefox sidebar.
- Test light/dark modes, Windows app-mode combinations, narrow widths, forced colors, keyboard access.
- Run `npm run build`, `web-ext lint` on the Firefox build, and manual browser testing.

### Milestone 3: Release preparation

- Update getting-started documentation, screenshots, README, and changelog.
- Confirm permissions and installation instructions.
- Release v0.3.0 only after both browser targets pass QA.

## Future / Experimental

- **Issue #2 floating panel:** Independent popup / Firefox Mini Window investigation, separate from sidebar. Always-on-top remains a browser API limitation.
- **Persistent assignments after browser restart:** Requires session-safe tab identity rather than stale tab IDs.
- **Favicon indicators and title marker:** Deferred due to site permissions, page changes, and recovery complexity.
- **Alternative TST badge labels:** Potentially display the primary shortcut key instead of slot number.
- **TST companion actions:** Rearrange tab trees using slot targets, potentially as a separate add-on.

## Established constraints

- Root `manifest.json` is Firefox source of truth; `manifest.chrome.json` is the Chromium manifest.
- `dist/` is derived; run `npm run build`.
- Do not reintroduce multi-key global chords, custom theme behavior, or Help/Options access keys.
- Preserve existing popup, global commands, slot assignments, and TST behavior.
- Sidebar needs no host permissions or page injection.
