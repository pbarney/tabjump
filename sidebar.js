/*
 * Persistent TabJump sidebar.
 * Each sidebar belongs to its own browser window. The background owns slots.
 */
let sidebarWindowId = null;
let refreshRunning = false;
let refreshQueued = false;
let sidebarState = null;
let showShortcutKeys = false;

const sidebarSlots = document.getElementById("sidebar-slots");
const sidebarStatus = document.getElementById("sidebar-status");
const sidebarScopeLabel = document.getElementById("scope-label");
const showKeysCheckbox = document.getElementById("show-keys");

function sidebarMessage(type, extra = {}) {
  return browser.runtime.sendMessage({ type, ...extra });
}

function showSidebarStatus(text) {
  sidebarStatus.textContent = text;
}

function renderSidebar(state) {
  sidebarState = state;
  sidebarScopeLabel.textContent = state.slotScope === "per-window"
    ? "Per-window"
    : "Global";

  TabJumpSlotList.render(sidebarSlots, state.slotViews, {
    showShortcutKeys,

    // The title is already visible; the jump badge's tooltip shows the URL.
    getJumpTooltip: slotView => slotView.url || "Jump to Slot " + slotView.slot,

    onJump: async slot => {
      try {
        const ok = await sidebarMessage("jump-slot-from-sidebar", {
          slot,
          windowId: sidebarWindowId
        });
        if (!ok)
          showSidebarStatus("Slot " + slot + " is unavailable.");
        await requestSidebarRefresh();
      } catch (error) {
        console.error("Sidebar jump failed:", error);
        showSidebarStatus("Could not jump to Slot " + slot + ".");
      }
    },

    // Always target the active tab in the window containing this sidebar.
    onAssign: async slot => {
      try {
        await sidebarMessage("assign-slot-from-sidebar", {
          slot,
          windowId: sidebarWindowId
        });
        await requestSidebarRefresh();
      } catch (error) {
        console.error("Sidebar assignment failed:", error);
        showSidebarStatus("Could not assign Slot " + slot + ".");
      }
    },

    onUnassign: async slot => {
      try {
        await sidebarMessage("unassign-slot-from-sidebar", {
          slot,
          windowId: sidebarWindowId
        });
        await requestSidebarRefresh();
      } catch (error) {
        console.error("Sidebar unassign failed:", error);
        showSidebarStatus("Could not unassign Slot " + slot + ".");
      }
    }
  });
}

async function requestSidebarRefresh() {
  refreshQueued = true;
  if (refreshRunning || sidebarWindowId == null)
    return;

  refreshRunning = true;
  try {
    do {
      refreshQueued = false;
      const state = await sidebarMessage("get-sidebar-state", {
        windowId: sidebarWindowId
      });
      renderSidebar(state);
    } while (refreshQueued);

    showSidebarStatus("");
  } catch (error) {
    console.error("Could not refresh TabJump sidebar:", error);
    showSidebarStatus("Could not load jump slots.");
  } finally {
    refreshRunning = false;
  }
}

async function initSidebar() {
  const win = await browser.windows.getCurrent();
  if (!Number.isInteger(win?.id))
    throw new Error("The sidebar could not identify its browser window.");

  sidebarWindowId = win.id;

  const saved = await browser.storage.local.get("showShortcutKeys");
  showShortcutKeys = saved.showShortcutKeys === true;
  showKeysCheckbox.checked = showShortcutKeys;

  showKeysCheckbox.addEventListener("change", () => {
    showShortcutKeys = showKeysCheckbox.checked;
    if (sidebarState)
      renderSidebar(sidebarState);

    browser.storage.local.set({ showShortcutKeys }).catch(error => {
      console.error("Could not save shortcut display preference:", error);
      showSidebarStatus("Could not save shortcut display preference.");
    });
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local")
      return;

    if ("showShortcutKeys" in changes) {
      showShortcutKeys = changes.showShortcutKeys.newValue === true;
      showKeysCheckbox.checked = showShortcutKeys;
      if (sidebarState)
        renderSidebar(sidebarState);
    }

    if (["slots", "windowSlots", "options"].some(key => key in changes))
      requestSidebarRefresh();
  });

  browser.tabs.onActivated.addListener(({ windowId }) => {
    if (windowId === sidebarWindowId)
      requestSidebarRefresh();
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab?.windowId === sidebarWindowId && changeInfo.title !== undefined)
      requestSidebarRefresh();
  });

  document.getElementById("open-options").addEventListener("click", () => {
    browser.runtime.openOptionsPage().catch(error => {
      console.error("Could not open options:", error);
      showSidebarStatus("Could not open options.");
    });
  });

  await requestSidebarRefresh();
}

initSidebar().catch(error => {
  console.error("Sidebar initialization failed:", error);
  showSidebarStatus("Could not initialize TabJump sidebar.");
});
