// Runs in the page's own JS world at document_start, before the app caches a
// reference to fetch or XMLHttpRequest. Forwards any response that carries
// saved posts to relay.js; all parsing happens in the service worker.
(() => {
  const RULES = {
    // Threads: GraphQL responses (and the first page, embedded in the HTML)
    // that contain the saved_media connection.
    threads: { url: "/graphql", text: "saved_media", embedded: true },
    // Instagram: the saved-posts feed the web app requests itself.
    instagram: { url: "/feed/saved/", text: '"items"', embedded: false },
    // Bluesky: the official bookmarks endpoint, called on the user's PDS.
    bluesky: { url: "app.bsky.bookmark.getBookmarks", text: '"bookmarks"', embedded: false },
    // X: the GraphQL Bookmarks timeline the bookmarks page loads as you scroll.
    x: { url: "/Bookmarks", text: "bookmark_timeline", embedded: false },
    // YouTube: Watch Later's first page (window.ytInitialData) and the browse
    // continuations it loads as you scroll. The same endpoint serves every
    // page on YouTube, so only forward while Watch Later is open.
    youtube: {
      url: "/youtubei/v1/browse",
      // Watch Later still uses playlistVideoRenderer; other playlists use lockups.
      text: ["playlistVideoRenderer", "lockupViewModel"],
      embedded: false,
      initialData: "ytInitialData",
      page: () => location.pathname === "/playlist" && new URLSearchParams(location.search).get("list") === "WL",
    },
    // TikTok: the Favorites tab on your profile.
    tiktok: { url: "/api/user/collect/item_list", text: '"itemList"', embedded: false },
  };
  const host = location.hostname;
  const rule = RULES[
    host.endsWith("instagram.com") ? "instagram"
    : host === "bsky.app" ? "bluesky"
    : host === "x.com" ? "x"
    : host.endsWith("youtube.com") ? "youtube"
    : host.endsWith("tiktok.com") ? "tiktok"
    : "threads"
  ];
  const send = (text) => window.postMessage({ source: "save-me-hook", text }, location.origin);
  const forward = (text) => {
    const marks = [rule.text].flat();
    if (marks.some((mark) => text.includes(mark)) && (!rule.page || rule.page())) send(text);
  };

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url ?? "";
      if (url.includes(rule.url)) response.clone().text().then(forward).catch(() => {});
    } catch {}
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (String(url).includes(rule.url)) {
      this.addEventListener("load", () => {
        // responseText throws for non-text responseTypes.
        try {
          forward(this.responseText);
        } catch {}
      });
    }
    return originalOpen.call(this, method, url, ...rest);
  };

  if (rule.initialData) {
    document.addEventListener("DOMContentLoaded", () => {
      const data = window[rule.initialData];
      if (data) forward(JSON.stringify(data));
    });
  }

  if (rule.embedded) {
    document.addEventListener("DOMContentLoaded", () => {
      for (const script of document.querySelectorAll('script[type="application/json"]')) forward(script.textContent);
    });
  }
})();
