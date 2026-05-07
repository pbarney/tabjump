/*
 * Local popup mock.
 * Open popup-dev.html directly in a browser to style/test the popup without loading the add-on.
 */
(function () {
  if (globalThis.browser)
    return;

  const makeLongUrl = slot =>
    `https://example.com/projects/tabjump/issues/${slot}?` +
    `really_long_query_parameter_name=${"very-long-value-".repeat(12)}&` +
    `another_parameter=${"more-long-text-".repeat(8)}`;

  const state = {
    slots: {
      "1": {
        tabId: 101,
        windowId: 1,
        title: "GitHub issue: Add keyboard assignment handling for Tree Style Tab users",
        url: makeLongUrl(1)
      },
      "3": {
        tabId: 103,
        windowId: 1,
        title: "ChatGPT - TabJump design notes and extension popup development",
        url: makeLongUrl(3)
      },
      "7": {
        tabId: 107,
        windowId: 1,
        title: "Local test page",
        url: "http://localhost:8000/test-page.html"
      }
    },
    options: {
      badgeStyle: "circled",
      showTstBadges: true,
      showActionBadgeFeedback: true,
      slotScope: "global"
    },
    commands: []
  };

  for (let slot = 1; slot <= 9; slot++) {
    state.commands.push({ name: `jump-slot-${slot}`, shortcut: `Alt+${slot}` });
    state.commands.push({ name: `assign-slot-${slot}`, shortcut: `Alt+Shift+${slot}` });
  }

  globalThis.browser = {
    runtime: {
      async sendMessage(message) {
        switch (message.type) {
          case "get-state":
            return structuredClone(state);
          case "jump-slot":
            return Boolean(state.slots[String(message.slot)]);
          case "assign-slot":
            state.slots[String(message.slot)] = {
              tabId: 999,
              windowId: 1,
              title: "Mock current tab assigned from popup-dev.html",
              url: makeLongUrl(message.slot)
            };
            return state.slots[String(message.slot)];
          case "unassign-slot":
            delete state.slots[String(message.slot)];
            return true;
          case "unassign-current-tab":
            delete state.slots["3"];
            return true;
          case "clear-all-slots":
            state.slots = {};
            return true;
          default:
            return undefined;
        }
      },
      openOptionsPage() {
        console.log("Mock: openOptionsPage()");
      }
    }
  };
})();
