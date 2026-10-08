// Isolated-world bridge: passes captured payloads from hook.js to the service
// worker, and drives auto-scroll when the page was opened by a sync.
const PLATFORMS_BY_HOST = {
  "www.threads.com": "threads",
  "www.instagram.com": "instagram",
  "bsky.app": "bluesky",
  "x.com": "x",
  "old.reddit.com": "reddit",
};
const PLATFORM = PLATFORMS_BY_HOST[location.hostname];
// Read at document_start, before the app's router can rewrite the URL.
const SYNCING = location.hash === "#save-me-sync";
let stopRequested = false;

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== "save-me-hook") return;
  chrome.runtime.sendMessage({ type: "payload", platform: PLATFORM, text: event.data.text }).then((result) => {
    // In incremental mode, a payload with nothing new means we've reached
    // saves that were already synced.
    if (result?.stop) stopRequested = true;
  }).catch(() => {});
});

if (SYNCING) window.addEventListener("load", PLATFORM === "reddit" ? syncRedditPage : autoscroll);

// Old Reddit renders saved items into the page and paginates with a "next"
// link instead of loading more as you scroll. Read this page's items, then
// follow "next" like a reader would, until a page has nothing new.
async function syncRedditPage() {
  const things = [...document.querySelectorAll("#siteTable > .thing[data-fullname]")].map((el) => ({
    fullname: el.dataset.fullname,
    permalink: el.dataset.permalink,
    author: el.dataset.author,
    subreddit: el.dataset.subredditPrefixed,
    url: el.dataset.url,
    timestamp: el.dataset.timestamp,
    title: el.querySelector("a.title")?.textContent?.trim() ?? null,
    body: el.querySelector(".usertext-body .md")?.innerText?.trim() ?? null,
    thumbnail: el.querySelector("a.thumbnail img")?.getAttribute("src") ?? el.dataset.thumbnail ?? null,
  }));

  const result = things.length
    ? await chrome.runtime.sendMessage({ type: "payload", platform: PLATFORM, text: JSON.stringify(things) }).catch(() => null)
    : null;
  const next = document.querySelector(".nav-buttons .next-button a")?.href;

  if (next && things.length && !result?.stop) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    location.href = `${next}#save-me-sync`;
  } else {
    chrome.runtime.sendMessage({ type: "sync-done", platform: PLATFORM }).catch(() => {});
  }
}

async function autoscroll() {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let lastHeight = 0;
  let stalls = 0;

  // Threads can take well over 10 seconds to fetch the next page, so only
  // give up after about 30 seconds without the page growing.
  for (let i = 0; i < 2000 && !stopRequested && stalls < 20; i++) {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await sleep(1500);
    const height = document.documentElement.scrollHeight;
    stalls = height === lastHeight ? stalls + 1 : 0;
    lastHeight = height;
  }

  chrome.runtime.sendMessage({ type: "sync-done", platform: PLATFORM }).catch(() => {});
}
