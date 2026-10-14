import * as threads from "./threads.js";
import * as instagram from "./instagram.js";
import * as bluesky from "./bluesky.js";
import * as x from "./x.js";
import * as reddit from "./reddit.js";
import * as youtube from "./youtube.js";
import * as tiktok from "./tiktok.js";

const DEFAULTS = { serverUrl: "http://localhost:3080", token: "" };

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

// Asks the server for the ingest token, so it never has to be copied by
// hand. The server only gives it to an extension (see
// ExtensionTokensController).
async function connect() {
  const { serverUrl } = await settings();
  try {
    const response = await fetch(`${serverUrl}/api/v1/extension_token`, { method: "POST" });
    if (!response.ok) return { ok: false, status: response.status };
    const { token } = await response.json();
    if (!token) return { ok: false };
    await chrome.storage.local.set({ token });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const { token } = await settings();
  if (!token) await connect();
});

async function ingest(platform, items, retried = false) {
  const { serverUrl, token } = await settings();
  const response = await fetch(`${serverUrl}/api/v1/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ platform, items }),
  });
  // A rejected token usually means the server was reinstalled with a new
  // one. Fetch it again and retry once.
  if (response.status === 401 && !retried && (await connect()).ok) return ingest(platform, items, true);
  if (!response.ok) throw new Error(`Server responded ${response.status}`);
  return response.json();
}

// Sync status is kept per platform, so the panel can show each one separately.
// Writes go through one queue so overlapping payloads can't overwrite each
// other's read-modify-write. `update` receives the current status.
let statusQueue = Promise.resolve();
function recordStatus(platform, update) {
  const run = async () => {
    const { statuses = {} } = await chrome.storage.local.get("statuses");
    const current = statuses[platform] ?? {};
    const patch = typeof update === "function" ? update(current) : update;
    statuses[platform] = { ...current, ...patch, at: new Date().toISOString() };
    await chrome.storage.local.set({ statuses });
    return statuses[platform];
  };
  statusQueue = statusQueue.then(run, run);
  return statusQueue;
}

// Sends one page of saves and tells the caller whether to keep going. In
// incremental mode, a page with nothing new means the rest is already synced.
async function ingestPage(platform, items) {
  if (!items.length) return { stop: false };

  try {
    const result = await ingest(platform, items);
    const status = await recordStatus(platform, (current) => ({
      created: (current.created ?? 0) + result.created,
      seen: (current.seen ?? 0) + items.length,
      error: result.errors.length ? `${result.errors.length} items rejected` : null,
      // New saves from browsing, outside a sync, can sit above older ones that
      // were never synced. An incremental sync would stop at them, so the next
      // sync goes all the way through.
      ...(!current.running && result.created > 0 ? { needsFull: true } : {}),
    }));
    // Each platform carries its own full-sync flag, so a normal sync started
    // on one platform can't cut short a full sync running on another.
    return { stop: !status.fullSync && result.created === 0 };
  } catch (error) {
    await recordStatus(platform, { error: error.message });
    return { stop: true };
  }
}

const PARSERS = {
  threads: (text) => threads.extractPosts(text).map(threads.toIngestItem),
  instagram: (text) => instagram.extractMedias(text).map(instagram.toIngestItem),
  bluesky: (text) => bluesky.extractBookmarks(text).map(bluesky.toIngestItem),
  x: (text) => x.extractTweets(text).map(x.toIngestItem),
  reddit: (text) => reddit.extractThings(text).map(reddit.toIngestItem),
  youtube: (text) => youtube.extractVideos(text).map(youtube.toIngestItem),
  tiktok: (text) => tiktok.extractItems(text).map(tiktok.toIngestItem),
};

async function syncUrl(platform) {
  if (platform === "threads") return "https://www.threads.com/saved#save-me-sync";
  if (platform === "bluesky") return "https://bsky.app/saved#save-me-sync";
  if (platform === "x") return "https://x.com/i/bookmarks#save-me-sync";
  // Redirects to the signed-in user's saved page; the hash survives the redirect.
  if (platform === "reddit") return "https://old.reddit.com/saved#save-me-sync";
  if (platform === "youtube") return "https://www.youtube.com/playlist?list=WL#save-me-sync";
  if (platform === "tiktok") {
    const { tiktokUsername } = await chrome.storage.local.get("tiktokUsername");
    if (!tiktokUsername) throw new Error("Set your TikTok username in settings first");
    return `https://www.tiktok.com/@${encodeURIComponent(tiktokUsername)}#save-me-sync`;
  }
  const { instagramUsername } = await chrome.storage.local.get("instagramUsername");
  if (!instagramUsername) throw new Error("Set your Instagram username in the popup first");
  return `https://www.instagram.com/${encodeURIComponent(instagramUsername)}/saved/all-posts/#save-me-sync`;
}

