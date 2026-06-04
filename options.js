let state = null;
let statusTimer = null;
let pendingScopeChange = null;

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
    showTstBadges: document.getElementById("show-tst-badges").checked,
    showActionBadgeFeedback: document.getElementById("show-action-badge-feedback").checked,
    showDesktopNotifications: document.getElementById("show-desktop-notifications").checked
  };
}

function setSlotScopeRadio(slotScope) {
  const radio = document.querySelector(`input[name="slot-scope"][value="${slotScope}"]`);
  if (radio)
    radio.checked = true;
}

function hideScopeSwitchConfirm() {
  pendingScopeChange = null;
  const panel = document.getElementById("scope-switch-confirm");
  if (panel)
    panel.hidden = true;
}

function showScopeSwitchConfirm(result) {
  pendingScopeChange = result;

  const panel = document.getElementById("scope-switch-confirm");
  const select = document.getElementById("scope-keep-window");
  select.textContent = "";

  for (const choice of result.choices || []) {
    const option = document.createElement("option");
    option.value = String(choice.windowId);
    option.textContent = choice.recommended
      ? `${choice.label} (recommended)`
      : choice.label;
    option.selected = choice.windowId === result.recommendedWindowId;
    select.append(option);
  }

  panel.hidden = false;
}

async function saveOptions() {
  const options = readOptionsFromForm();
  state.options = await send("save-options", { options });
  setStatus("Options saved.");
}

async function changeSlotScope(nextScope) {
  const currentScope = state.options?.slotScope || "global";

  if (nextScope === currentScope)
    return;

  hideScopeSwitchConfirm();

  const result = await send("change-slot-scope", { slotScope: nextScope });

  if (result.status === "choice-required") {
    setSlotScopeRadio(currentScope);
    showScopeSwitchConfirm(result);
    setStatus("Choose which window keeps its assignments.");
    return;
  }

  state.options = result.options;
  setSlotScopeRadio(state.options.slotScope);
  setStatus(state.options.slotScope === "per-window"
    ? "Per-window slots enabled."
    : "Global slots enabled."
  );
}

async function confirmScopeSwitch() {
  if (!pendingScopeChange)
    return;

  const select = document.getElementById("scope-keep-window");
  const keepWindowId = Number(select.value);
  const result = await send("confirm-slot-scope-change", {
    slotScope: "global",
    keepWindowId
  });

  state.options = result.options;
  hideScopeSwitchConfirm();
  setSlotScopeRadio(state.options.slotScope);
  setStatus("Global slots enabled.");
}

function hydrateForm() {
  const options = state.options;
  const environment = state.environment || {};

  setSlotScopeRadio(options.slotScope || "global");
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

for (const radio of document.querySelectorAll('input[name="slot-scope"]')) {
  radio.addEventListener("change", event => {
    changeSlotScope(event.target.value).catch(error => {
      console.error(error);
      setSlotScopeRadio(state.options?.slotScope || "global");
      setStatus("Could not change slot scope.");
    });
  });
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

document.getElementById("confirm-scope-switch").addEventListener("click", () => {
  confirmScopeSwitch().catch(error => {
    console.error(error);
    setStatus("Could not change slot scope.");
  });
});

document.getElementById("cancel-scope-switch").addEventListener("click", () => {
  hideScopeSwitchConfirm();
  setSlotScopeRadio(state.options?.slotScope || "global");
  setStatus("Slot scope change canceled.");
});

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
  await send("clear-all-slots", { allWindows: true });
  setStatus("All Jump Slots cleared.");
});

load().catch(error => {
  console.error(error);
  setStatus("Could not load options.");
});
