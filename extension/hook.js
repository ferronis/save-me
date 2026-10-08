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
  };
  const host = location.hostname;
  const rule = RULES[
    host.endsWith("instagram.com") ? "instagram" : host === "bsky.app" ? "bluesky" : host === "x.com" ? "x" : "threads"
  ];
  const send = (text) => window.postMessage({ source: "save-me-hook", text }, location.origin);
  const forward = (text) => { if (text.includes(rule.text)) send(text); };

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

  if (rule.embedded) {
    document.addEventListener("DOMContentLoaded", () => {
      for (const script of document.querySelectorAll('script[type="application/json"]')) forward(script.textContent);
    });
  }
})();
