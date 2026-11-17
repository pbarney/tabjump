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

      // The primary button spans the badge, title and URL.
      // The separate +/- button remains an independent action.
      const main = document.createElement("button");
      main.type = "button";
      main.className = "slot-main";

      const badge = document.createElement("span");
      badge.className = "slot-badge";

      // Show the keyboard shortcut for the action currently available.
      const shortcut = slotView.assigned
        ? slotView.jumpShortcut
        : slotView.assignShortcut;
      badge.textContent = showShortcutKeys ? (shortcut || "No key") : String(slotView.slot);
      badge.classList.toggle("show-keys", showShortcutKeys);

      const mainLabel = slotView.assigned
        ? "Jump to Slot " + slotView.slot + ": " + slotView.title
        : "Assign active tab to Slot " + slotView.slot;
      main.setAttribute("aria-label", mainLabel);
      main.title = slotView.assigned
        ? (getJumpTooltip?.(slotView) || mainLabel)
        : mainLabel;

      main.addEventListener("click", () => {
        const handler = slotView.assigned ? onJump : onAssign;
        if (handler)
          handler(slotView.slot);
      });

      const details = document.createElement("span");
      details.className = "slot-details";

      const title = document.createElement("span");
      title.className = "slot-title";
      title.textContent = slotView.assigned ? slotView.title : "Unassigned";
      details.append(title);

      // The subtitle is always the shortened URL, never shortcut metadata.
      const urlLabel = slotView.assigned ? shortUrl(slotView.url) : "";
      if (urlLabel) {
        const subtitle = document.createElement("span");
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

      main.append(badge, details);
      row.append(main, action);
      container.append(row);
    }
  }

  globalThis.TabJumpSlotList = { render };
}());
