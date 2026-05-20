let state = null;
let statusTimer = null;
let helpIsOpen = false;
let shortcutMode = null;
let shortcutModeTimer = null;

const SHORTCUT_MODE_TIMEOUT_MS = 3000;

const openHelpButton = document.getElementById("open-help");
const slotsView = document.getElementById("slots-view");
const helpView = document.getElementById("help-view");

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

function clearShortcutMode(message = "") {
  shortcutMode = null;

  if (shortcutModeTimer) {
    clearTimeout(shortcutModeTimer);
    shortcutModeTimer = null;
  }

  if (message)
    setStatus(message);
}

function setShortcutMode(mode) {
  shortcutMode = mode;

  if (shortcutModeTimer)
    clearTimeout(shortcutModeTimer);

  if (mode === "assign") {
    setStatus("Assign mode: press 1-9.");
  } else if (mode === "unassign") {
    setStatus("Unassign mode: press 1-9, or 0 for current tab.");
  }

  shortcutModeTimer = setTimeout(() => {
    shortcutMode = null;
    shortcutModeTimer = null;
    setStatus("");
  }, SHORTCUT_MODE_TIMEOUT_MS);
}

function shortcutsDifferFromDefaults(commands, shortcutDefaults) {
  return Object.entries(shortcutDefaults || {}).some(([commandName, expectedShortcut]) => {
    const command = commands.find(item => item.name === commandName);

    if (!command)
      return false;

    return (command.shortcut || "") !== expectedShortcut;
  });
}

function appendShortcutCombo(element, combo) {
  const wrapper = document.createElement("span");
  wrapper.className = "shortcut";

  const keys = combo.split("+");

  keys.forEach((key, index) => {
    if (index > 0)
      wrapper.append(document.createTextNode("+"));

    const kbd = document.createElement("kbd");
    kbd.textContent = key;
    wrapper.append(kbd);
  });

  element.append(wrapper);
}

function renderShortcut(elementId, shortcutText) {
  const element = document.getElementById(elementId);
  element.textContent = "";

  if (!shortcutText.includes("+")) {
    element.textContent = shortcutText;
    return;
  }

  const [firstCombo, secondCombo] = shortcutText.split(" to ");

  appendShortcutCombo(element, firstCombo);

  if (secondCombo) {
    element.append(document.createTextNode(" to "));
    appendShortcutCombo(element, secondCombo);
  }
}

