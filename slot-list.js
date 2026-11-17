/*
 * Shared presentation-only slot list for the popup and sidebar.
 * Browser actions and storage remain in each view controller.
 */
(function () {
  function shortUrl(url) {
    if (!url)
      return "";

    try {
      const parsed = new URL(url);
      const path = parsed.pathname === "/" ? "" : parsed.pathname;
      return parsed.hostname + path;
    } catch (_) {
      return url;
    }
  }

  function render(container, slotViews, {
    showShortcutKeys = false,
    onJump,
    onAssign,
    onUnassign,
    getJumpTooltip
  } = {}) {
    container.textContent = "";

    for (const slotView of slotViews) {
      const row = document.createElement("li");
      row.className = [
        "slot-row",
        slotView.assigned ? "" : "empty",
        slotView.isCurrentTab ? "current" : ""
      ].filter(Boolean).join(" ");

      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "slot-badge";
      jump.disabled = !slotView.assigned;

      // Display the relevant action's shortcut, not an unrelated fallback key.
      const shortcut = slotView.assigned
        ? slotView.jumpShortcut
        : slotView.assignShortcut;
      jump.textContent = showShortcutKeys ? (shortcut || "No key") : String(slotView.slot);
      jump.classList.toggle("show-keys", showShortcutKeys);

      const jumpLabel = slotView.assigned
        ? "Jump to Slot " + slotView.slot
        : "Slot " + slotView.slot + " is empty";
      jump.setAttribute("aria-label", jumpLabel);
      jump.title = slotView.assigned
        ? (getJumpTooltip?.(slotView) || jumpLabel)
        : jumpLabel;

      jump.addEventListener("click", () => {
        if (onJump)
          onJump(slotView.slot);
      });

      const details = document.createElement("div");
      details.className = "slot-details";

      const title = document.createElement("div");
      title.className = "slot-title";
      title.textContent = slotView.assigned ? slotView.title : "Unassigned";
      if (slotView.assigned)
        title.title = slotView.title;
      details.append(title);

      // The subtitle is always the shortened URL, never shortcut metadata.
      const urlLabel = slotView.assigned ? shortUrl(slotView.url) : "";
      if (urlLabel) {
        const subtitle = document.createElement("div");
        subtitle.className = "slot-subtitle";
        subtitle.textContent = urlLabel;
        details.append(subtitle);
      }

      const action = document.createElement("button");
      action.type = "button";
      action.className = "slot-action";
      action.textContent = slotView.assigned ? "×" : "+";
      action.title = slotView.assigned
        ? "Unassign Slot " + slotView.slot
        : "Assign active tab to Slot " + slotView.slot;
      action.setAttribute("aria-label", action.title);
      action.addEventListener("click", () => {
        const handler = slotView.assigned ? onUnassign : onAssign;
        if (handler)
          handler(slotView.slot);
      });

      row.append(jump, details, action);
      container.append(row);
    }
  }

  globalThis.TabJumpSlotList = { render };
}());
