import * as threads from "./threads.js";
import * as instagram from "./instagram.js";
import * as bluesky from "./bluesky.js";
import * as x from "./x.js";
import * as reddit from "./reddit.js";

const DEFAULTS = { serverUrl: "http://localhost:3080", token: "" };

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

async function ingest(platform, items) {
  const { serverUrl, token } = await settings();
  const response = await fetch(`${serverUrl}/api/v1/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ platform, items }),
  });
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
};

async function syncUrl(platform) {
  if (platform === "threads") return "https://www.threads.com/saved#save-me-sync";
  if (platform === "bluesky") return "https://bsky.app/saved#save-me-sync";
  if (platform === "x") return "https://x.com/i/bookmarks#save-me-sync";
  // Redirects to the signed-in user's saved page; the hash survives the redirect.
  if (platform === "reddit") return "https://old.reddit.com/saved#save-me-sync";
  const { instagramUsername } = await chrome.storage.local.get("instagramUsername");
  if (!instagramUsername) throw new Error("Set your Instagram username in the popup first");
  return `https://www.instagram.com/${encodeURIComponent(instagramUsername)}/saved/all-posts/#save-me-sync`;
}

async function startSync(platform, fullSync) {
  // A sync that never finished (window closed, browser quit) may have left
  // older saves behind, and an incremental sync would stop before reaching
  // them. So the next one after it goes all the way through.
  const { statuses = {} } = await chrome.storage.local.get("statuses");
  if (statuses[platform]?.running) fullSync = true;
  await recordStatus(platform, { created: 0, seen: 0, error: null, running: true, fullSync });

  let url;
  try {
    url = await syncUrl(platform);
  } catch (error) {
    await recordStatus(platform, { running: false, error: error.message });
    return;
  }

  // Neither app loads more saves in a hidden tab, so the sync gets its own
  // visible window. A fresh load also guarantees the hook is in place before
  // the first page of saves arrives. relay.js starts scrolling when it sees
  // the hash.
  try {
    const syncWindow = await chrome.windows.create({ url, type: "popup", width: 520, height: 900 });
    await chrome.storage.local.set({ syncWindowId: syncWindow.id });
  } catch (error) {
    // Otherwise the platform would show as syncing forever.
    await recordStatus(platform, { running: false, error: error.message });
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
  if (message.type === "sync") {
    startSync(message.platform, message.fullSync).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "sync-done") {
    (async () => {
      await recordStatus(message.platform, { running: false });
      const { syncWindowId } = await chrome.storage.local.get("syncWindowId");
      // Only close the window the sync itself opened.
      if (sender.tab?.windowId === syncWindowId) {
        await chrome.storage.local.remove("syncWindowId");
        await chrome.windows.remove(syncWindowId);
      }
    })();
  }
});

// The toolbar icon opens (or closes) the glass panel on the current page.
// Chrome's own pages refuse injected scripts, so the click does nothing there.
chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["panel.js"] }).catch(() => {});
});
