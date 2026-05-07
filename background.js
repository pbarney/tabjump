/*
 * Tab Hotkeys & Shortcuts
 * v0.1.0 development build
 *
 * v1 scope:
 * - Global slots only.
 * - Browser-level extension commands only.
 * - No page-content shortcut interception.
 * - Optional Tree Style Tab badges through TST's Extra Tab Contents API.
 */

const SLOT_COUNT = 10;
const TST_ID = "treestyletab@piro.sakura.ne.jp";
const TST_BADGE_PLACE = "tab-front";

const DEFAULT_OPTIONS = Object.freeze({
  slotScope: "global",
  showTstBadges: true,
  badgeStyle: "circled",
  showActionBadgeFeedback: true
});

const BADGE_STYLES = Object.freeze({
  circled: ["⓪", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"],
  negativeCircled: ["⓿", "❶", "❷", "❸", "❹", "❺", "❻", "❼", "❽", "❾"],
  dingbatCircled: ["⓪", "➀", "➁", "➂", "➃", "➄", "➅", "➆", "➇", "➈"],
  dingbatNegative: ["⓿", "➊", "➋", "➌", "➍", "➎", "➏", "➐", "➑", "➒"],
  letters: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
  circledLetters: ["Ⓐ", "Ⓑ", "Ⓒ", "Ⓓ", "Ⓔ", "Ⓕ", "Ⓖ", "Ⓗ", "Ⓘ", "Ⓙ"]
});

let badgeTimer = null;

function emptySlotMap() {
  return {};
}

async function getStorage(keys) {
  return browser.storage.local.get(keys);
}

async function setStorage(values) {
  return browser.storage.local.set(values);
}

async function getOptions() {
  const { options = {} } = await getStorage("options");
  return { ...DEFAULT_OPTIONS, ...options };
}

async function saveOptions(nextOptions) {
  const options = { ...DEFAULT_OPTIONS, ...nextOptions };
  await setStorage({ options });
  await refreshAllTstBadges();
  return options;
}

async function getSlots() {
  const { slots = emptySlotMap() } = await getStorage("slots");
  return slots || emptySlotMap();
}

async function saveSlots(slots) {
  await setStorage({ slots });
}

function slotFromCommand(command, prefix) {
  const match = command.match(new RegExp(`^${prefix}-(\\d)$`));
  return match ? Number(match[1]) : null;
}

function isValidSlot(slot) {
  return Number.isInteger(slot) && slot >= 0 && slot < SLOT_COUNT;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function badgeForSlot(slot, options) {
  const style = BADGE_STYLES[options.badgeStyle] || BADGE_STYLES.circled;
  return style[slot] || String(slot);
}

async function flashBrowserActionBadge(text) {
  const options = await getOptions();
  if (!options.showActionBadgeFeedback)
    return;

  if (badgeTimer)
    clearTimeout(badgeTimer);

  await browser.browserAction.setBadgeBackgroundColor({ color: "#334155" });
  await browser.browserAction.setBadgeText({ text });

  badgeTimer = setTimeout(() => {
    browser.browserAction.setBadgeText({ text: "" }).catch(() => {});
  }, 1400);
}

async function getTabSafe(tabId) {
  try {
    return await browser.tabs.get(tabId);
  } catch (_) {
    return null;
  }
}

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function tabToSlotEntry(tab) {
  return {
    tabId: tab.id,
    windowId: tab.windowId,
    title: tab.title || tab.url || `Tab ${tab.id}`,
    url: tab.url || "",
    favIconUrl: tab.favIconUrl || "",
    pinned: Boolean(tab.pinned),
    incognito: Boolean(tab.incognito),
    assignedAt: Date.now()
  };
}

async function assignSlot(slot, tab) {
  if (!isValidSlot(slot))
    throw new Error(`Invalid slot: ${slot}`);

  const targetTab = tab || await getActiveTab();
  if (!targetTab || targetTab.id == null)
    throw new Error("No active tab is available.");

  const slots = await getSlots();

  // A tab can only occupy one global slot.
  for (const [existingSlot, entry] of Object.entries(slots)) {
    if (entry && entry.tabId === targetTab.id && Number(existingSlot) !== slot) {
      delete slots[existingSlot];
      await clearTstBadgeForTab(targetTab.id);
    }
  }

  const previous = slots[String(slot)];
  if (previous && previous.tabId !== targetTab.id)
    await clearTstBadgeForTab(previous.tabId);

  slots[String(slot)] = tabToSlotEntry(targetTab);
  await saveSlots(slots);
  await setTstBadgeForTab(targetTab.id, slot);
  await flashBrowserActionBadge(`S${slot}`);

  return slots[String(slot)];
}

async function unassignSlot(slot) {
  if (!isValidSlot(slot))
    throw new Error(`Invalid slot: ${slot}`);

  const slots = await getSlots();
  const previous = slots[String(slot)];
  if (!previous)
    return false;

  delete slots[String(slot)];
  await saveSlots(slots);
  await clearTstBadgeForTab(previous.tabId);
  await flashBrowserActionBadge(`–${slot}`);
  return true;
}

async function unassignTab(tabId) {
  const slots = await getSlots();
  let removed = false;

  for (const [slot, entry] of Object.entries(slots)) {
    if (entry && entry.tabId === tabId) {
      delete slots[slot];
      removed = true;
    }
  }

  if (!removed)
    return false;

  await saveSlots(slots);
  await clearTstBadgeForTab(tabId);
  await flashBrowserActionBadge("–");
  return true;
}

async function jumpSlot(slot) {
  if (!isValidSlot(slot))
    throw new Error(`Invalid slot: ${slot}`);

  const slots = await getSlots();
  const entry = slots[String(slot)];
  if (!entry)
    return false;

  const tab = await getTabSafe(entry.tabId);
  if (!tab) {
    delete slots[String(slot)];
    await saveSlots(slots);
    await clearTstBadgeForTab(entry.tabId);
    await flashBrowserActionBadge("gone");
    return false;
  }

  await browser.windows.update(tab.windowId, { focused: true });
  await browser.tabs.update(tab.id, { active: true });
  return true;
}

async function clearAllSlots() {
  await saveSlots(emptySlotMap());
  await clearAllTstBadges();
  await flashBrowserActionBadge("clr");
}

async function pruneMissingSlots() {
  const slots = await getSlots();
  let changed = false;

  for (const [slot, entry] of Object.entries(slots)) {
    if (!entry || !await getTabSafe(entry.tabId)) {
      delete slots[slot];
      changed = true;
    }
  }

  if (changed)
    await saveSlots(slots);

  return slots;
}

async function updateSlotSnapshot(tabId) {
  const slots = await getSlots();
  let changed = false;
  const tab = await getTabSafe(tabId);

  for (const [slot, entry] of Object.entries(slots)) {
    if (!entry || entry.tabId !== tabId)
      continue;

    if (!tab) {
      delete slots[slot];
    } else {
      slots[slot] = { ...entry, ...tabToSlotEntry(tab), assignedAt: entry.assignedAt };
    }

    changed = true;
  }

  if (changed)
    await saveSlots(slots);
}

/*
 * Tree Style Tab integration
 */

async function registerToTst() {
  const options = await getOptions();
  if (!options.showTstBadges)
    return false;

  try {
    await browser.runtime.sendMessage(TST_ID, {
      type: "register-self",
      name: browser.runtime.getManifest().name,
      icons: browser.runtime.getManifest().icons || {},
      listeningTypes: [
        "ready",
        "permissions-changed",
        "sidebar-show",
        "tabs-rendered"
      ],
      allowBulkMessaging: true,
      lightTree: true,
      permissions: [],
      style: `
        ::part(%EXTRA_CONTENTS_PART% tab-hotkey-slot-badge) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.35em;
          height: 1.35em;
          margin-inline-end: 0.25em;
          border-radius: 999px;
          font-size: 0.9em;
          font-weight: 700;
          line-height: 1;
          color: ButtonText;
          background: color-mix(in srgb, Highlight 18%, transparent);
        }
        tab-item.active ::part(%EXTRA_CONTENTS_PART% tab-hotkey-slot-badge) {
          background: color-mix(in srgb, Highlight 32%, transparent);
        }
      `
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function setTstBadgeForTab(tabId, slot) {
  const options = await getOptions();
  if (!options.showTstBadges)
    return;

  const badge = escapeHtml(badgeForSlot(slot, options));
  const title = escapeHtml(`Jump Slot ${slot}`);

  try {
    await browser.runtime.sendMessage(TST_ID, {
      type: "set-extra-contents",
      place: TST_BADGE_PLACE,
      tab: tabId,
      contents: `<span anonid="tab-hotkey-slot-badge" part="tab-hotkey-slot-badge" title="${title}" aria-label="${title}">${badge}</span>`
    });
  } catch (_) {
    // TST is unavailable or the target tab row is not rendered.
  }
}

async function clearTstBadgeForTab(tabId) {
  if (tabId == null)
    return;

  try {
    await browser.runtime.sendMessage(TST_ID, {
      type: "clear-extra-contents",
      place: TST_BADGE_PLACE,
      tab: tabId
    });
  } catch (_) {
    // TST is unavailable or the target tab row is not rendered.
  }
}

async function clearAllTstBadges() {
  try {
    await browser.runtime.sendMessage(TST_ID, {
      type: "clear-all-extra-contents"
    });
  } catch (_) {
    // TST is unavailable.
  }
}

async function refreshTstBadgesForTabs(tabIds = null) {
  const options = await getOptions();
  if (!options.showTstBadges) {
    await clearAllTstBadges();
    return;
  }

  const slots = await pruneMissingSlots();
  const assignedByTab = new Map();

  for (const [slot, entry] of Object.entries(slots)) {
    if (entry && entry.tabId != null)
      assignedByTab.set(entry.tabId, Number(slot));
  }

  const ids = tabIds || [...assignedByTab.keys()];
  for (const tabId of ids) {
    if (assignedByTab.has(tabId))
      await setTstBadgeForTab(tabId, assignedByTab.get(tabId));
    else
      await clearTstBadgeForTab(tabId);
  }
}

async function refreshAllTstBadges() {
  const registered = await registerToTst();
  if (!registered)
    return;

  const tabs = await browser.tabs.query({});
  await refreshTstBadgesForTabs(tabs.map(tab => tab.id));
}

/*
 * Context menu
 */

async function rebuildContextMenus() {
  await browser.menus.removeAll();

  browser.menus.create({
    id: "assign-root",
    title: "Assign to Jump Slot",
    contexts: ["tab"]
  });

  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    browser.menus.create({
      id: `assign-slot-${slot}`,
      parentId: "assign-root",
      title: `Slot ${slot}`,
      contexts: ["tab"]
    });
  }

  browser.menus.create({
    id: "unassign-tab",
    title: "Unassign this tab",
    contexts: ["tab"]
  });

  browser.menus.create({
    id: "open-shortcut-settings",
    title: "Manage Extension Shortcuts",
    contexts: ["browser_action"]
  });
}

/*
 * Event handlers
 */

browser.commands.onCommand.addListener(async command => {
  try {
    let slot = slotFromCommand(command, "jump-slot");
    if (slot !== null) {
      await jumpSlot(slot);
      return;
    }

    slot = slotFromCommand(command, "assign-slot");
    if (slot !== null) {
      await assignSlot(slot);
    }
  } catch (error) {
    console.error("Command failed:", command, error);
  }
});

browser.menus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === "unassign-tab" && tab) {
      await unassignTab(tab.id);
      return;
    }

    if (info.menuItemId === "open-shortcut-settings") {
      await openShortcutSettings();
      return;
    }

    const match = String(info.menuItemId).match(/^assign-slot-(\d)$/);
    if (match && tab) {
      await assignSlot(Number(match[1]), tab);
    }
  } catch (error) {
    console.error("Menu command failed:", info.menuItemId, error);
  }
});

browser.tabs.onRemoved.addListener(async tabId => {
  try {
    await unassignTab(tabId);
  } catch (error) {
    console.error("Failed to clear closed tab assignment:", error);
  }
});

browser.tabs.onUpdated.addListener(async tabId => {
  try {
    await updateSlotSnapshot(tabId);
  } catch (error) {
    console.error("Failed to refresh tab snapshot:", error);
  }
});

browser.tabs.onAttached.addListener(async tabId => {
  try {
    await updateSlotSnapshot(tabId);
  } catch (error) {
    console.error("Failed to update moved tab window:", error);
  }
});

browser.windows.onRemoved.addListener(async windowId => {
  try {
    const slots = await getSlots();
    let changed = false;

    for (const [slot, entry] of Object.entries(slots)) {
      if (entry && entry.windowId === windowId) {
        delete slots[slot];
        changed = true;
      }
    }

    if (changed)
      await saveSlots(slots);
  } catch (error) {
    console.error("Failed to clear removed-window slots:", error);
  }
});

browser.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== "object")
    return;

  switch (message.type) {
    case "get-state":
      return Promise.all([getSlots(), getOptions(), getCommands()]).then(([slots, options, commands]) => ({
        slots,
        options,
        commands,
        badgeStyles: Object.keys(BADGE_STYLES)
      }));

    case "assign-slot":
      return getActiveTab().then(tab => assignSlot(message.slot, tab));

    case "jump-slot":
      return jumpSlot(message.slot);

    case "unassign-slot":
      return unassignSlot(message.slot);

    case "unassign-current-tab":
      return getActiveTab().then(tab => tab ? unassignTab(tab.id) : false);

    case "clear-all-slots":
      return clearAllSlots();

    case "save-options":
      return saveOptions(message.options || {});

    case "open-shortcut-settings":
      return openShortcutSettings();

    case "refresh-tst-badges":
      return refreshAllTstBadges();

    default:
      return undefined;
  }
});

