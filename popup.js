const SLOT_IDS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9]);

const BADGE_STYLES = {
  circled: ["⓪", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"],
  negativeCircled: ["⓿", "❶", "❷", "❸", "❹", "❺", "❻", "❼", "❽", "❾"],
  dingbatCircled: ["⓪", "➀", "➁", "➂", "➃", "➄", "➅", "➆", "➇", "➈"],
  dingbatNegative: ["⓿", "➊", "➋", "➌", "➍", "➎", "➏", "➐", "➑", "➒"],
  letters: ["", "A", "B", "C", "D", "E", "F", "G", "H", "I"],
  circledLetters: ["", "Ⓐ", "Ⓑ", "Ⓒ", "Ⓓ", "Ⓔ", "Ⓕ", "Ⓖ", "Ⓗ", "Ⓘ"]
};

let state = null;
let statusTimer = null;

function send(type, extra = {}) {
  return browser.runtime.sendMessage({ type, ...extra });
}

function badgeForSlot(slot) {
  const styleName = state?.options?.badgeStyle || "circled";
  const style = BADGE_STYLES[styleName] || BADGE_STYLES.circled;
  return style[slot] || String(slot);
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

function commandShortcut(commandName) {
  const command = (state.commands || []).find(item => item.name === commandName);
  return command?.shortcut || "";
}

function renderSlots() {
  const container = document.getElementById("slots");
  container.textContent = "";

  for (const slot of SLOT_IDS) {
    const entry = state.slots[String(slot)];
    const row = document.createElement("div");
    row.className = `slot${entry ? "" : " empty"}`;

    const badge = document.createElement("div");
    badge.className = "slot-badge";
    badge.textContent = badgeForSlot(slot);
    badge.title = `Slot ${slot}`;

    const details = document.createElement("div");
    details.className = "slot-details";

    const title = document.createElement("div");
    title.className = "slot-title";
    title.textContent = entry?.title || `Slot ${slot} is empty`;

    const url = document.createElement("div");
    url.className = "slot-url";
    const jumpShortcut = commandShortcut(`jump-slot-${slot}`);
    const assignShortcut = commandShortcut(`assign-slot-${slot}`);
    url.textContent = entry?.url || [
      jumpShortcut ? `Jump: ${jumpShortcut}` : "Jump shortcut unset",
      assignShortcut ? `Assign: ${assignShortcut}` : "assign shortcut unset"
    ].join(" · ");

    details.append(title, url);

    const jump = document.createElement("button");
    jump.type = "button";
    jump.textContent = "Jump";
    jump.disabled = !entry;
    jump.addEventListener("click", async () => {
      const ok = await send("jump-slot", { slot });
      setStatus(ok ? `Jumped to Slot ${slot}.` : `Slot ${slot} is empty.`);
      await load();
    });

    const assign = document.createElement("button");
    assign.type = "button";
    assign.textContent = "Assign";
    assign.addEventListener("click", async () => {
      await send("assign-slot", { slot });
      setStatus(`Assigned current tab to Slot ${slot}.`);
      await load();
    });

    row.append(badge, details, jump, assign);
    container.append(row);
  }
}

async function load() {
  state = await send("get-state");
  renderSlots();
}

document.getElementById("open-options").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
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

load().catch(error => {
  console.error(error);
  setStatus("Could not load slot state.");
});