// Sync all runs one platform at a time: each sync needs its own visible
// window, so running them together would bury all but one. The rest wait in
// storage, so the queue survives the service worker being stopped.
//
// Starting a sync, finishing one, and moving down the queue all run through
// one lock. Otherwise a finish reported by the page and the user closing
// the window at the same moment could each start the next platform, or a
// window closed before its id was stored would never be seen as finished.
let syncLock = Promise.resolve();
function exclusive(task) {
  const run = syncLock.then(task, task);
  syncLock = run.catch(() => {});
  return run;
}

async function busy() {
  const { syncWindowId, syncQueue = [] } = await chrome.storage.local.get(["syncWindowId", "syncQueue"]);
  return Boolean(syncWindowId) || syncQueue.length > 0;
}

function requestSync(platform, fullSync) {
  return exclusive(async () => {
    if (!(await busy())) await startSync(platform, fullSync);
  });
}

function syncAll(platforms) {
  return exclusive(async () => {
    const [first, ...rest] = platforms;
    if (!first || (await busy())) return;
    await chrome.storage.local.set({ syncQueue: rest });
    await startSync(first, false);
  });
}

// Called with the lock held.
async function syncNext() {
  const { syncQueue = [] } = await chrome.storage.local.get("syncQueue");
  const [next, ...rest] = syncQueue;
  if (!next) return;
  await chrome.storage.local.set({ syncQueue: rest });
  await startSync(next, false);
}

// Ends the sync running in windowId, once: whichever of the page's
// sync-done and the window closing arrives second finds nothing to end.
function finishSync(windowId, statusPatch) {
  return exclusive(async () => {
    const { syncWindowId, syncPlatform } = await chrome.storage.local.get(["syncWindowId", "syncPlatform"]);
    if (!syncWindowId || windowId !== syncWindowId) return false;
    await chrome.storage.local.remove(["syncWindowId", "syncPlatform"]);
    if (syncPlatform) await recordStatus(syncPlatform, statusPatch);
    await syncNext();
    return true;
  });
}

// A sync can't survive the service worker starting fresh. After an extension
// update or reload, its window's relay.js is cut off and can't report
// sync-done, and after Chrome restarts, window ids no longer match. So at
// startup and install, close any leftover sync window and mark its platform
// stopped, with a full sync next time, and drop the queue it was in.
function clearStaleSyncs() {
  return exclusive(async () => {
    const { syncWindowId, statuses = {} } = await chrome.storage.local.get(["syncWindowId", "statuses"]);
    await chrome.storage.local.remove(["syncWindowId", "syncPlatform", "syncQueue"]);
    if (syncWindowId) await chrome.windows.remove(syncWindowId).catch(() => {});
    for (const [platform, status] of Object.entries(statuses)) {
      if (status.running) await recordStatus(platform, { running: false, needsFull: true });
    }
  });
}

chrome.runtime.onStartup.addListener(clearStaleSyncs);
chrome.runtime.onInstalled.addListener(clearStaleSyncs);

