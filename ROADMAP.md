# Roadmap Notes

## Per-window slot scope

Potential behavior:

- Each window gets its own Slot 1-9 map.
- When a tab moves to another window, the moved tab keeps its slot assignment.
- If the target window already has that slot assigned, the moved tab takes over the slot and the previous target-window tab is unassigned.
- Notification text: `Slot 3 reassigned to moved tab.`

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

## Future / possible companion add-on:

TST-only feature to move the current tab, or current tab tree, under the tab assigned to a selected TabJump slot.
Possible shortcut family: Ctrl+Alt+1-9.
Likely better as a separate add-on for users who use both Tree Style Tab and TabJump.



v0.1.6:
  Slot badge becomes the jump button in the popup.
  Allow "assign" button to switch to "unassign" when populated.
  Allow keyboard 1-9 to do a jump (if assigned) and close the popup.
  Allow a keyboard shortcut to unassign the current tab. ((Ctrl/Alt/MacCtrl)+Shift+0 is available on all platforms)
