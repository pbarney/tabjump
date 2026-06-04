/*
 * TabJump
 * v0.2.0 development build
 *
 * v0.2 scope:
 * - Global or per-window jump slots.
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
  const currentOptions = await getOptions();

  // Slot-scope changes are handled by explicit migration functions. Ordinary
  // option saves must not switch stores without migrating assignments.
  const options = normalizeOptions({
    ...currentOptions,
    ...nextOptions,
    slotScope: currentOptions.slotScope
  });

  await setStorage({ options });
  await refreshAllTstBadges();
  return options;
}

async function getSlots() {
  const { slots = emptySlotMap() } = await getStorage("slots");
  return isPlainObject(slots) ? slots : emptySlotMap();
}

async function saveSlots(slots) {
  await setStorage({ slots });
}

async function getWindowSlots() {
  const { windowSlots = {} } = await getStorage("windowSlots");
  return isPlainObject(windowSlots) ? windowSlots : {};
}

async function saveWindowSlots(windowSlots) {
  await setStorage({ windowSlots });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function windowKey(windowId) {
  return String(windowId);
}

function isPerWindowScope(options) {
  return options.slotScope === "per-window";
}

function countAssignedSlots(slotMap) {
  return Object.values(slotMap || {}).filter(Boolean).length;
}

function removeEmptyWindowSlotMap(windowSlots, key) {
  if (windowSlots[key] && countAssignedSlots(windowSlots[key]) === 0)
    delete windowSlots[key];
}

function sortedSlotEntries(slotMap) {
  return Object.entries(slotMap || {})
    .filter(([, entry]) => Boolean(entry))
    .sort(([a], [b]) => Number(a) - Number(b));
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

function buildPopupState(slots, options, commands, platformOs, currentTabId = null, activeWindowId = null) {
  const environment = getEnvironment();

  return {
    slots,
    options,
    commands,
    environment,
    activeWindowId,
    slotScopeLabel: isPerWindowScope(options) ? "Per-window slots" : "Global slots",
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
    } catch (error) {
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

async function getLastFocusedNormalWindow() {
  try {
    const win = await browser.windows.getLastFocused();
    return win && win.type === "normal" ? win : null;
  } catch (_) {
    return null;
  }
}

async function getActiveWindowId(tab = null) {
  if (tab && tab.windowId != null)
    return tab.windowId;

  const activeTab = await getActiveTab();
  if (activeTab && activeTab.windowId != null)
    return activeTab.windowId;

  const win = await getLastFocusedNormalWindow();
  return win?.id ?? null;
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

function truncateLabel(value, maxLength = 42) {
  const text = String(value || "").replace(/\s+/g, " ").trim();

  if (text.length <= maxLength)
    return text;

  return `${text.slice(0, maxLength - 1)}…`;
}

function formatAssignedSlotMessage(slot, tab) {
  const fallback = tab?.id == null ? "Tab" : `Tab ${tab.id}`;
  const title = truncateLabel(tab?.title || tab?.url || fallback, 64);
  return `Assigned Slot ${slot} to "${title}"`;
}

function findTabAssignmentInSlots(slots, tabId) {
  for (const [slot, entry] of sortedSlotEntries(slots)) {
    if (entry && entry.tabId === tabId)
      return { slot: Number(slot), entry };
  }

  return null;
}

function findTabAssignmentInWindowSlots(windowSlots, tabId) {
  const windowIds = Object.keys(windowSlots || {}).sort((a, b) => Number(a) - Number(b));

  for (const key of windowIds) {
    for (const [slot, entry] of sortedSlotEntries(windowSlots[key])) {
      if (entry && entry.tabId === tabId)
        return { windowId: Number(key), windowKey: key, slot: Number(slot), entry };
    }
  }

  return null;
}

function removeTabFromWindowSlots(windowSlots, tabId, except = {}) {
  let changed = false;

  for (const [key, slotMap] of Object.entries(windowSlots || {})) {
    for (const [slot, entry] of Object.entries(slotMap || {})) {
      if (!entry || entry.tabId !== tabId)
        continue;

      if (key === except.windowKey && String(slot) === String(except.slot))
        continue;

      delete slotMap[slot];
      changed = true;
    }

    removeEmptyWindowSlotMap(windowSlots, key);
  }

  return changed;
}

async function getScopedSlotsForPopup(options, activeTab = null) {
  if (!isPerWindowScope(options))
    return { slots: await getSlots(), activeWindowId: activeTab?.windowId ?? null };

  const activeWindowId = await getActiveWindowId(activeTab);
  if (activeWindowId == null)
    return { slots: emptySlotMap(), activeWindowId: null };

  const windowSlots = await getWindowSlots();
  return {
    slots: windowSlots[windowKey(activeWindowId)] || emptySlotMap(),
    activeWindowId
  };
}

async function assignSlot(slot, tab) {
  if (!isValidSlot(slot))
    throw new Error(`Invalid slot: ${slot}`);

  const targetTab = tab || await getActiveTab();
  if (!targetTab || targetTab.id == null)
    throw new Error("No active tab is available.");

  const options = await getOptions();

  if (isPerWindowScope(options))
    return assignSlotPerWindow(slot, targetTab);

  return assignSlotGlobal(slot, targetTab);
}

async function assignSlotGlobal(slot, targetTab) {
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
  await showSlotFeedbackNotification(formatAssignedSlotMessage(slot, targetTab));

  return slots[String(slot)];
}

async function assignSlotPerWindow(slot, targetTab) {
  const windowSlots = await getWindowSlots();
  const key = windowKey(targetTab.windowId);
  const slotKey = String(slot);
  const scopedSlots = windowSlots[key] || emptySlotMap();

  removeTabFromWindowSlots(windowSlots, targetTab.id);

  const previous = scopedSlots[slotKey];
  if (previous && previous.tabId !== targetTab.id)
    await clearTstBadgeForTab(previous.tabId);

  scopedSlots[slotKey] = tabToSlotEntry(targetTab);
  windowSlots[key] = scopedSlots;

  await saveWindowSlots(windowSlots);
  await setTstBadgeForTab(targetTab.id, slot);
  await flashBrowserActionBadge(`S${slot}`);
  await showSlotFeedbackNotification(formatAssignedSlotMessage(slot, targetTab));

  return scopedSlots[slotKey];
}

async function unassignSlot(slot) {
  if (!isValidSlot(slot))
    throw new Error(`Invalid slot: ${slot}`);

  const options = await getOptions();

  if (isPerWindowScope(options)) {
    const activeWindowId = await getActiveWindowId();
    return unassignSlotPerWindow(slot, activeWindowId);
  }

  return unassignSlotGlobal(slot);
}

async function unassignSlotGlobal(slot) {
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

async function unassignSlotPerWindow(slot, activeWindowId) {
  if (activeWindowId == null)
    return false;

  const windowSlots = await getWindowSlots();
  const key = windowKey(activeWindowId);
  const scopedSlots = windowSlots[key] || emptySlotMap();
  const previous = scopedSlots[String(slot)];

  if (!previous)
    return false;

  delete scopedSlots[String(slot)];
  removeEmptyWindowSlotMap(windowSlots, key);

  await saveWindowSlots(windowSlots);
  await clearTstBadgeForTab(previous.tabId);
  await flashBrowserActionBadge(`–${slot}`);
  await showSlotFeedbackNotification(`Slot ${slot} unassigned`);
  return true;
}

async function unassignTab(tabId, feedback = {}) {
  const options = await getOptions();
  const removed = isPerWindowScope(options)
    ? await unassignTabPerWindow(tabId)
    : await unassignTabGlobal(tabId);

  if (!removed)
    return false;

  await clearTstBadgeForTab(tabId);
  await flashBrowserActionBadge("–");

  if (feedback.showDesktopNotification) {
    await showSlotFeedbackNotification(
      feedback.message || "Tab unassigned"
    );
  }

  return true;
}

async function unassignTabGlobal(tabId) {
  const slots = await getSlots();
  let removed = false;

  for (const [slot, entry] of Object.entries(slots)) {
    if (entry && entry.tabId === tabId) {
      delete slots[slot];
      removed = true;
    }
  }

  if (removed)
    await saveSlots(slots);

  return removed;
}

async function unassignTabPerWindow(tabId) {
  const windowSlots = await getWindowSlots();
  const removed = removeTabFromWindowSlots(windowSlots, tabId);

  if (removed)
    await saveWindowSlots(windowSlots);

  return removed;
}

async function jumpSlot(slot) {
  if (!isValidSlot(slot))
    throw new Error(`Invalid slot: ${slot}`);

  const options = await getOptions();
  const entry = isPerWindowScope(options)
    ? await getPerWindowJumpEntry(slot)
    : (await getSlots())[String(slot)];

  if (!entry)
    return false;

  const tab = await getTabSafe(entry.tabId);
  if (!tab) {
    await unassignTab(entry.tabId);
    await flashBrowserActionBadge("gone");
    return false;
  }

  await browser.windows.update(tab.windowId, { focused: true });
  await browser.tabs.update(tab.id, { active: true });
  return true;
}

async function getPerWindowJumpEntry(slot) {
  const activeWindowId = await getActiveWindowId();
  if (activeWindowId == null)
    return null;

  const windowSlots = await getWindowSlots();
  return windowSlots[windowKey(activeWindowId)]?.[String(slot)] || null;
}

async function clearAllSlots(feedback = {}) {
  const options = await getOptions();

  if (isPerWindowScope(options) && !feedback.allWindows)
    return clearCurrentWindowSlots(feedback);

  const hadSlots = isPerWindowScope(options)
    ? countAssignedWindowSlots(await getWindowSlots()) > 0
    : Object.keys(await getSlots()).length > 0;

  await setStorage({ slots: emptySlotMap(), windowSlots: {} });
  await clearAllTstBadges();
  await flashBrowserActionBadge("clr");

  if (hadSlots && feedback.showDesktopNotification)
    await showSlotFeedbackNotification("All jump slots cleared");

  return { changed: hadSlots, scope: "all" };
}

async function clearCurrentWindowSlots(feedback = {}) {
  const activeWindowId = await getActiveWindowId();
  if (activeWindowId == null)
    return { changed: false, scope: "per-window" };

  const windowSlots = await getWindowSlots();
  const key = windowKey(activeWindowId);
  const scopedSlots = windowSlots[key] || emptySlotMap();
  const removedTabIds = sortedSlotEntries(scopedSlots)
    .map(([, entry]) => entry.tabId)
    .filter(tabId => tabId != null);

  const hadSlots = removedTabIds.length > 0;
  delete windowSlots[key];

  await saveWindowSlots(windowSlots);

  for (const tabId of removedTabIds)
    await clearTstBadgeForTab(tabId);

  await flashBrowserActionBadge("clr");

  if (hadSlots && feedback.showDesktopNotification)
    await showSlotFeedbackNotification("Current-window jump slots cleared");

  return { changed: hadSlots, scope: "per-window" };
}

function countAssignedWindowSlots(windowSlots) {
  return Object.values(windowSlots || {}).reduce(
    (total, slotMap) => total + countAssignedSlots(slotMap),
    0
  );
}

async function pruneMissingSlots() {
  const slots = await getSlots();
  const windowSlots = await getWindowSlots();
  let slotsChanged = false;
  let windowSlotsChanged = false;

  for (const [slot, entry] of Object.entries(slots)) {
    if (!entry || !await getTabSafe(entry.tabId)) {
      delete slots[slot];
      slotsChanged = true;
    }
  }

  for (const [key, slotMap] of Object.entries(windowSlots)) {
    for (const [slot, entry] of Object.entries(slotMap || {})) {
      if (!entry || !await getTabSafe(entry.tabId)) {
        delete slotMap[slot];
        windowSlotsChanged = true;
      }
    }

    const before = Boolean(windowSlots[key]);
    removeEmptyWindowSlotMap(windowSlots, key);
    if (before && !windowSlots[key])
      windowSlotsChanged = true;
  }

  const updates = {};
  if (slotsChanged)
    updates.slots = slots;
  if (windowSlotsChanged)
    updates.windowSlots = windowSlots;

  if (slotsChanged || windowSlotsChanged)
    await setStorage(updates);

  return { slots, windowSlots };
}

async function updateSlotSnapshot(tabId) {
  const options = await getOptions();

  if (isPerWindowScope(options))
    return updateSlotSnapshotPerWindow(tabId);

  return updateSlotSnapshotGlobal(tabId);
}

async function updateSlotSnapshotGlobal(tabId) {
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

async function updateSlotSnapshotPerWindow(tabId) {
  const windowSlots = await getWindowSlots();
  const found = findTabAssignmentInWindowSlots(windowSlots, tabId);

  if (!found)
    return;

  const tab = await getTabSafe(tabId);
  if (!tab) {
    await unassignTabPerWindow(tabId);
    await clearTstBadgeForTab(tabId);
    return;
  }

  if (windowKey(tab.windowId) !== found.windowKey) {
    await moveAssignedTabToWindow(tabId, tab);
    return;
  }

  const slotMap = windowSlots[found.windowKey];
  slotMap[String(found.slot)] = {
    ...found.entry,
    ...tabToSlotEntry(tab),
    assignedAt: found.entry.assignedAt
  };

  await saveWindowSlots(windowSlots);
}

async function moveAssignedTabToWindow(tabId, tab = null) {
  const targetTab = tab || await getTabSafe(tabId);

  if (!targetTab) {
    await unassignTab(tabId);
    return false;
  }

  const windowSlots = await getWindowSlots();
  const found = findTabAssignmentInWindowSlots(windowSlots, tabId);

  if (!found)
    return false;

  const sourceKey = found.windowKey;
  const targetKey = windowKey(targetTab.windowId);
  const slotKey = String(found.slot);
  const targetSlotMap = windowSlots[targetKey] || emptySlotMap();
  const displaced = targetSlotMap[slotKey] && targetSlotMap[slotKey].tabId !== tabId
    ? targetSlotMap[slotKey]
    : null;

  removeTabFromWindowSlots(windowSlots, tabId, {
    windowKey: sourceKey,
    slot: slotKey
  });

  if (sourceKey !== targetKey && windowSlots[sourceKey]?.[slotKey]?.tabId === tabId)
    delete windowSlots[sourceKey][slotKey];

  removeEmptyWindowSlotMap(windowSlots, sourceKey);

  targetSlotMap[slotKey] = {
    ...found.entry,
    ...tabToSlotEntry(targetTab),
    assignedAt: found.entry.assignedAt
  };
  windowSlots[targetKey] = targetSlotMap;

  await saveWindowSlots(windowSlots);

  if (displaced)
    await clearTstBadgeForTab(displaced.tabId);

  await setTstBadgeForTab(targetTab.id, found.slot);

  if (displaced) {
    await flashBrowserActionBadge(`S${found.slot}`);
    await showSlotFeedbackNotification(`Slot ${found.slot} reassigned to moved tab.`);
  }

  return true;
}

async function assignedSlotsByTab() {
  const options = await getOptions();
  const { slots, windowSlots } = await pruneMissingSlots();
  const assignedByTab = new Map();

  if (!isPerWindowScope(options)) {
    for (const [slot, entry] of sortedSlotEntries(slots)) {
      if (entry && entry.tabId != null)
        assignedByTab.set(entry.tabId, Number(slot));
    }

    return assignedByTab;
  }

  for (const slotMap of Object.values(windowSlots || {})) {
    for (const [slot, entry] of sortedSlotEntries(slotMap)) {
      if (entry && entry.tabId != null)
        assignedByTab.set(entry.tabId, Number(slot));
    }
  }

  return assignedByTab;
}

function buildWindowChoice(windowId, slotMap, currentWindowId, recommendedWindowId) {
  const count = countAssignedSlots(slotMap);
  const preview = sortedSlotEntries(slotMap)
    .slice(0, 3)
    .map(([slot, entry]) => {
      const title = entry.title || shortenUrlForDisplay(entry.url) || `Tab ${entry.tabId}`;
      return `${slot} ${truncateLabel(title)}`;
    })
    .join(", ");
  const suffix = count > 3 ? `, +${count - 3} more` : "";
  const labelPrefix = windowId === currentWindowId ? "Current window" : `Window ${windowId}`;
  const recommended = windowId === recommendedWindowId;

  return {
    windowId,
    count,
    recommended,
    label: `${labelPrefix}, ${count} slot${count === 1 ? "" : "s"}: ${preview}${suffix}`
  };
}

async function getPerWindowToGlobalChoices() {
  await pruneMissingSlots();

  const windowSlots = await getWindowSlots();
  const lastFocusedWindow = await getLastFocusedNormalWindow();
  const currentWindowId = lastFocusedWindow?.id ?? null;
  const assignedWindowIds = Object.keys(windowSlots)
    .filter(key => countAssignedSlots(windowSlots[key]) > 0)
    .map(Number)
    .sort((a, b) => a - b);
  const recommendedWindowId = assignedWindowIds.includes(currentWindowId)
    ? currentWindowId
    : assignedWindowIds[0] ?? null;

  return {
    choices: assignedWindowIds.map(windowId =>
      buildWindowChoice(
        windowId,
        windowSlots[windowKey(windowId)],
        currentWindowId,
        recommendedWindowId
      )
    ),
    recommendedWindowId
  };
}

async function migrateGlobalToPerWindow() {
  const options = await getOptions();
  const { slots } = await pruneMissingSlots();
  const windowSlots = {};

  for (const [slot, entry] of sortedSlotEntries(slots)) {
    if (!entry || entry.windowId == null)
      continue;

    const key = windowKey(entry.windowId);
    windowSlots[key] ||= emptySlotMap();
    windowSlots[key][slot] = entry;
  }

  const nextOptions = normalizeOptions({ ...options, slotScope: "per-window" });
  await setStorage({ slots: emptySlotMap(), windowSlots, options: nextOptions });
  await refreshAllTstBadges();
  return nextOptions;
}

async function migratePerWindowToGlobal(keepWindowId = null) {
  const options = await getOptions();
  const { windowSlots } = await pruneMissingSlots();
  const chosenSlots = keepWindowId == null
    ? emptySlotMap()
    : { ...(windowSlots[windowKey(keepWindowId)] || emptySlotMap()) };
  const nextOptions = normalizeOptions({ ...options, slotScope: "global" });

  await setStorage({ slots: chosenSlots, windowSlots: {}, options: nextOptions });
  await refreshAllTstBadges();
  return nextOptions;
}

async function requestSlotScopeChange(slotScope) {
  if (!["global", "per-window"].includes(slotScope))
    throw new Error(`Invalid slot scope: ${slotScope}`);

  const options = await getOptions();

  if (options.slotScope === slotScope)
    return { status: "unchanged", options };

  if (slotScope === "per-window") {
    const nextOptions = await migrateGlobalToPerWindow();
    return { status: "changed", options: nextOptions };
  }

  const { choices, recommendedWindowId } = await getPerWindowToGlobalChoices();

  if (choices.length > 1)
    return { status: "choice-required", choices, recommendedWindowId, options };

  const nextOptions = await migratePerWindowToGlobal(choices[0]?.windowId ?? null);
  return { status: "changed", options: nextOptions };
}

async function confirmSlotScopeChange(slotScope, keepWindowId = null) {
  if (slotScope !== "global")
    throw new Error(`Unsupported confirmed slot scope: ${slotScope}`);

  const nextOptions = await migratePerWindowToGlobal(keepWindowId);
  return { status: "changed", options: nextOptions };
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
          margin-block-start: 0.25rem;
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

  const assignedByTab = await assignedSlotsByTab();

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
    const options = await getOptions();

    if (isPerWindowScope(options)) {
      const windowSlots = await getWindowSlots();
      const key = windowKey(windowId);

      if (windowSlots[key]) {
        delete windowSlots[key];
        await saveWindowSlots(windowSlots);
      }

      return;
    }

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
        getOptions(),
        getCommands(),
        getPlatformOs(),
        getActiveTab()
      ]).then(async ([options, commands, platformOs, activeTab]) => {
        const scoped = await getScopedSlotsForPopup(options, activeTab);
        return buildPopupState(
          scoped.slots,
          options,
          commands,
          platformOs,
          activeTab?.id ?? null,
          scoped.activeWindowId
        );
      });

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
      return clearAllSlots({
        showDesktopNotification: true,
        allWindows: Boolean(message.allWindows)
      });

    case "save-options":
      return saveOptions(message.options || {});

    case "change-slot-scope":
      return requestSlotScopeChange(message.slotScope);

    case "confirm-slot-scope-change":
      return confirmSlotScopeChange(message.slotScope, message.keepWindowId);

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
  // TabJump intentionally treats assignments as live-session state, not restored session state.
  await clearAllSlots({ allWindows: true });
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
