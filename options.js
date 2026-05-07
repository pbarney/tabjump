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
    badgeStyle: document.getElementById("badge-style").value,
    showActionBadgeFeedback: document.getElementById("show-action-badge-feedback").checked
  };
}

async function saveOptions() {
  const options = readOptionsFromForm();
  state.options = await send("save-options", { options });
  setStatus("Options saved.");
}

function hydrateForm() {
  const options = state.options;
  document.querySelector('input[name="slot-scope"][value="global"]').checked = true;
  document.getElementById("show-tst-badges").checked = Boolean(options.showTstBadges);
  document.getElementById("badge-style").value = options.badgeStyle || "circled";
  document.getElementById("show-action-badge-feedback").checked = Boolean(options.showActionBadgeFeedback);
}

async function load() {
  state = await send("get-state");
  hydrateForm();
}

for (const id of ["show-tst-badges", "badge-style", "show-action-badge-feedback"]) {
  document.getElementById(id).addEventListener("change", () => {
    saveOptions().catch(error => {
      console.error(error);
      setStatus("Could not save options.");
    });
  });
}

document.getElementById("manage-shortcuts").addEventListener("click", async () => {
  await send("open-shortcut-settings");
});

document.getElementById("refresh-badges").addEventListener("click", async () => {
  await send("refresh-tst-badges");
  setStatus("TST badges refreshed.");
});

document.getElementById("clear-all").addEventListener("click", async () => {
  await send("clear-all-slots");
  setStatus("All Jump Slots cleared.");
});

load().catch(error => {
  console.error(error);
  setStatus("Could not load options.");
});
