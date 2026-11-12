/*
 * Persistent TabJump sidebar.
 * Each sidebar belongs to its own browser window. The background owns slots.
 */
let sidebarWindowId = null;
let refreshRunning = false;
let refreshQueued = false;

const sidebarSlots = document.getElementById("sidebar-slots");
const sidebarStatus = document.getElementById("sidebar-status");
const sidebarScopeLabel = document.getElementById("scope-label");

function sidebarMessage(type, extra = {}) {
  return browser.runtime.sendMessage({ type, ...extra });
}

function showSidebarStatus(text) {
  sidebarStatus.textContent = text;
}

function renderSidebar(state) {
  sidebarScopeLabel.textContent = state.slotScope === "per-window"
    ? "Per-window"
    : "Global";
  sidebarSlots.textContent = "";

  for (const slotView of state.slotViews) {
    const row = document.createElement("li");
    row.className = [
      "sidebar-slot",
      slotView.assigned ? "" : "empty",
      slotView.isCurrentTab ? "current" : ""
    ].filter(Boolean).join(" ");

    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "sidebar-jump";
    jump.disabled = !slotView.assigned;
    jump.title = slotView.assigned
      ? `Jump to Slot ${slotView.slot}: ${slotView.title}`
      : `Slot ${slotView.slot} is empty`;
    jump.setAttribute("aria-label", jump.title);

    const number = document.createElement("span");
    number.className = "sidebar-number";
    number.textContent = String(slotView.slot);

    const title = document.createElement("span");
    title.className = "sidebar-title";
    title.textContent = slotView.assigned ? slotView.title : "Unassigned";
    if (slotView.fullTitle)
      title.title = slotView.fullTitle;

    jump.append(number, title);
    jump.addEventListener("click", async () => {
      try {
        const ok = await sidebarMessage("jump-slot-from-sidebar", {
          slot: slotView.slot,
          windowId: sidebarWindowId
        });
        if (!ok)
          showSidebarStatus(`Slot ${slotView.slot} is unavailable.`);
        await requestSidebarRefresh();
      } catch (error) {
        console.error("Sidebar jump failed:", error);
        showSidebarStatus(`Could not jump to Slot ${slotView.slot}.`);
      }
    });
    row.append(jump);

    if (slotView.assigned) {
      const unassign = document.createElement("button");
      unassign.type = "button";
      unassign.className = "sidebar-unassign";
      unassign.textContent = "×";
      unassign.title = `Unassign Slot ${slotView.slot}`;
      unassign.setAttribute("aria-label", unassign.title);
      unassign.addEventListener("click", async () => {
        try {
          await sidebarMessage("unassign-slot-from-sidebar", {
            slot: slotView.slot,
            windowId: sidebarWindowId
          });
          await requestSidebarRefresh();
        } catch (error) {
          console.error("Sidebar unassign failed:", error);
          showSidebarStatus(`Could not unassign Slot ${slotView.slot}.`);
        }
      });
      row.append(unassign);
    }

    sidebarSlots.append(row);
  }
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

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" &&
        ["slots", "windowSlots", "options"].some(key => key in changes))
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
