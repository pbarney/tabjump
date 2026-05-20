let state = null;
let statusTimer = null;

function send(type, extra = {}) {
  return browser.runtime.sendMessage({ type, ...extra });
}

function setStatus(message) {
  const el = document.getElementById("status");
  el.textContent = message;

  if (statusTimer)
    clearTimeout(statusTimer);

  statusTimer = setTimeout(() => {
    el.textContent = "";
  }, 2200);
}

function readOptionsFromForm() {
  return {
    slotScope: document.querySelector('input[name="slot-scope"]:checked')?.value || "global",
    showTstBadges: document.getElementById("show-tst-badges").checked,
    showActionBadgeFeedback: document.getElementById("show-action-badge-feedback").checked,
    showDesktopNotifications: document.getElementById("show-desktop-notifications").checked
  };
}
  
async function saveOptions() {
  const options = readOptionsFromForm();
  state.options = await send("save-options", { options });
  setStatus("Options saved.");
}

function hydrateForm() {
  const options = state.options;
  const environment = state.environment || {};

  document.querySelector('input[name="slot-scope"][value="global"]').checked = true;
  document.getElementById("show-tst-badges").checked = Boolean(options.showTstBadges);
  document.getElementById("show-action-badge-feedback").checked = Boolean(options.showActionBadgeFeedback);
  document.getElementById("show-desktop-notifications").checked = Boolean(options.showDesktopNotifications);
  
  const shortcutNote = document.getElementById("shortcut-manager-note");
  if (shortcutNote) {
    shortcutNote.textContent = environment.supportsDefaultSlotShortcuts
      ? "Firefox manages the actual keyboard shortcuts for this extension."
      : "Chrome/Chromium can only preassign a limited number of shortcut defaults. Use the shortcut settings page to assign slot shortcuts.";
  }

  const tstSection = document.getElementById("tst-badges-section");
  if (tstSection)
    tstSection.hidden = !environment.supportsTstBadges;
}

async function load() {
  state = await send("get-state");
  hydrateForm();
}

for (const id of [
  "show-tst-badges", 
  "show-action-badge-feedback",
  "show-desktop-notifications"
]) {
  document.getElementById(id).addEventListener("change", () => {
    saveOptions().catch(error => {
      console.error(error);
      setStatus("Could not save options.");
    });
  });
}

document.getElementById("manage-shortcuts").addEventListener("click", async () => {
  try {
    await send("open-shortcut-settings");
  } catch (error) {
    console.error(error);
    setStatus("Could not open shortcut settings.");
  }
});

document.getElementById("open-popup-tab").addEventListener("click", async () => {
  try {
    await browser.tabs.create({ url: browser.runtime.getURL("popup.html?dev=tab") });
  } catch (error) {
    console.error(error);
    setStatus("Could not open popup tab.");
  }
});

document.getElementById("clear-all").addEventListener("click", async () => {
  await send("clear-all-slots");
  setStatus("All Jump Slots cleared.");
});

load().catch(error => {
  console.error(error);
  setStatus("Could not load options.");
});
