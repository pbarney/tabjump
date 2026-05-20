/*
 * TabJump browser API compatibility helpers.
 *
 * Firefox exposes Promise-based WebExtension APIs through `browser`.
 * Chrome/Chromium may expose only callback-based APIs through `chrome`,
 * so this file provides the small Promise-style surface TabJump uses.
 */
(function () {
  if (globalThis.TabJumpPlatform)
    return;

  function makeErrorFromLastError(lastError) {
    return lastError ? new Error(lastError.message || String(lastError)) : null;
  }

  function promisifyChromeMethod(scope, methodName) {
    if (!scope || typeof scope[methodName] !== "function")
      return undefined;

    return (...args) => new Promise((resolve, reject) => {
      try {
        const result = scope[methodName](...args, value => {
          const error = makeErrorFromLastError(globalThis.chrome?.runtime?.lastError);
          if (error) {
            reject(error);
            return;
          }

          resolve(value);
        });

        if (result && typeof result.then === "function")
          result.then(resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  function wrapChromeMessageEvent(event) {
    return {
      addListener(listener) {
        event.addListener((message, sender, sendResponse) => {
          try {
            const result = listener(message, sender, sendResponse);

            if (result && typeof result.then === "function") {
              result.then(
                value => sendResponse(value),
                error => {
                  console.error(error);
                  sendResponse(undefined);
                }
              );
              return true;
            }

            if (result !== undefined)
              sendResponse(result);
          } catch (error) {
            console.error(error);
            sendResponse(undefined);
          }

          return false;
        });
      }
    };
  }

  function createChromeBrowserShim(chromeApi) {
    const runtime = {
      getManifest: chromeApi.runtime.getManifest.bind(chromeApi.runtime),
      getURL: chromeApi.runtime.getURL.bind(chromeApi.runtime),
      getPlatformInfo: promisifyChromeMethod(chromeApi.runtime, "getPlatformInfo"),
      sendMessage: promisifyChromeMethod(chromeApi.runtime, "sendMessage"),
      openOptionsPage: promisifyChromeMethod(chromeApi.runtime, "openOptionsPage"),
      onInstalled: chromeApi.runtime.onInstalled,
      onStartup: chromeApi.runtime.onStartup,
      onMessage: wrapChromeMessageEvent(chromeApi.runtime.onMessage),
      onMessageExternal: wrapChromeMessageEvent(chromeApi.runtime.onMessageExternal)
    };

    const storage = {
      local: {
        get: promisifyChromeMethod(chromeApi.storage.local, "get"),
        set: promisifyChromeMethod(chromeApi.storage.local, "set")
      }
    };

    const tabs = {
      get: promisifyChromeMethod(chromeApi.tabs, "get"),
      query: promisifyChromeMethod(chromeApi.tabs, "query"),
      update: promisifyChromeMethod(chromeApi.tabs, "update"),
      create: promisifyChromeMethod(chromeApi.tabs, "create"),
      onRemoved: chromeApi.tabs.onRemoved,
      onUpdated: chromeApi.tabs.onUpdated,
      onAttached: chromeApi.tabs.onAttached
    };

    const windows = {
      update: promisifyChromeMethod(chromeApi.windows, "update"),
      onRemoved: chromeApi.windows.onRemoved
    };

    const commands = {
      getAll: promisifyChromeMethod(chromeApi.commands, "getAll"),
      onCommand: chromeApi.commands.onCommand
    };

    const notifications = chromeApi.notifications
      ? {
          create: promisifyChromeMethod(chromeApi.notifications, "create"),
          update: promisifyChromeMethod(chromeApi.notifications, "update"),
          clear: promisifyChromeMethod(chromeApi.notifications, "clear"),
          getPermissionLevel: promisifyChromeMethod(chromeApi.notifications, "getPermissionLevel")
        }
      : null;

    const actionApi = chromeApi.action || chromeApi.browserAction;
    const action = actionApi
      ? {
          setBadgeBackgroundColor: promisifyChromeMethod(actionApi, "setBadgeBackgroundColor"),
          setBadgeText: promisifyChromeMethod(actionApi, "setBadgeText")
        }
      : null;

    const contextMenuApi = chromeApi.contextMenus || chromeApi.menus;
    const menus = contextMenuApi
      ? {
          removeAll: promisifyChromeMethod(contextMenuApi, "removeAll"),
          create: contextMenuApi.create.bind(contextMenuApi),
          onClicked: contextMenuApi.onClicked
        }
      : null;

    return {
      runtime,
      storage,
      tabs,
      windows,
      commands,
      notifications,
      action,
      browserAction: action,
      contextMenus: menus,
      menus
    };
  }

  if (!globalThis.browser && globalThis.chrome)
    globalThis.browser = createChromeBrowserShim(globalThis.chrome);

  const api = globalThis.browser || globalThis.chrome;

  if (api) {
    if (!api.browserAction && api.action)
      api.browserAction = api.action;

    if (!api.action && api.browserAction)
      api.action = api.browserAction;

    if (!api.menus && api.contextMenus)
      api.menus = api.contextMenus;

    if (!api.contextMenus && api.menus)
      api.contextMenus = api.menus;
  }

  globalThis.TabJumpPlatform = {
    api,

    getManifest() {
      return api?.runtime?.getManifest ? api.runtime.getManifest() : {};
    },

    isFirefoxRuntime() {
      return Boolean(api?.runtime?.getBrowserInfo);
    },

    isFirefoxBuild() {
      return Boolean(this.getManifest().browser_specific_settings?.gecko);
    },

    isManifestV3() {
      return this.getManifest().manifest_version === 3;
    },

    getBrowserLabel() {
      return this.isFirefoxRuntime() ? "Firefox" : "Chrome/Chromium";
    },

    getOpenPopupCommandName() {
      return this.isManifestV3() ? "_execute_action" : "_execute_browser_action";
    },

    getActionContextName() {
      return this.isManifestV3() ? "action" : "browser_action";
    },

    getActionMenuContexts() {
      return [this.getActionContextName()];
    },

    supportsTabContextMenus() {
      return this.isFirefoxRuntime();
    },

    supportsTstBadges() {
      return this.isFirefoxRuntime();
    },

    supportsDefaultSlotShortcuts() {
      return this.isFirefoxRuntime();
    },

    supportsDesktopNotifications() {
      return Boolean(api?.notifications);
    }
  };
}());
