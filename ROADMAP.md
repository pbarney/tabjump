# Roadmap Notes

## Per-window slot scope

Potential behavior:

- Each window gets its own Slot 1-9 map.
- When a tab moves to another window, the moved tab keeps its slot assignment.
- If the target window already has that slot assigned, the moved tab takes over the slot and the previous target-window tab is unassigned.
- Notification text: `Slot 3 reassigned to moved tab.`

## Multi-key chord assignment

Potential behavior:

- A global "assignment prefix" command begins a short-lived assignment mode.
- The next digit assigns the current tab to that slot.
- This likely requires an extension page/popup/sidebar focus model or a page-level capture mode, so it is not included in v1.

## Non-TST title marker mode

Potential advanced compatibility feature:

- Disabled by default.
- Content script modifies `document.title` with a slot marker.
- `MutationObserver` reapplies the marker if the page changes the title.
- Requires host/page permissions and can affect history/bookmarks/window titles, so this should remain optional.


## Badge labels based on assigned shortcuts

Potential advanced option:

- TST badges currently show slot numbers `1` through `9`.
- A future version may display the primary assigned key instead, if the user reconfigures slots away from number-row shortcuts.
- This requires shortcut parsing and a decision about which part of a compound shortcut is badge-worthy.
