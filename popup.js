let state = null;
let statusTimer = null;
let helpIsOpen = false;

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

  const [firstCombo, secondCombo] = shortcutText.split(" through ");

  appendShortcutCombo(element, firstCombo);

  if (secondCombo) {
    element.append(document.createTextNode(" through "));
    appendShortcutCombo(element, secondCombo);
  }
}

function eventTargetAcceptsText(event) {
  const target = event.target;

  if (!(target instanceof HTMLElement))
    return false;

  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable;
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

function renderSlots() {
  const container = document.getElementById("slots");
  container.textContent = "";

  for (const slotView of state.slotViews) {
    const row = document.createElement("div");
    row.className = `slot${slotView.assigned ? "" : " empty"}`;

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
        await send("unassign-slot", { slot: slotView.slot });
        setStatus(`Slot ${slotView.slot} unassigned.`);
      } else {
        await send("assign-slot", { slot: slotView.slot });
        setStatus(`Assigned current tab to Slot ${slotView.slot}.`);
      }

      await load();
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

  const warning = document.getElementById("shortcut-warning");
  warning.hidden = !shortcutsDifferFromDefaults(state.commands || [], state.shortcutDefaults || {});
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

document.addEventListener("keydown", async event => {
  if (helpIsOpen)
    return;

  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
    return;

  if (eventTargetAcceptsText(event))
    return;

  if (!/^[1-9]$/.test(event.key))
    return;

  event.preventDefault();
  event.stopPropagation();

  await jumpToSlot(Number(event.key), true);
});

openHelpButton.addEventListener("click", () => {
  if (helpIsOpen) {
    showSlotsView();
  } else {
    showHelpView();
}
});

async function openOptionsPage() {
  try {
    await browser.runtime.openOptionsPage();
    window.close();
  } catch (error) {
    console.error(error);
    setStatus("Could not open options.");
  }
}

document.getElementById("open-options").addEventListener("click", openOptionsPage);

document.getElementById("manage-shortcuts-help").addEventListener("click", async () => {
  try {
    await send("open-shortcut-settings");
    window.close();
  } catch (error) {
    console.error(error);
    setStatus("Could not open shortcut settings.");
  }
});

document.getElementById("unassign-current").addEventListener("click", async () => {
  const changed = await send("unassign-current-tab");
  setStatus(changed ? "Current tab unassigned." : "Current tab was not assigned.");
  await load();
});

document.getElementById("clear-all").addEventListener("click", async () => {
  await send("clear-all-slots");
  setStatus("All slots cleared.");
  await load();
});

document.addEventListener("keydown", async event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
    return;

  if (eventTargetAcceptsText(event))
    return;

  const key = event.key.toLowerCase();

  if (key === "h") {
    event.preventDefault();

    if (helpIsOpen) {
      showSlotsView();
    } else {
      showHelpView();
    }

    return;
  }

  if (key === "o") {
    event.preventDefault();
    await openOptionsPage();
  }
});

load().catch(error => {
  console.error(error);
  setStatus("Could not load slot state.");
});

console.log({
  prefersDark: matchMedia("(prefers-color-scheme: dark)").matches,
  prefersForcedColors: matchMedia("(forced-colors: active)").matches,
  rootColorScheme: getComputedStyle(document.documentElement).colorScheme,
  bodyBackground: getComputedStyle(document.body).backgroundColor,
  bodyColor: getComputedStyle(document.body).color
});
getCurrentThemeForActiveWindow().then(console.log);
console.log(browser.theme.getCurrent);

async function getCurrentThemeForActiveWindow() {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  return browser.theme.getCurrent(tab?.windowId);
}