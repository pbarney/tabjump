# TabJump lifecycle integration tests

These are development-only tests of the real browser APIs and the actual TabJump
background script. The runner needs no npm dependencies, network access, new
extension permissions, or mocked browser APIs. It does not automate the native
sidebar's DOM, styling, Firefox TST integration, or MV3 worker suspension.

## Build and launch

From the repo root:

```cmd
npm run build:test
```

The two testing distributions are in `dist/test/firefox` and `dist/test/chrome`.

The normal `npm run build` builds releases in `dist/firefox` and `dist/chrome`,
without creating the test versions, but it also removes the `dist/test`
directory, so you'll need to re-run the test build command before testing again.
The test bulds should *not* be submitted to the Chrome Web Store or to
addons.mozilla.org.

**Use a disposable browser profile, not your own profile.** The fixture windows
are real browser windows and the runner changes slot scope. It won't start if
there are any existing TabJump slot assignments. The Firefox test build has the
same extension ID as the normal build; don't load it in a profile that already
has the normal extension. Keep the runner tab open and don't interact with the
browser while the tests are running. An interrupted run can potentially leave
things in an incoherent state, so delete or reset the test profile if that
happens.


### Firefox

1. Create/switch to a disposable Firefox profile using `about:profiles`.
2. Open `about:debugging#/runtime/this-firefox` and choose **Load Temporary Add-on**.
3. Select `dist/test/firefox/manifest.json`.
4. Open the extension's **Inspect** toolbox and choose its Console, then run:

   ```js
   browser.tabs.create({
     url: browser.runtime.getURL("tests/lifecycle.html")
   });
   ```

5. In the newly opened runner tab, confirm the disposable profile and click
   **Run lifecycle tests**.

### Chrome/Chromium

1. Create or switch to a disposable Chrome/Chromium profile.

   **Chrome (for example):**
   ```bash
   "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --user-data-dir=c:\temp\brave-test-profile
   ```

   This will open a copy of your Chrome browser even if your usual one is already running.

   When the tests begin running, You'll want to select the "don't ask next time" checkbox on the "Close browser window" modal to save yourself some time.

   **Firefox (for example):**
   ```bash
   "C:\Program Files\Mozilla Firefox\firefox.exe" --no-remote --profile "C:\temp\firefox-test-profile"
   ```

   `--no-remote` will allow you to open a second copy of Firefox so you can test it in a clean profile while your current instance of Frefox remains running.

2. Open `chrome://extensions`, enable Developer mode, and load unpacked
   `dist/test/chrome`.
3. Open the extension's service-worker inspector and run this in its console:

   ```js
   chrome.tabs.create({ url: chrome.runtime.getURL("tests/lifecycle.html") });
   ```

   Alternatively, copy the extension ID from `chrome://extensions` and navigate
   to `chrome-extension://<extension-id>/tests/lifecycle.html`.

4. In the runner tab, confirm the disposable profile and click **Run lifecycle tests**.

## Coverage (20 scenarios)

Eight scenarios run in each scope, **Global** and **Per-window**, for a total of 16 scenarios:

1. Assign and unassign from the specified window, even while another window is focused.
2. Reassign the same tab and replace an occupied slot.
3. Rename the tab without changing its URL.
4. Change the URL without losing the assignment.
5. Activate a different tab and jump to the assigned tab, verifying window focus.
6. Move an assigned tab into another window and jump to it afterward.
7. Close an assigned tab without disturbing a surviving assignment.
8. Close a window with multiple assignments while preserving a surviving window's assignment.

And there are four additional scenarios:

1. Per-window: move into an occupied destination slot and displace the previous assignment.
2. Per-window: same slot number can be used independently in two windows.
3. Global → Per-window: distribute existing assignments to their respective windows.
4. Per-window → Global: require a choice and preserve the selected window's assignments.

In all, there are **20 integration tests**.

## Assertions and isolation

Each scenario creates its own test windows, with an anchor tab and local
fixture tabs. It uses the extension's own runtime messaging to assign,
unassign, jump, switch scope, and get `get-sidebar-state`. Each of the nine
slot views is checked against each test's expectations and independent browser
API queries for tab ID, window ID, title, URL, and active state. Move, close,
and jump tests check the actual browser outcome separately. Raw storage is read
for the empty-state guard and cleanup checks; test operations don't write slot
data directly.

Browser events are asynchronous. The runner uses condition-based polling with
an explicit timeout and a short stability interval, rather than a fixed wait
followed by a single assertion. Failing results contain the expected and actual
values, or the last error received.

The runner closes only windows it created. It verifies that assignments have
been removed before continuing. If isolation fails, it aborts rather than
silently clearing the evidence and running subsequent tests. Feedback options
are temporarily disabled, and original options are restored after successful
cleanup. The runner never modifies the product's production code and does not
require any additional manifest permissions. It displays pass/fail results
and prints the same report to the developer console. Copy results is best-effort.

A passing report verifies real-browser lifecycle behavior and TabJump state,
not that the native sidebar actually rendered every change. Continue to perform
manual popup/sidebar UI, keyboard, style, TST, and service-worker lifecycle QA.
