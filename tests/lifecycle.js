/* Real-browser integration tests. This file is included only in test builds. */
(() => {
  "use strict";

  // Firefox's native Promise API, or Chromium's native Promise API (116+).
  // Do not load platform.js here: the production shim only exposes the APIs
  // used by TabJump, not all of the window/tab creation and cleanup APIs.
  const api = globalThis.browser || globalThis.chrome;
  const TIMEOUT_MS = 12000;
  const POLL_MS = 100;
  const STABLE_MS = 250;
  const scopes = ["global", "per-window"];

  const runButton = document.getElementById("run");
  const copyButton = document.getElementById("copy");
  const confirmBox = document.getElementById("confirm");
  const summary = document.getElementById("summary");
  const results = document.getElementById("results");
  const isFirefox = typeof api?.runtime?.getBrowserInfo === "function";
  const manifest = api?.runtime?.getManifest();
  document.getElementById("environment").textContent =
    `${isFirefox ? "Firefox" : "Chromium"} · TabJump ${manifest?.version || "unknown"}`;

  let running = false;
  let fixtureCounter = 0;
  let runId = "";
  let report = [];
  const channel = new BroadcastChannel("tabjump-lifecycle-fixtures");

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const send = (type, extra = {}) => api.runtime.sendMessage({ type, ...extra });

  function assert(condition, message) {
    if (!condition)
      throw new Error(message);
  }

  function equal(actual, expected, label) {
    assert(Object.is(actual, expected),
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }

  // WebExtension operations can resolve before TabJump's asynchronous event
  // handlers finish. Retry assertions, and require a short stable interval
  // rather than declaring success on a single transient matching snapshot.
  async function eventually(label, check, timeout = TIMEOUT_MS) {
    const deadline = performance.now() + timeout;
    let firstMatch = null;
    let lastError;

    do {
      try {
        const value = await check();
        if (firstMatch === null)
          firstMatch = performance.now();
        if (performance.now() - firstMatch >= STABLE_MS)
          return value;
      } catch (error) {
        firstMatch = null;
        lastError = error;
      }
      await sleep(POLL_MS);
    } while (performance.now() < deadline);

    throw new Error(`${label} did not stabilize within ${timeout} ms` +
      (lastError ? `: ${lastError.message || lastError}` : ""));
  }

  function fixture() {
    const id = `${runId}-${++fixtureCounter}`;
    const url = new URL(api.runtime.getURL("tests/fixture.html"));
    url.searchParams.set("id", id);
    return { id, url: url.href, title: `TabJump fixture ${id}` };
  }

  async function readyTab(tabId, page) {
    return eventually("Fixture loaded", async () => {
      const tab = await api.tabs.get(tabId);
      equal(tab.status, "complete", "Browser tab status");
      equal(tab.url, page.url, "Browser fixture URL");
      equal(tab.title, page.title, "Browser fixture title");
      return tab;
    });
  }

  function makeContext() {
    const windows = new Set();

    return {
      windows,

      async newWindow() {
        const page = fixture();
        const win = await api.windows.create({
          type: "normal",
          url: page.url,
          focused: false
        });
        assert(Number.isInteger(win?.id), "Browser did not return a window ID");
        windows.add(win.id);

        // Keep this anchor tab open when a test moves or removes another tab.
        const anchor = await eventually("New test window contains its anchor", async () => {
          const tabs = await api.tabs.query({ windowId: win.id });
          equal(tabs.length, 1, "New test window tab count");
          return tabs[0];
        });
        await readyTab(anchor.id, page);
        return win.id;
      },

      async newTab(windowId) {
        assert(windows.has(windowId), "Refusing to create a tab outside a test window");
        const page = fixture();
        const tab = await api.tabs.create({ windowId, url: page.url, active: false });
        await readyTab(tab.id, page);
        return { ...page, tabId: tab.id };
      },

      async closeWindow(windowId) {
        assert(windows.has(windowId), "Refusing to close an untracked window");
        await api.windows.remove(windowId);
        await eventually("Browser closed test window", async () => {
          const open = await api.windows.getAll();
          assert(!open.some(win => win.id === windowId), `Window ${windowId} still exists`);
        });
        windows.delete(windowId);
      },

      async cleanup() {
        // Only close windows created by this particular test. Never enumerate
        // all windows and remove them indiscriminately.
        for (const windowId of [...windows]) {
          const open = await api.windows.getAll();
          if (open.some(win => win.id === windowId))
            await this.closeWindow(windowId);
          else
            windows.delete(windowId);
        }
        await eventually("Test assignment cleanup", assertNoAssignments);
      }
    };
  }

  async function assertNoAssignments() {
    const { slots = {}, windowSlots = {} } = await api.storage.local.get(["slots", "windowSlots"]);
    assert(!Object.values(slots).some(Boolean), "Global assignments are not empty");
    assert(!Object.values(windowSlots).some(map => Object.values(map || {}).some(Boolean)),
      "Per-window assignments are not empty");
  }

  // Only the normal public extension messages are used to modify assignments.
  async function setScope(scope) {
    const result = await send("change-slot-scope", { slotScope: scope });
    assert(result?.status === "changed" || result?.status === "unchanged",
      `Switch to ${scope} failed: ${JSON.stringify(result)}`);
    equal(result.options.slotScope, scope, "Scope change result");
  }

  async function activate(windowId, tabId) {
    await api.tabs.update(tabId, { active: true });
    await eventually("Browser active tab", async () => {
      const [active] = await api.tabs.query({ windowId, active: true });
      equal(active?.id, tabId, `Active tab in window ${windowId}`);
    });
  }

  async function assign(windowId, slot, tabId) {
    await activate(windowId, tabId);
    const entry = await send("assign-slot-from-sidebar", { windowId, slot });
    equal(entry?.tabId, tabId, "Assignment returned tab ID");
    equal(entry?.windowId, windowId, "Assignment returned window ID");
  }

  // Check the complete nine-slot view, including empty slots. Expected is an
  // explicit slot -> tab ID map, not derived from TabJump's own storage.
  // Each assigned slot's metadata is also checked against the *real* browser.
  async function checkView(scope, windowId, expected) {
    const state = await send("get-sidebar-state", { windowId });
    equal(state?.windowId, windowId, "Sidebar state window ID");
    equal(state?.slotScope, scope, "Sidebar state scope");
    equal(state?.slotViews?.length, 9, "Sidebar slot count");

    const [active] = await api.tabs.query({ windowId, active: true });
    assert(active, `Browser has no active tab in window ${windowId}`);
    for (let n = 1; n <= 9; n++) {
      const matches = state.slotViews.filter(slot => slot.slot === n);
      equal(matches.length, 1, `Slot ${n} occurrence count`);
      const slot = matches[0];
      const id = expected[n];
      equal(slot.assigned, id !== undefined, `Slot ${n} assigned`);
      if (id === undefined) {
        equal(slot.isCurrentTab, false, `Empty slot ${n} highlight`);
        continue;
      }

      const tab = await api.tabs.get(id);
      equal(slot.tabId, id, `Slot ${n} tab ID`);
      equal(slot.windowId, tab.windowId, `Slot ${n} browser window ID`);
      equal(slot.title, tab.title, `Slot ${n} browser title`);
      equal(slot.url, tab.url, `Slot ${n} browser URL`);
      equal(slot.isCurrentTab, tab.id === active.id, `Slot ${n} current-tab highlight`);
      if (scope === "per-window")
        equal(tab.windowId, windowId, `Slot ${n} belongs to sidebar window`);
    }
  }

  function expectViews(scope, ...views) {
    return eventually(`${scope} slot view(s)`, async () => {
      for (const [windowId, expected] of views)
        await checkView(scope, windowId, expected);
    });
  }

  async function expectTabClosed(tabId) {
    await eventually("Browser tab removed", async () => {
      const tabs = await api.tabs.query({});
      assert(!tabs.some(tab => tab.id === tabId), `Tab ${tabId} remains in browser`);
    });
  }

  async function expectMoved(tab, targetWindow) {
    await eventually("Browser moved tab", async () => {
      const actual = await api.tabs.get(tab.tabId);
      equal(actual.windowId, targetWindow, "Moved tab's browser window");
      equal(actual.title, tab.title, "Moved tab's title");
      equal(actual.url, tab.url, "Moved tab's URL");
    });
  }

  const tests = [];
  const test = (scope, name, fn) => tests.push({ scope, name: `${scope}: ${name}`, fn });

  for (const scope of scopes) {
    test(scope, "assign and unassign in the specified window", async ctx => {
      const a = await ctx.newWindow();
      const b = await ctx.newWindow();
      const tab = await ctx.newTab(a);
      const other = await ctx.newTab(b);
      await activate(a, tab.tabId);
      await activate(b, other.tabId);
      await api.windows.update(b, { focused: true });
      await eventually("Other window is focused", async () => {
        equal((await api.windows.get(b)).focused, true, "Window B focus before assignment");
      });
      const entry = await send("assign-slot-from-sidebar", { windowId: a, slot: 1 });
      equal(entry?.tabId, tab.tabId, "Assignment from unfocused window");
      equal(entry?.windowId, a, "Assignment window");
      await expectViews(scope, [a, { 1: tab.tabId }],
        [b, scope === "global" ? { 1: tab.tabId } : {}]);
      equal(await send("unassign-slot-from-sidebar", { windowId: a, slot: 1 }), true,
        "Unassign result");
      await expectViews(scope, [a, {}], [b, {}]);
      equal((await api.tabs.get(tab.tabId)).windowId, a, "Unassigned tab remains open");
    });

    test(scope, "reassign tab and replace occupied slot", async ctx => {
      const a = await ctx.newWindow();
      const first = await ctx.newTab(a);
      const second = await ctx.newTab(a);
      await assign(a, 1, first.tabId);
      await expectViews(scope, [a, { 1: first.tabId }]);
      await assign(a, 2, first.tabId);
      await expectViews(scope, [a, { 2: first.tabId }]);
      await assign(a, 2, second.tabId);
      await expectViews(scope, [a, { 2: second.tabId }]);
      equal((await api.tabs.get(first.tabId)).windowId, a, "Displaced tab remains open");
    });

    test(scope, "title change without navigation", async ctx => {
      const a = await ctx.newWindow();
      const tab = await ctx.newTab(a);
      await assign(a, 1, tab.tabId);
      await expectViews(scope, [a, { 1: tab.tabId }]);
      const newTitle = `${tab.title} renamed`;
      channel.postMessage({ id: tab.id, title: newTitle });
      await eventually("Browser title changed", async () => {
        const actual = await api.tabs.get(tab.tabId);
        equal(actual.title, newTitle, "Browser title");
        equal(actual.url, tab.url, "Browser URL remains unchanged");
      });
      await expectViews(scope, [a, { 1: tab.tabId }]);
    });

    test(scope, "URL change without losing assignment", async ctx => {
      const a = await ctx.newWindow();
      const tab = await ctx.newTab(a);
      await assign(a, 1, tab.tabId);
      await expectViews(scope, [a, { 1: tab.tabId }]);
      const changed = new URL(tab.url);
      changed.hash = "navigated";
      await api.tabs.update(tab.tabId, { url: changed.href });
      await eventually("Browser URL changed", async () => {
        const actual = await api.tabs.get(tab.tabId);
        equal(actual.url, changed.href, "Browser URL");
        equal(actual.title, tab.title, "Browser title remains unchanged");
      });
      await expectViews(scope, [a, { 1: tab.tabId }]);
    });

    test(scope, "activation and jump", async ctx => {
      const a = await ctx.newWindow();
      const b = await ctx.newWindow();
      const first = await ctx.newTab(a);
      const other = await ctx.newTab(a);
      await assign(a, 1, first.tabId);
      await expectViews(scope, [a, { 1: first.tabId }]);
      await activate(a, other.tabId);
      await expectViews(scope, [a, { 1: first.tabId }]);
      await api.windows.update(b, { focused: true });
      await eventually("Other window is focused", async () => {
        equal((await api.windows.get(b)).focused, true, "Window B focus before jump");
      });
      const source = scope === "global" ? b : a;
      equal(await send("jump-slot-from-sidebar", { windowId: source, slot: 1 }), true,
        "Jump result");
      await eventually("Browser activated and focused jump destination", async () => {
        const [active] = await api.tabs.query({ windowId: a, active: true });
        equal(active?.id, first.tabId, "Jump destination tab");
        equal((await api.windows.get(a)).focused, true, "Jump destination window focus");
      });
      await expectViews(scope, [a, { 1: first.tabId }],
        [b, scope === "global" ? { 1: first.tabId } : {}]);
    });

    test(scope, "move assigned tab to another window", async ctx => {
      const a = await ctx.newWindow();
      const b = await ctx.newWindow();
      const tab = await ctx.newTab(a);
      await assign(a, 1, tab.tabId);
      await expectViews(scope, [a, { 1: tab.tabId }]);
      await api.tabs.move(tab.tabId, { windowId: b, index: -1 });
      await expectMoved(tab, b);
      await expectViews(scope, [a, scope === "global" ? { 1: tab.tabId } : {}],
        [b, { 1: tab.tabId }]);

      // The moved assignment must still work in its new window.
      equal(await send("jump-slot-from-sidebar", { windowId: b, slot: 1 }), true,
        "Jump after moving");
      await eventually("Browser activated moved tab", async () => {
        const [active] = await api.tabs.query({ windowId: b, active: true });
        equal(active?.id, tab.tabId, "Moved tab is active");
      });
      await expectViews(scope, [b, { 1: tab.tabId }]);
    });

    test(scope, "close assigned tab", async ctx => {
      const a = await ctx.newWindow();
      const tab = await ctx.newTab(a);
      const survivor = await ctx.newTab(a);
      await assign(a, 1, tab.tabId);
      await assign(a, 2, survivor.tabId);
      await expectViews(scope, [a, { 1: tab.tabId, 2: survivor.tabId }]);
      await api.tabs.remove(tab.tabId);
      await expectTabClosed(tab.tabId);
      await expectViews(scope, [a, { 2: survivor.tabId }]);
      equal(await send("jump-slot-from-sidebar", { windowId: a, slot: 1 }), false,
        "Jump to closed tab returns false");
    });

    test(scope, "close window with assigned tabs", async ctx => {
      const a = await ctx.newWindow();
      const b = await ctx.newWindow();
      const tab = await ctx.newTab(a);
      const tab2 = await ctx.newTab(a);
      const survivor = await ctx.newTab(b);
      await assign(a, 1, tab.tabId);
      await assign(a, 2, tab2.tabId);
      await assign(b, 3, survivor.tabId);
      await expectViews(scope,
        [a, scope === "global" ? { 1: tab.tabId, 2: tab2.tabId, 3: survivor.tabId } : { 1: tab.tabId, 2: tab2.tabId }],
        [b, scope === "global" ? { 1: tab.tabId, 2: tab2.tabId, 3: survivor.tabId } : { 3: survivor.tabId }]);
      await ctx.closeWindow(a);
      await expectTabClosed(tab.tabId);
      await expectTabClosed(tab2.tabId);
      await expectViews(scope, [b, { 3: survivor.tabId }]);
      if (scope === "per-window") {
        await eventually("Closed window storage removed", async () => {
          const { windowSlots = {} } = await api.storage.local.get("windowSlots");
          assert(!Object.hasOwn(windowSlots, String(a)), `Closed window ${a} still in storage`);
        });
      }
    });
  }

  test("per-window", "moving into an occupied slot displaces the old tab", async ctx => {
    const a = await ctx.newWindow();
    const b = await ctx.newWindow();
    const mover = await ctx.newTab(a);
    const displaced = await ctx.newTab(b);
    const survivor = await ctx.newTab(b);
    await assign(a, 1, mover.tabId);
    await assign(b, 1, displaced.tabId);
    await assign(b, 2, survivor.tabId);
    await expectViews("per-window", [a, { 1: mover.tabId }],
      [b, { 1: displaced.tabId, 2: survivor.tabId }]);
    await api.tabs.move(mover.tabId, { windowId: b, index: -1 });
    await expectMoved(mover, b);
    await expectViews("per-window", [a, {}], [b, { 1: mover.tabId, 2: survivor.tabId }]);
    equal((await api.tabs.get(displaced.tabId)).windowId, b, "Displaced tab remains open");
  });

  test("per-window", "same slot number is independent across windows", async ctx => {
    const a = await ctx.newWindow();
    const b = await ctx.newWindow();
    const first = await ctx.newTab(a);
    const second = await ctx.newTab(b);
    await assign(a, 1, first.tabId);
    await assign(b, 1, second.tabId);
    await expectViews("per-window", [a, { 1: first.tabId }], [b, { 1: second.tabId }]);
    await api.windows.update(b, { focused: true });
    equal(await send("unassign-slot-from-sidebar", { windowId: a, slot: 1 }), true,
      "Window A unassign result");
    await expectViews("per-window", [a, {}], [b, { 1: second.tabId }]);
  });

  test("global", "migrate assignments to per-window scope", async ctx => {
    const a = await ctx.newWindow();
    const b = await ctx.newWindow();
    const first = await ctx.newTab(a);
    const second = await ctx.newTab(b);
    await assign(a, 1, first.tabId);
    await assign(b, 2, second.tabId);
    await expectViews("global", [a, { 1: first.tabId, 2: second.tabId }],
      [b, { 1: first.tabId, 2: second.tabId }]);
    await setScope("per-window");
    await expectViews("per-window", [a, { 1: first.tabId }], [b, { 2: second.tabId }]);
  });

  test("per-window", "migrate to global, preserving the selected window", async ctx => {
    const a = await ctx.newWindow();
    const b = await ctx.newWindow();
    const first = await ctx.newTab(a);
    const second = await ctx.newTab(b);
    await assign(a, 1, first.tabId);
    await assign(b, 1, second.tabId);
    await expectViews("per-window", [a, { 1: first.tabId }], [b, { 1: second.tabId }]);
    const result = await send("change-slot-scope", { slotScope: "global" });
    equal(result?.status, "choice-required", "Migration requires a choice");
    assert(result.choices.some(choice => choice.windowId === a), "Window A missing from choices");
    assert(result.choices.some(choice => choice.windowId === b), "Window B missing from choices");
    await expectViews("per-window", [a, { 1: first.tabId }], [b, { 1: second.tabId }]);
    const confirmed = await send("confirm-slot-scope-change", { slotScope: "global", keepWindowId: b });
    equal(confirmed?.status, "changed", "Migration confirmation");
    await expectViews("global", [a, { 1: second.tabId }], [b, { 1: second.tabId }]);
    equal((await api.tabs.get(first.tabId)).windowId, a, "Discarded assignment's tab remains open");
  });

  function record(status, name, detail = "") {
    const line = `${status.padEnd(7)} ${name}`;
    report.push(detail ? `${line}\n        ${detail}` : line);
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.className = "result-label";
    label.textContent = status;
    li.append(label, document.createTextNode(name));
    if (detail) {
      const pre = document.createElement("pre");
      pre.textContent = detail;
      li.append(pre);
    }
    results.append(li);
  }

  async function run() {
    if (running || !confirmBox.checked)
      return;
    running = true;
    runButton.disabled = true;
    copyButton.disabled = true;
    confirmBox.disabled = true;
    results.textContent = "";
    report = [`TabJump ${manifest.version} lifecycle tests (${isFirefox ? "Firefox" : "Chromium"})`,
      new Date().toISOString()];
    runId = Date.now().toString(36);
    fixtureCounter = 0;
    let passed = 0;
    let failed = 0;
    let originalOptions;
    let restoreOptions = false;
    let aborted = false;

    try {
      // Do not clear existing slots to make a run possible. Refuse instead.
      await assertNoAssignments();
      const saved = await api.storage.local.get("options");
      originalOptions = saved.options;
      restoreOptions = true;
      const updated = await send("save-options", { options: {
        showTstBadges: false,
        showActionBadgeFeedback: false,
        showDesktopNotifications: false
      } });
      assert(updated?.showTstBadges === false && updated?.showActionBadgeFeedback === false &&
        updated?.showDesktopNotifications === false, "Could not disable test feedback");

      for (const entry of tests) {
        const ctx = makeContext();
        summary.textContent = `Running ${passed + failed + 1}/${tests.length}: ${entry.name}`;
        let testError;
        let cleanupError;
        try {
          await assertNoAssignments();
          await setScope(entry.scope);
          await entry.fn(ctx);
        } catch (error) {
          testError = error;
        } finally {
          try {
            await ctx.cleanup();
          } catch (error) {
            cleanupError = error;
          }
        }
        if (testError || cleanupError) {
          failed++;
          record("FAIL", entry.name, [testError?.message, cleanupError && `Cleanup: ${cleanupError.message}`]
            .filter(Boolean).join("\n"));
        } else {
          passed++;
          record("PASS", entry.name);
        }
        // Do not contaminate subsequent tests if isolation has failed.
        if (cleanupError) {
          aborted = true;
          record("ABORT", "Remaining tests skipped because cleanup failed");
          break;
        }
      }
    } catch (error) {
      aborted = true;
      record("ABORT", "Suite could not proceed", error.message || String(error));
    } finally {
      if (restoreOptions) {
        try {
          // Restore the original scope through the real migration API only
          // when cleanup succeeded. A failed cleanup must not hide a bug by
          // migrating or clearing the leftover assignments.
          await assertNoAssignments();
          await setScope(originalOptions?.slotScope || "global");
          if (originalOptions === undefined)
            await api.storage.local.remove("options");
          else
            await api.storage.local.set({ options: originalOptions });
        } catch (error) {
          aborted = true;
          record("ABORT", "Original options not restored; inspect the test profile", error.message || String(error));
        }
      }
      const skipped = tests.length - passed - failed;
      const outcome = `${passed} passed, ${failed} failed, ${skipped} skipped${aborted ? " (aborted)" : ""}.`;
      report.push(outcome);
      summary.textContent = outcome;
      running = false;
      runButton.disabled = !confirmBox.checked;
      confirmBox.disabled = false;
      copyButton.disabled = false;
      // Results remain in this runner tab even if another window was focused.
      console.log(report.join("\n"));
    }
  }

  confirmBox.addEventListener("change", () => {
    runButton.disabled = running || !confirmBox.checked;
  });
  runButton.addEventListener("click", run);
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(report.join("\n"));
    } catch (_) {
      // If this browser blocks clipboard access, the console has the report.
      console.log(report.join("\n"));
      summary.textContent += " Copy unavailable; results also printed to the console.";
    }
  });
})();
