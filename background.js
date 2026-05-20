/*
 * TabJump
 * v0.1.7 development build
 *
 * v1 scope:
 * - Global slots only.
 * - Browser-level extension commands only.
 * - No page-content shortcut interception.
 * - Optional Tree Style Tab badges through TST's Extra Tab Contents API.
 */

if (typeof importScripts === "function" && !globalThis.TabJumpPlatform)
  importScripts("platform.js");

if (!globalThis.TabJumpPlatform)
  throw new Error("TabJumpPlatform is unavailable. Make sure platform.js is loaded before background.js.");

const TabJumpPlatform = globalThis.TabJumpPlatform;

const SLOT_IDS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9]);
const TST_ID = "treestyletab@piro.sakura.ne.jp";
const TST_BADGE_PLACE = "tab-front";
const SLOT_FEEDBACK_NOTIFICATION_ID = "tabjump-slot-feedback";
const NOTIFICATION_CREATE_COOLDOWN_MS = 700;

let badgeTimer = null;
let lastNotificationCreateAt = 0;

function getDefaultOptions() {
  return {
    slotScope: "global",
    showTstBadges: true,
    showActionBadgeFeedback: true,
    showDesktopNotifications: !TabJumpPlatform.isFirefoxRuntime()
  };
}

function getEnvironment() {
  return {
    browserLabel: TabJumpPlatform.getBrowserLabel(),
    openPopupCommandName: TabJumpPlatform.getOpenPopupCommandName(),
    supportsTstBadges: TabJumpPlatform.supportsTstBadges(),
    supportsDefaultSlotShortcuts: TabJumpPlatform.supportsDefaultSlotShortcuts(),
    supportsDesktopNotifications: TabJumpPlatform.supportsDesktopNotifications()
  };
}

function normalizeOptions(options) {
  const normalized = { ...getDefaultOptions(), ...options };

  if (!TabJumpPlatform.supportsTstBadges())
    normalized.showTstBadges = false;

  if (!TabJumpPlatform.supportsDesktopNotifications())
    normalized.showDesktopNotifications = false;

  return normalized;
}

function getActionApi() {
  return browser.action || browser.browserAction;
}

function getMenuApi() {
  return browser.menus || browser.contextMenus;
}

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
  return normalizeOptions(options);
}