browser.runtime.onMessageExternal.addListener((message, sender) => {
  if (!sender || sender.id !== TST_ID || !message)
    return undefined;

  if (message.messages && Array.isArray(message.messages)) {
    for (const oneMessage of message.messages)
      handleTstMessage(oneMessage).catch(error => console.error("TST bulk message failed:", error));
    return undefined;
  }

  return handleTstMessage(message);
});

async function handleTstMessage(message) {
  switch (message.type) {
    case "ready":
    case "permissions-changed":
      await refreshAllTstBadges();
      break;

    case "sidebar-show": {
      const tabs = await browser.tabs.query({ windowId: message.windowId });
      await refreshTstBadgesForTabs(tabs.map(tab => tab.id));
      break;
    }

    case "tabs-rendered": {
      const tabIds = Array.isArray(message.tabs)
        ? message.tabs.map(tab => tab && tab.id).filter(id => id != null)
        : [];
      if (tabIds.length)
        await refreshTstBadgesForTabs(tabIds);
      break;
    }
  }

  return undefined;
}

async function getCommands() {
  try {
    return await browser.commands.getAll();
  } catch (_) {
    return [];
  }
}

async function openShortcutSettings() {
  if (browser.commands && browser.commands.openShortcutSettings)
    return browser.commands.openShortcutSettings();

  await browser.tabs.create({ url: "about:addons" });
}

browser.runtime.onStartup.addListener(async () => {
  // v1 intentionally treats assignments as live-session state, not restored session state.
  await clearAllSlots();
});

browser.runtime.onInstalled.addListener(async () => {
  await rebuildContextMenus();
  await pruneMissingSlots();
  await registerToTst();
});

(async function init() {
  await rebuildContextMenus();
  await pruneMissingSlots();
  await registerToTst();
  await refreshAllTstBadges();
})();