async function startSync(platform, fullSync) {
  // A sync that never finished (window closed, browser quit) may have left
  // older saves behind, and an incremental sync would stop before reaching
  // them. So the next one after it goes all the way through. The same goes
  // after browsing brought in new saves (needsFull, set in ingestPage).
  const { statuses = {} } = await chrome.storage.local.get("statuses");
  if (statuses[platform]?.running || statuses[platform]?.needsFull) fullSync = true;
  // Watch Later can be sorted oldest first, which puts new saves at the end,
  // so an incremental sync could stop before reaching them.
  if (platform === "youtube") fullSync = true;
  await recordStatus(platform, { created: 0, seen: 0, error: null, running: true, fullSync, needsFull: false });

  let url;
  try {
    url = await syncUrl(platform);
  } catch (error) {
    // Keep the full-sync flag for the next attempt; this one never started.
    await recordStatus(platform, { running: false, error: error.message, needsFull: fullSync });
    return syncNext();
  }

  // Neither app loads more saves in a hidden tab, so the sync gets its own
  // visible window. A fresh load also guarantees the hook is in place before
  // the first page of saves arrives. relay.js starts scrolling when it sees
  // the hash.
  try {
    const syncWindow = await chrome.windows.create({ url, type: "popup", width: 520, height: 900 });
    await chrome.storage.local.set({ syncWindowId: syncWindow.id, syncPlatform: platform });
  } catch (error) {
    // Otherwise the platform would show as syncing forever.
    await recordStatus(platform, { running: false, error: error.message, needsFull: fullSync });
    return syncNext();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "payload") {
    const parse = PARSERS[message.platform];
    if (!parse) return;
    ingestPage(message.platform, parse(message.text)).then(sendResponse);
    return true;
  }
  if (message.type === "platform-syncs") {
    // The panel runs inside the page, where CORS blocks calls to the server.
    settings()
      .then(({ serverUrl }) => fetch(`${serverUrl}/api/v1/platform_syncs`))
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then(sendResponse);
    return true;
  }
  if (message.type === "open-viewer") {
    // Reuse a viewer tab if one is open, so the button doesn't pile up tabs.
    settings().then(async ({ serverUrl }) => {
      const [tab] = await chrome.tabs.query({ url: `${serverUrl}/*` }).catch(() => []);
      if (tab) {
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
      } else {
        await chrome.tabs.create({ url: `${serverUrl}/` });
      }
    });
    return;
  }
  if (message.type === "connect") {
    connect().then(sendResponse);
    return true;
  }
  if (message.type === "open-options") {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (message.type === "sync") {
    requestSync(message.platform, message.fullSync).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "sync-all") {
    syncAll(message.platforms ?? []).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "sync-done") {
    (async () => {
      // A sync that couldn't start reading (no Favorites tab) reports why.
      const windowId = sender.tab?.windowId;
      const finished = await finishSync(windowId, message.error ? { running: false, error: message.error } : { running: false });
      // Only close the window the sync itself opened.
      if (finished) await chrome.windows.remove(windowId).catch(() => {});
    })();
  }
});

// The toolbar icon opens (or closes) the glass panel on the current page.
// Chrome's own pages refuse injected scripts, so the click does nothing there.
chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["panel.js"] }).catch(async () => {
    // Chrome's own pages (the new tab page, chrome://, the Web Store) refuse
    // injection. Explain in a popup rather than doing nothing. The popup is set
    // only long enough to open it, so the next click on a website still gets
    // the panel.
    await chrome.action.setPopup({ tabId: tab.id, popup: "help.html" });
    try {
      await chrome.action.openPopup({ windowId: tab.windowId });
    } catch {
      await chrome.tabs.create({ url: chrome.runtime.getURL("help.html") });
    } finally {
      await chrome.action.setPopup({ tabId: tab.id, popup: "" });
    }
  });
});

// Closing a sync window by hand ends that sync. Mark it stopped, with a full
// sync next time since it may have left saves behind, and let Sync all move
// on rather than wait for a window that is gone.
chrome.windows.onRemoved.addListener((windowId) => {
  finishSync(windowId, { running: false, needsFull: true, error: "Sync window was closed" });
});