async function saveOptions(nextOptions) {
  const options = normalizeOptions(nextOptions);
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
  return Number.isInteger(slot) && SLOT_IDS.includes(slot);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function badgeForSlot(slot) {
  return String(slot);
}

function shortcutForCommand(commands, commandName) {
  const command = commands.find(item => item.name === commandName);
  return command?.shortcut || "";
}

function shortenUrlForDisplay(url) {
  if (!url)
    return "";

  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname}${path}`;
  } catch (_) {
    return url;
  }
}

function buildSlotView(slot, entry, options, commands, currentTabId = null) {
  const jumpShortcut = shortcutForCommand(commands, `jump-slot-${slot}`);
  const assignShortcut = shortcutForCommand(commands, `assign-slot-${slot}`);
  const badge = badgeForSlot(slot);

  if (!entry) {
    return {
      slot,
      assigned: false,
      isCurrentTab: false,
      badge,
      badgeTitle: `Jump Slot ${slot}`,
      title: `Slot ${slot} is empty`,
      fullTitle: "",
      subtitle: [
        jumpShortcut ? `Jump: ${jumpShortcut}` : "Jump shortcut unset",
        assignShortcut ? `Assign: ${assignShortcut}` : "assign shortcut unset"
      ].join(" · "),
      fullUrl: "",
      jumpShortcut,
      assignShortcut
    };
  }

  return {
    slot,
    assigned: true,
    isCurrentTab: entry.tabId === currentTabId,
    badge,
    badgeTitle: `Jump Slot ${slot}`,
    title: entry.title || entry.url || `Tab ${entry.tabId}`,
    fullTitle: entry.title || "",
    subtitle: shortenUrlForDisplay(entry.url),
    fullUrl: entry.url || "",
    jumpShortcut,
    assignShortcut,
    tabId: entry.tabId,
    windowId: entry.windowId,
    pinned: Boolean(entry.pinned),
    incognito: Boolean(entry.incognito)
  };
}

function buildPopupState(slots, options, commands, platformOs, currentTabId = null) {
  const environment = getEnvironment();

  return {
    slots,
    options,
    commands,
    environment,
    slotViews: SLOT_IDS.map(slot =>
      buildSlotView(slot, slots[String(slot)], options, commands, currentTabId)
    ),
    shortcutHelp: buildShortcutHelp(platformOs, environment),
    shortcutDefaults: buildShortcutDefaults(platformOs, environment)
  };
}

async function getPlatformOs() {
  try {
    const info = await browser.runtime.getPlatformInfo();
    return info.os;
  } catch (_) {
    return "unknown";
  }
}

function shortcutProfileForPlatform(platformOs) {
  if (platformOs === "linux") {
    return {
      openDisplay: "Alt+J",
      openExpected: "Alt+J",
      jumpDisplayModifier: "Ctrl",
      jumpExpectedModifier: "Ctrl",
      assignDisplayModifier: "Ctrl+Shift",
      assignExpectedModifier: "Ctrl+Shift"
    };
  }

  if (platformOs === "mac") {
    return {
      openDisplay: "Control+J",
      openExpected: "MacCtrl+J",
      jumpDisplayModifier: "Control",
      jumpExpectedModifier: "MacCtrl",
      assignDisplayModifier: "Control+Shift",
      assignExpectedModifier: "MacCtrl+Shift"
    };
  }

  return {
    openDisplay: "Alt+J",
    openExpected: "Alt+J",
    jumpDisplayModifier: "Alt",
    jumpExpectedModifier: "Alt",
    assignDisplayModifier: "Alt+Shift",
    assignExpectedModifier: "Alt+Shift"
  };
}

function shortcutRange(modifier, firstSlot, lastSlot) {
  return `${modifier}+${firstSlot} to ${modifier}+${lastSlot}`;
}

function buildShortcutHelp(platformOs, environment) {
  const profile = shortcutProfileForPlatform(platformOs);

  if (!environment.supportsDefaultSlotShortcuts) {
    return {
      open: profile.openDisplay,
      jump: "Assign in extension shortcut settings",
      assign: "Assign in extension shortcut settings",
      unassign: "Assign in extension shortcut settings"
    };
  }

  return {
    open: profile.openDisplay,
    jump: shortcutRange(profile.jumpDisplayModifier, 1, 9),
    assign: shortcutRange(profile.assignDisplayModifier, 1, 9),
    unassign: `${profile.assignDisplayModifier}+0`
  };
}

function buildShortcutDefaults(platformOs, environment) {
  const profile = shortcutProfileForPlatform(platformOs);
  const defaults = {
    [environment.openPopupCommandName]: profile.openExpected
  };

  if (!environment.supportsDefaultSlotShortcuts)
    return defaults;

  for (const slot of SLOT_IDS) {
    defaults[`jump-slot-${slot}`] = `${profile.jumpExpectedModifier}+${slot}`;
    defaults[`assign-slot-${slot}`] = `${profile.assignExpectedModifier}+${slot}`;
  }

  defaults["unassign-current-tab"] = `${profile.assignExpectedModifier}+0`;

  return defaults;
}

async function flashBrowserActionBadge(text) {
  const options = await getOptions();
  if (!options.showActionBadgeFeedback)
    return;

  if (badgeTimer)
    clearTimeout(badgeTimer);

  const actionApi = getActionApi();

  await actionApi.setBadgeBackgroundColor({ color: "#334155" });
  await actionApi.setBadgeText({ text });

  badgeTimer = setTimeout(() => {
    actionApi.setBadgeText({ text: "" }).catch(() => {});
  }, 1400);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createSlotFeedbackNotification(notificationApi, notificationOptions) {
  const now = Date.now();
  const elapsed = now - lastNotificationCreateAt;
  const delay = Math.max(0, NOTIFICATION_CREATE_COOLDOWN_MS - elapsed);

  if (delay > 0)
    await sleep(delay);

  lastNotificationCreateAt = Date.now();

  await notificationApi.clear(SLOT_FEEDBACK_NOTIFICATION_ID).catch(() => {});
  await notificationApi.create(SLOT_FEEDBACK_NOTIFICATION_ID, notificationOptions);
}

async function showSlotFeedbackNotification(message) {
  const options = await getOptions();

  if (!options.showDesktopNotifications)
    return;

  const notificationApi = browser.notifications;
  if (!notificationApi)
    return;

if (notificationApi.getPermissionLevel) {
  try {
    const permissionLevel = await notificationApi.getPermissionLevel();
    if (permissionLevel === "denied")
      return;
  } catch (error) {
    // Permission-level checks are best-effort.
    console.warn("[TabJump notifications] Could not read permission level:", error);
  }
}

  const notificationOptions = {
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon-96.png"),
    title: "TabJump",
    message
  };

  if (notificationApi.update) {
    try {
      const updated = await notificationApi.update(
        SLOT_FEEDBACK_NOTIFICATION_ID,
        notificationOptions
      );

      if (updated)
        return;
    } catch (_) {
      // Fall back to clear/create.
      console.warn("[TabJump notifications] update failed; falling back to create:", error);
    }
  }


  try {
    await createSlotFeedbackNotification(notificationApi, notificationOptions);
  } catch (error) {
    console.error("[TabJump notifications] create failed:", error);
  }
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
  await showSlotFeedbackNotification(`Assigned tab to slot ${slot}`);

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
  await showSlotFeedbackNotification(`Slot ${slot} unassigned`);
  return true;
}

async function unassignTab(tabId, feedback = {}) {
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

  if (feedback.showDesktopNotification) {
    await showSlotFeedbackNotification(
      feedback.message || "Tab unassigned"
    );
  }

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

async function clearAllSlots(feedback = {}) {
  const slots = await getSlots();
  const hadSlots = Object.keys(slots).length > 0;

  await saveSlots(emptySlotMap());
  await clearAllTstBadges();
  await flashBrowserActionBadge("clr");

  if (hadSlots && feedback.showDesktopNotification)
    await showSlotFeedbackNotification("All jump slots cleared");
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
  if (!TabJumpPlatform.supportsTstBadges())
    return false;

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
          width: 1rem;
          min-width: 1rem;
          height: 1rem;
          margin-block-start: 0.25rem
          margin-inline-end: 0.25em;
          border-radius: 999px;
          font: 700 0.9em/1 system-ui, sans-serif;
          background: Highlight;
          color: HighlightText;
        }
      `
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function setTstBadgeForTab(tabId, slot) {
  if (!TabJumpPlatform.supportsTstBadges())
    return;

  const options = await getOptions();
  if (!options.showTstBadges)
    return;

  const badge = escapeHtml(badgeForSlot(slot));
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
  if (!TabJumpPlatform.supportsTstBadges())
    return;

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
  if (!TabJumpPlatform.supportsTstBadges())
    return;

  try {
    await browser.runtime.sendMessage(TST_ID, {
      type: "clear-all-extra-contents"
    });
  } catch (_) {
    // TST is unavailable.
  }
}

async function refreshTstBadgesForTabs(tabIds = null) {
  if (!TabJumpPlatform.supportsTstBadges())
    return;

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
  if (!TabJumpPlatform.supportsTstBadges())
    return;

  const options = await getOptions();

  if (!options.showTstBadges) {
    await clearAllTstBadges();
    return;
  }

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
  const menuApi = getMenuApi();

  await menuApi.removeAll();

  if (TabJumpPlatform.supportsTabContextMenus()) {
    menuApi.create({
      id: "assign-root",
      title: "Assign to Jump Slot",
      contexts: ["tab"]
    });

    for (const slot of SLOT_IDS) {
      menuApi.create({
        id: `assign-slot-${slot}`,
        parentId: "assign-root",
        title: `Slot ${slot}`,
        contexts: ["tab"]
      });
    }

    menuApi.create({
      id: "unassign-tab",
      title: "Unassign this tab",
      contexts: ["tab"]
    });
  }

  menuApi.create({
    id: "open-shortcut-settings",
    title: "Manage Extension Shortcuts",
    contexts: TabJumpPlatform.getActionMenuContexts()
  });
}

/*
 * Event handlers
 */

browser.commands.onCommand.addListener(async command => {
  try {
    if (command === "unassign-current-tab") {
      const tab = await getActiveTab();

      if (tab) {
        await unassignTab(tab.id, {
          showDesktopNotification: true,
          message: "Current tab unassigned"
        });
      }

      return;
    }

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

getMenuApi().onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === "unassign-tab" && tab) {
      await unassignTab(tab.id, {
        showDesktopNotification: true,
        message: "Tab unassigned"
      });
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
      return Promise.all([
        getSlots(),
        getOptions(),
        getCommands(),
        getPlatformOs(),
        getActiveTab()
      ]).then(
        ([slots, options, commands, platformOs, activeTab]) =>
          buildPopupState(slots, options, commands, platformOs, activeTab?.id ?? null)
      );

    case "assign-slot":
      return getActiveTab().then(tab => assignSlot(message.slot, tab));

    case "jump-slot":
      return jumpSlot(message.slot);

    case "unassign-slot":
      return unassignSlot(message.slot);

    case "unassign-current-tab":
      return getActiveTab().then(tab =>
        tab
          ? unassignTab(tab.id, {
              showDesktopNotification: true,
              message: "Current tab unassigned"
            })
          : false
      );

    case "clear-all-slots":
      return clearAllSlots({ showDesktopNotification: true });

    case "save-options":
      return saveOptions(message.options || {});

    case "open-shortcut-settings":
      return openShortcutSettings();

    // for development/testing
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

  await browser.tabs.create({
    url: TabJumpPlatform.isFirefoxRuntime()
      ? "about:addons"
      : "chrome://extensions/shortcuts"
  });
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
  // Chrome MV3 context menus persist across service-worker restarts; rebuilding
  // them on every wake is unnecessary. Firefox MV2 keeps the v0.1.6 behavior.
  if (!TabJumpPlatform.isManifestV3())
    await rebuildContextMenus();

  await pruneMissingSlots();
  await registerToTst();
  await refreshAllTstBadges();
})();
