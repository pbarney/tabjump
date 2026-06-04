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

## Possible TST companion add-on

Potential future idea:

- Move the current tab, or current tab tree, under the tab assigned to a selected TabJump slot.
- Possible shortcut family: `Ctrl+Alt+1` through `Ctrl+Alt+9`.
- This is out of scope for core TabJump and may fit better as a separate add-on for users of both Tree Style Tab and TabJump.


## Questions:

Browser startup clears all assignments:

```
browser.runtime.onStartup.addListener(async () => {
  await clearAllSlots();
});
```

Perhaps it shouldn't?


## Fixes:

I think notifications should only appear when using the global shortcut keys. Menu-assigned keys shouldn't alert.

Fix Chrome tab-dragging behavior which makes tabs lose their jump assignments.


# Planned v0.1.8 features:

1. Per-window slot scope
   - Global vs Per-window remains a user-selectable choice.
   - Each window gets its own Slot 1-9 map.
   - When a tab moves to another window, the moved tab keeps its slot assignment.
   - If the target window already has that slot assigned, the moved tab takes over the slot and the previous target-window tab is unassigned.
   - Notification text: `Slot 3 reassigned to moved tab.`
   - If the user switches the option settings from "Per-Window" to "Global", user will be prompted for which window gets to keep its assignments. All other windows will be cleared.

2. Favicon indicators
   - User-enabled, off-by-default 
   - I'll provide the proof-of-concept, which uses an injected script that both modifies and restores the page favicon.
    - Favicon indicators for non-TST Firefox and Chromium.
      - The proof-of-concept is in tab-badge.js.txt.
      - It is an IIFE that modifies the page favicon and restores with:
        window.__tabJumpFaviconBadge.restore();
      - It works in Firefox; Chromium behavior still needs evaluation.
      - This feature should be user-enabled, probably off by default initially.
      - Prefer careful integration as a content-script/message-based feature, not direct copy/paste of the IIFE.
      - Consider permission impact carefully. Avoid broad host permissions unless explicitly justified.

3. Title marker mode.
   - User-enabled, off-by-default (this can affect history/bookmarks/window titles, so this will be optional).
   - Content script modifies `document.title` with a slot marker prefix (likely a unicode character like "❶", "❷", "❸", "❹", "❺", "❻", "❼", "❽", "❾").
   - `MutationObserver` reapplies the marker if the page changes the title.
   - Requires host/page permissions 



--------------------------------------------------------------------------------
# Mode-Switching Behavior:

## Switching from Global to Per-window:
    Distribute each existing global assignment into the store for the tab’s actual window.
    Each tab keeps the same slot number it had in Global mode.
    No user interaction required, because Global mode cannot have slot conflicts.

## Switching from Per-window to Global:

    If more than one window has assignments, there may be slot conflicts, so we will only accept the assignments made within one single window.
    
    Determine which windows have slot assignments.

    0 windows with assignments:
      Switch to Global with an empty global store. No prompt.

    1 window with assignments:
      Move that window’s assignments into the global store. No user interaction required.

    2+ windows with assignments:
      Prompt the user to choose which window’s assignments to keep.
      Default to the current/last-focused window if it has assignments.
      Otherwise default to the first assigned window in a stable sorted order, such as lowest windowId.
    
    The user must decide on which window keeps its slot assignments, so we will prompt the user.

###   UI:

```
      Switching to Global slots will keep assignments from one window and clear assignments from the others.

      Keep assignments from:
      [ Current window ▼ ]

      Buttons:
      [Switch to Global] [Cancel]
```

    Dropdown rules:
    - The dropdown should list windows that currently have at least one slot assignment. 
    - The current window should be selected by default when it has assignments; 
    - otherwise, select the first window with assignments.
    - Assignments from other windows will be cleared unless the user chooses a different source window.


--------------------------------------------------------------------------------
# Implementation model:

  Store the assignment mode separately:

```
  slotScope: "global" | "per-window"
```

  For global:

```
    slots: {
      "1": { tabId, windowId, ... },
      "2": { tabId, windowId, ... }
    }
```

  For per-window:

```
    windowSlots: {
      [windowId]: {
        "1": { tabId, windowId, ... },
        "2": { tabId, windowId, ... }
      }
    }
```

  When changing modes, run an explicit migration function rather than trying to make one storage shape serve both modes.