function eventTargetAcceptsText(event) {
  const target = event.target;

  return target instanceof HTMLElement && (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

async function jumpToSlot(slot, closePopup = false) {
  const ok = await send("jump-slot", { slot });

  if (!ok) {
    setStatus(`Slot ${slot} is empty.`);
    await load();
    return;
  }

  if (closePopup) {
    window.close();
    return;
  }

  setStatus(`Jumped to Slot ${slot}.`);
  await load();
}

function toggleHelpView() {
  if (helpIsOpen) {
    showSlotsView();
  } else {
    showHelpView();
  }
}

async function openOptionsPage() {
  try {
    await browser.runtime.openOptionsPage();
    window.close();
  } catch (error) {
    console.error(error);
    setStatus("Could not open options.");
  }
}

async function assignSlotFromPopup(slot) {
  clearShortcutMode();

  await send("assign-slot", { slot });
  setStatus(`Assigned current tab to Slot ${slot}.`);
  await load();
}

async function unassignSlotFromPopup(slot) {
  clearShortcutMode();

  const changed = await send("unassign-slot", { slot });
  setStatus(changed ? `Slot ${slot} unassigned.` : `Slot ${slot} is already empty.`);
  await load();
}

async function unassignCurrentTabFromPopup() {
  clearShortcutMode();

  const changed = await send("unassign-current-tab");
  setStatus(changed ? "Current tab unassigned." : "Current tab was not assigned.");
  await load();
}

function renderSlots() {
  const container = document.getElementById("slots");
  container.textContent = "";

  for (const slotView of state.slotViews) {
    const row = document.createElement("div");
    row.className = [
      "slot",
      slotView.assigned ? "" : "empty",
      slotView.isCurrentTab ? "current" : ""
    ].filter(Boolean).join(" ");

    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "slot-badge";
    jump.textContent = slotView.badge;
    jump.disabled = !slotView.assigned;
    jump.title = slotView.assigned
      ? `Jump to Slot ${slotView.slot}`
      : `Slot ${slotView.slot} is empty`;
    jump.setAttribute("aria-label", jump.title);

    jump.addEventListener("click", async () => {
      await jumpToSlot(slotView.slot, false);
    });

    const details = document.createElement("div");
    details.className = "slot-details";

    const title = document.createElement("div");
    title.className = "slot-title";
    title.textContent = slotView.title;
    if (slotView.fullTitle)
      title.title = slotView.fullTitle;

    const subtitle = document.createElement("div");
    subtitle.className = "slot-url";
    subtitle.textContent = slotView.subtitle;
    if (slotView.fullUrl)
      subtitle.title = slotView.fullUrl;

    details.append(title, subtitle);

    const assign = document.createElement("button");
    assign.type = "button";
    assign.textContent = slotView.assigned ? "Unassign" : "Assign";
    assign.title = slotView.assigned
      ? `Unassign Slot ${slotView.slot}`
      : `Assign current tab to Slot ${slotView.slot}`;
    assign.setAttribute("aria-label", assign.title);

    assign.addEventListener("click", async () => {
      if (slotView.assigned) {
        await unassignSlotFromPopup(slotView.slot);
      } else {
        await assignSlotFromPopup(slotView.slot);
      }
    });

    row.append(jump, details, assign);
    container.append(row);
  }
}

function renderHelp() {
  renderShortcut("shortcut-open", state.shortcutHelp.open);
  renderShortcut("shortcut-jump", state.shortcutHelp.jump);
  renderShortcut("shortcut-assign", state.shortcutHelp.assign);
  renderShortcut("shortcut-unassign", state.shortcutHelp.unassign);

  const environment = state.environment || {};

  const warning = document.getElementById("shortcut-warning");
  warning.textContent = "Your extension shortcut settings appear to differ from these defaults.";
  warning.hidden = !shortcutsDifferFromDefaults(state.commands || [], state.shortcutDefaults || {});

  const shortcutNote = document.getElementById("shortcut-note");
  if (shortcutNote) {
    shortcutNote.textContent = environment.supportsDefaultSlotShortcuts
      ? "These are the default shortcuts:"
      : "Chrome/Chromium requires you to manually assign most slot shortcuts from the extension shortcut settings page.";
  }

  const tstNote = document.getElementById("tst-note");
  if (tstNote) {
    tstNote.hidden = !environment.supportsTstBadges;

    if (environment.supportsTstBadges)
      tstNote.textContent = "Tree Style Tab users can enable slot badges in Options.";
  }
}

function updateHelpButton() {
  openHelpButton.textContent = helpIsOpen ? "Back" : "Help";
  openHelpButton.title = helpIsOpen ? "Back to jump slots (H)" : "Open help (H)";
}

function showSlotsView() {
  helpIsOpen = false;

  slotsView.hidden = false;
  helpView.hidden = true;

  updateHelpButton();
  setStatus("");
}

function showHelpView() {
  helpIsOpen = true;

  slotsView.hidden = true;
  helpView.hidden = false;

  updateHelpButton();
  setStatus("");
}

async function load() {
  state = await send("get-state");
  renderSlots();
  renderHelp();
}

openHelpButton.addEventListener("click", toggleHelpView);
document.getElementById("open-options").addEventListener("click", openOptionsPage);

document.addEventListener("click", async (event) => {
  const button = event.target.closest(".manage-shortcuts-help");

  if (!button) return;

  try {
    await send("open-shortcut-settings");
    window.close();
  } catch (error) {
    console.error(error);
    setStatus("Could not open shortcut settings.");
  }
});

document.addEventListener("keydown", async event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
    return;

  if (eventTargetAcceptsText(event))
    return;

  const key = event.key.toLowerCase();

  if (key === "escape") {
    if (shortcutMode) {
      event.preventDefault();
      clearShortcutMode("Shortcut mode canceled.");
      return;
    }

    if (helpIsOpen) {
      event.preventDefault();
      showSlotsView();
      return;
    }

    return;
  }

  if (key === "h") {
    event.preventDefault();
    clearShortcutMode();
    toggleHelpView();
    return;
  }

  if (key === "o") {
    event.preventDefault();
    clearShortcutMode();
    await openOptionsPage();
    return;
  }

  if (helpIsOpen)
    return;

  if (shortcutMode === "assign") {
    event.preventDefault();

    if (/^[1-9]$/.test(key)) {
      await assignSlotFromPopup(Number(key));
    } else {
      clearShortcutMode("Shortcut mode canceled.");
    }

    return;
  }

  if (shortcutMode === "unassign") {
    event.preventDefault();

    if (/^[1-9]$/.test(key)) {
      await unassignSlotFromPopup(Number(key));
    } else if (key === "0") {
      await unassignCurrentTabFromPopup();
    } else {
      clearShortcutMode("Shortcut mode canceled.");
    }

    return;
  }

  if (key === "a") {
    event.preventDefault();
    setShortcutMode("assign");
    return;
  }

  if (key === "u") {
    event.preventDefault();
    setShortcutMode("unassign");
    return;
  }

  if (!/^[1-9]$/.test(key))
    return;

  event.preventDefault();
  event.stopPropagation();

  await jumpToSlot(Number(key), true);
});

document.getElementById("unassign-current").addEventListener("click", async () => {
  await unassignCurrentTabFromPopup();
});

document.getElementById("clear-all").addEventListener("click", async () => {
  clearShortcutMode();
  await send("clear-all-slots");
  setStatus("All slots cleared.");
  await load();
});

load().catch(error => {
  console.error(error);
  setStatus("Could not load slot state.");
});
