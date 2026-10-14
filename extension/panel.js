// The Save Me panel, drawn on top of the current page so its glass blurs the
// real page behind it (an extension popup is an opaque window). background.js
// injects this file each time the toolbar icon is clicked; a second click
// closes the panel. It lives in a closed shadow root so the page's styles and
// the panel's styles never touch.
(() => {
  if (globalThis.saveMePanel) {
    globalThis.saveMePanel.toggle();
    return;
  }

  const PLATFORMS = [
    { id: "threads", name: "Threads" },
    { id: "instagram", name: "Instagram" },
    { id: "bluesky", name: "Bluesky" },
    { id: "x", name: "X" },
    { id: "reddit", name: "Reddit" },
    { id: "youtube", name: "YouTube" },
    { id: "tiktok", name: "TikTok" },
  ];
  // Monochrome platform marks from Simple Icons (CC0), the same ones the viewer uses.
  const LOGOS = {
    threads: "M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z",
    instagram: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
    bluesky: "M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026",
    x: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
    reddit: "M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z",
    youtube: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
    tiktok: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  };
  // Platforms whose sync needs your username to find the saved page.
  const USERNAME_SETTING = { instagram: "instagramUsername", tiktok: "tiktokUsername" };

  const CSS = `
    :host {
      all: initial;
      --ink: #3d434c;
      --ink-soft: #6c737e;
      --slab: rgb(206 216 231 / 0.74);
      /* Thick molded rim: a soft light band inside the edge, brighter top-left, shaded bottom-right. */
      --slab-shadow:
        inset 0 0 0 1px rgb(255 255 255 / 0.55),
        inset 0 0 10px 7px rgb(255 255 255 / 0.36),
        inset 3px 4px 4px -1px rgb(255 255 255 / 0.85),
        inset -3px -4px 8px -2px rgb(96 106 122 / 0.22),
        0 2px 6px rgb(60 70 85 / 0.08),
        0 26px 50px -20px rgb(60 70 85 / 0.35);
      /* Buttons are just a lighter disc of the same glass: no border, no bevel. */
      --pill: rgb(255 255 255 / 0.4);
      --pill-hover: rgb(255 255 255 / 0.55);
      --pill-shadow: 0 1px 6px rgb(60 70 85 / 0.06);
      --divider: rgb(96 106 122 / 0.1);
      --divider-light: rgb(255 255 255 / 0.4);
      --field: rgb(218 226 238 / 0.6);
      --focus: rgb(90 97 107 / 0.35);
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 2147483647;
      width: 280px;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
      color: var(--ink);
      -webkit-font-smoothing: antialiased;
    }

    @media (prefers-color-scheme: dark) {
      :host {
        --ink: #e1e5ea;
        --ink-soft: #a6adb7;
        --slab: rgb(44 52 68 / 0.74);
        --slab-shadow:
          inset 0 0 0 1px rgb(255 255 255 / 0.1),
          inset 0 0 7px 5px rgb(255 255 255 / 0.05),
          inset 3px 4px 4px -1px rgb(255 255 255 / 0.14),
          inset -3px -4px 8px -2px rgb(0 0 0 / 0.35),
          0 26px 50px -20px rgb(0 0 0 / 0.7);
        --pill: rgb(255 255 255 / 0.1);
        --pill-hover: rgb(255 255 255 / 0.16);
        --pill-shadow: 0 1px 6px rgb(0 0 0 / 0.2);
        --divider: rgb(0 0 0 / 0.25);
        --divider-light: rgb(255 255 255 / 0.05);
        --field: rgb(30 34 40 / 0.5);
        --focus: rgb(201 206 214 / 0.4);
      }
    }

    * { box-sizing: border-box; }
    [hidden] { display: none !important; }

    .slab {
      background: var(--slab);
      border-radius: 30px;
      box-shadow: var(--slab-shadow);
      backdrop-filter: blur(36px) saturate(110%);
      -webkit-backdrop-filter: blur(36px) saturate(110%);
      overflow: hidden;
      animation: enter 200ms ease-out;
    }

    @keyframes enter {
      from { opacity: 0; transform: translateY(-6px) scale(0.98); }
    }

    .header {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 12px 10px 8px 18px;
    }

    h1 {
      flex: 1;
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .icon-button {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--ink-soft);
      cursor: pointer;
      transition: background 120ms ease, color 120ms ease;
    }

    .icon-button:hover {
      background: var(--pill);
      color: var(--ink);
    }

    .icon-button svg {
      width: 17px;
      height: 17px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* Etched dividers: a dark hairline with a light one under it. */
    .row {
      margin: 0 6px;
      padding: 8px 6px 8px 12px;
      border-top: 1px solid var(--divider);
      box-shadow: inset 0 1px 0 var(--divider-light);
    }

    .row:last-child { padding-bottom: 12px; }

    #platforms .row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .info { flex: 1; min-width: 0; }

    .logo {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      fill: currentColor;
    }

    .status {
      margin: 0;
      min-height: 1.4em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--ink-soft);
      font-variant-numeric: tabular-nums;
    }

    .status.error {
      color: var(--ink);
      font-weight: 600;
    }

    .button {
      height: 32px;
      padding: 0 18px;
      border: 0;
      border-radius: 999px;
      background: var(--pill);
      box-shadow: var(--pill-shadow);
      color: var(--ink);
      font: inherit;
      font-weight: 550;
      cursor: pointer;
      transition: background 120ms ease, opacity 120ms ease;
    }

    .button:hover:not(:disabled) { background: var(--pill-hover); }
    .icon-button:disabled { opacity: 0.45; cursor: default; background: transparent; }
    .icon-button.spinning svg { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .button:disabled { opacity: 0.45; cursor: default; }

    button:focus-visible, input:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }

    .hint {
      margin: 0;
      padding: 0 20px 12px;
      color: var(--ink-soft);
    }

    .hint code {
      font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
      color: var(--ink);
    }

    .footer { padding-top: 10px; }
    .footer .button { width: 100%; }

    .link {
      padding: 0;
      border: 0;
      background: none;
      color: var(--ink);
      font: inherit;
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;
    }

    @media (prefers-reduced-motion: reduce) {
      .slab { animation: none; }
      .button, .icon-button { transition: none; }
      .icon-button.spinning svg { animation: none; }
    }
  `;

  const ICONS = {
    settings:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    sync: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/></svg>',
  };

  const host = document.createElement("save-me-panel");
  const root = host.attachShadow({ mode: "closed" });
  // A constructed stylesheet, rather than a <style> tag, so strict page CSPs don't block it.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  root.adoptedStyleSheets = [sheet];

  root.innerHTML = `
    <div class="slab" role="dialog" aria-label="Save Me">
      <div id="home">
        <header class="header">
          <h1>Save Me</h1>
          <button id="openSettings" class="icon-button" type="button" aria-label="Settings">${ICONS.settings}</button>
          <button class="icon-button" type="button" aria-label="Close" data-close>${ICONS.close}</button>
        </header>
        <p id="setupHint" class="hint" hidden>
          Add your ingest token in <button type="button" class="link" id="hintSettings">settings</button> to start syncing.
        </p>
        <p id="offlineHint" class="hint" hidden>
          Save Me isn't running. Start it with <code>brew services start save-me</code>.
        </p>
        <div id="platforms"></div>
        <div class="row footer">
          <button id="openViewer" class="button" type="button">Open Save Me</button>
        </div>
      </div>

    </div>
  `;

  const $ = (id) => root.getElementById(id);

  // Settings live on the extension's own options page, never in this panel:
  // the panel sits inside arbitrary web pages, and the ingest token must not.
  const openSettings = () => chrome.runtime.sendMessage({ type: "open-options" });
  $("openSettings").addEventListener("click", openSettings);
  $("hintSettings").addEventListener("click", openSettings);
  $("openViewer").addEventListener("click", () => chrome.runtime.sendMessage({ type: "open-viewer" }));
  for (const button of root.querySelectorAll("[data-close]")) button.addEventListener("click", () => toggle());

  // Typing in the panel shouldn't trigger the site's keyboard shortcuts.
  for (const type of ["keydown", "keyup", "keypress"]) {
    root.addEventListener(type, (event) => {
      if (type === "keydown" && event.key === "Escape") toggle();
      event.stopPropagation();
    });
  }

  function friendlyError(message) {
    if (/401/.test(message)) return "Token rejected. Check settings.";
    if (/Failed to fetch|NetworkError/i.test(message)) return "Can't reach the server. Is it running?";
    return message;
  }

  // The time for today's syncs, the date for older ones.
  function lastSynced(iso) {
    const date = new Date(iso);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    const sameYear = date.getFullYear() === now.getFullYear();
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
  }

  function statusText(status, sync) {
    if (status?.running) return { text: `Syncing… ${status.created ?? 0} new`, error: false };
    if (status?.error) return { text: friendlyError(status.error), error: true };
    if (!sync?.synced_at) return { text: "Not synced yet", error: false };
    return { text: `${sync.count.toLocaleString()} saved · ${lastSynced(sync.synced_at)}`, error: false };
  }

  const cards = {};
  for (const platform of PLATFORMS) {
    const card = document.createElement("article");
    card.className = "row";
    card.setAttribute("aria-label", platform.name);
    // One Sync per platform: it stops at the first page with nothing new, and
    // on a first sync everything is new, so it also covers backfilling.
    // The logo stands in for the name; the article's label and the logo's
    // tooltip still say it.
    card.innerHTML = `
      <svg class="logo" viewBox="0 0 24 24" role="img"><title></title><path d="${LOGOS[platform.id]}"/></svg>
      <div class="info">
        <p class="status" aria-live="polite"></p>
      </div>
      <button type="button" class="icon-button">${ICONS.sync}</button>`;
    card.querySelector("title").textContent = platform.name;
    card.querySelector(".logo").setAttribute("aria-label", platform.name);
    const button = card.querySelector("button");
    button.title = `Sync ${platform.name}`;
    button.setAttribute("aria-label", `Sync ${platform.name}`);
    button.addEventListener("click", () =>
      chrome.runtime.sendMessage({ type: "sync", platform: platform.id, fullSync: false }),
    );
    $("platforms").appendChild(card);
    cards[platform.id] = card;
  }

  // Only whether a token exists is kept here, never the token itself.
  const values = { hasToken: false, instagramUsername: "", tiktokUsername: "", statuses: {} };

  function render() {
    const needsToken = !values.hasToken;
    $("setupHint").hidden = !needsToken;
    // platform-syncs answers null when the server can't be reached, and
    // values.syncs is undefined until that first answer arrives.
    const offline = values.syncs === null;
    const unavailable = offline || values.syncs === undefined;
    $("offlineHint").hidden = !offline;
    $("openViewer").disabled = unavailable;

    for (const platform of PLATFORMS) {
      const card = cards[platform.id];
      const status = values.statuses?.[platform.id];
      let { text, error } = statusText(status, values.syncs?.[platform.id]);
      const usernameSetting = USERNAME_SETTING[platform.id];
      if (usernameSetting && !values[usernameSetting] && !status?.running) {
        ({ text, error } = { text: "Add username in settings", error: false });
      }
      const line = card.querySelector(".status");
      line.textContent = text;
      line.classList.toggle("error", error);
      // Syncing while the server is down would crawl the whole page for nothing.
      const button = card.querySelector("button");
      button.disabled = needsToken || unavailable || Boolean(status?.running);
      button.classList.toggle("spinning", Boolean(status?.running));
    }
  }

  // Last-sync times come from the server, so they're right even for syncs
  // from before this panel existed. Refreshed when a sync finishes.
  async function loadSyncs() {
    values.syncs = (await chrome.runtime.sendMessage({ type: "platform-syncs" })) ?? null;
    render();
  }

  const onStorageChange = (changes) => {
    const finished = changes.statuses &&
      PLATFORMS.some(({ id }) => changes.statuses.oldValue?.[id]?.running && !changes.statuses.newValue?.[id]?.running);
    if (changes.token) values.hasToken = Boolean(changes.token.newValue);
    if (changes.instagramUsername) values.instagramUsername = changes.instagramUsername.newValue ?? "";
    if (changes.tiktokUsername) values.tiktokUsername = changes.tiktokUsername.newValue ?? "";
    if (changes.statuses) values.statuses = changes.statuses.newValue ?? {};
    render();
    if (finished) loadSyncs();
  };

  async function open() {
    const stored = await chrome.storage.local.get(["token", "instagramUsername", "tiktokUsername", "statuses"]);
    values.hasToken = Boolean(stored.token);
    values.instagramUsername = stored.instagramUsername ?? "";
    values.tiktokUsername = stored.tiktokUsername ?? "";
    values.statuses = stored.statuses ?? {};
    render();
    document.documentElement.appendChild(host);
    chrome.storage.onChanged.addListener(onStorageChange);
    loadSyncs();
  }

  function close() {
    host.remove();
    chrome.storage.onChanged.removeListener(onStorageChange);
  }

  function toggle() {
    host.isConnected ? close() : open();
  }

  globalThis.saveMePanel = { toggle };
  open();
})();
