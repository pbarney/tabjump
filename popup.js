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

function getCommandShortcut(commands, commandName) {
  const command = commands.find(item => item.name === commandName);
  return command?.shortcut || "";
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

function renderSlots() {
  const container = document.getElementById("slots");
  container.textContent = "";

  for (const slotView of state.slotViews) {
    const row = document.createElement("div");
    row.className = `slot${slotView.assigned ? "" : " empty"}`;

    const badge = document.createElement("div");
    badge.className = "slot-badge";
    badge.textContent = slotView.badge;
    badge.title = slotView.badgeTitle;

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

    const jump = document.createElement("button");
    jump.type = "button";
    jump.textContent = "Jump";
    jump.disabled = !slotView.assigned;
    jump.addEventListener("click", async () => {
      const ok = await send("jump-slot", { slot: slotView.slot });
      setStatus(ok ? `Jumped to Slot ${slotView.slot}.` : `Slot ${slotView.slot} is empty.`);
      await load();
    });

    const assign = document.createElement("button");
    assign.type = "button";
    assign.textContent = "Assign";
    assign.addEventListener("click", async () => {
      await send("assign-slot", { slot: slotView.slot });
      setStatus(`Assigned current tab to Slot ${slotView.slot}.`);
      await load();
    });

    row.append(badge, details, jump, assign);
    container.append(row);
  }
}

function renderHelp() {
  renderShortcut("shortcut-open", state.shortcutHelp.open);
  renderShortcut("shortcut-jump", state.shortcutHelp.jump);
  renderShortcut("shortcut-assign", state.shortcutHelp.assign);

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

function eventTargetAcceptsText(event) {
  const target = event.target;

  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable;
}

async function load() {
  state = await send("get-state");
  renderSlots();
  renderHelp();
}

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