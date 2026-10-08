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
  ];
  const FIELDS = ["serverUrl", "token", "instagramUsername"];
  const DEFAULTS = { serverUrl: "http://localhost:3080", token: "", instagramUsername: "" };

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
      width: 320px;
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
      padding: 16px 14px 10px 20px;
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
      padding: 14px 14px;
      border-top: 1px solid var(--divider);
      box-shadow: inset 0 1px 0 var(--divider-light);
    }

    .row:last-child { padding-bottom: 18px; }

    #platforms .row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .info { flex: 1; min-width: 0; }

    h2 {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
    }

    .status {
      margin: 2px 0 0;
      min-height: 1.4em;
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

    .settings-form {
      display: flex;
      flex-direction: column;
    }

    label { margin-top: 12px; font-weight: 600; }
    label:first-child { margin-top: 0; }

    input {
      margin-top: 6px;
      height: 34px;
      padding: 0 14px;
      border: 0;
      border-radius: 999px;
      background: var(--field);
      box-shadow: inset 1px 2px 3px rgb(96 106 122 / 0.15), inset -1px -1px 1px rgb(255 255 255 / 0.5);
      color: var(--ink);
      font: inherit;
    }

    input::placeholder { color: var(--ink-soft); }

    .help { margin: 6px 0 0 14px; color: var(--ink-soft); font-size: 12px; }
    code { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
    .saved { margin: 10px 0 0; min-height: 1.4em; color: var(--ink-soft); font-size: 12px; }

    @media (prefers-reduced-motion: reduce) {
      .slab { animation: none; }
      .button, .icon-button { transition: none; }
    }
  `;

  const ICONS = {
    settings:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
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
        <div id="platforms"></div>
      </div>

      <div id="settings" hidden>
        <header class="header">
          <button id="closeSettings" class="icon-button" type="button" aria-label="Back">${ICONS.back}</button>
          <h1>Settings</h1>
          <button class="icon-button" type="button" aria-label="Close" data-close>${ICONS.close}</button>
        </header>
        <form class="row settings-form" autocomplete="off">
          <label for="serverUrl">Server</label>
          <input id="serverUrl" type="url" spellcheck="false" />
          <label for="token">Ingest token</label>
          <input id="token" type="password" spellcheck="false" />
          <p class="help">The <code>INGEST_TOKEN</code> from the server's <code>.env</code>.</p>
          <label for="instagramUsername">Instagram username</label>
          <input id="instagramUsername" type="text" spellcheck="false" placeholder="yourname" />
          <p class="help">Used to open your saved posts page.</p>
          <p id="saved" class="saved" aria-live="polite"></p>
        </form>
      </div>
    </div>
  `;

  const $ = (id) => root.getElementById(id);

  // Move focus for keyboard users, but without the focus ring: the ring
  // should only appear when someone is actually tabbing.
  function showSettings(open) {
    $("home").hidden = open;
    $("settings").hidden = !open;
    (open ? $("serverUrl") : $("openSettings")).focus({ focusVisible: false });
  }

  $("openSettings").addEventListener("click", () => showSettings(true));
  $("hintSettings").addEventListener("click", () => showSettings(true));
  $("closeSettings").addEventListener("click", () => showSettings(false));
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

  function lastSynced(iso) {
    const date = new Date(iso);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
    const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `${day}, ${time}`;
  }

  function statusText(status, sync) {
    if (status?.running) return { text: `Syncing… ${status.seen ?? 0} seen, ${status.created ?? 0} new`, error: false };
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
    card.innerHTML = `
      <div class="info">
        <h2></h2>
        <p class="status" aria-live="polite"></p>
      </div>
      <button type="button" class="button">Sync</button>`;
    card.querySelector("h2").textContent = platform.name;
    const button = card.querySelector("button");
    button.setAttribute("aria-label", `Sync ${platform.name}`);
    button.addEventListener("click", () =>
      chrome.runtime.sendMessage({ type: "sync", platform: platform.id, fullSync: false }),
    );
    $("platforms").appendChild(card);
    cards[platform.id] = card;
  }

  const values = { ...DEFAULTS };

  function render() {
    const needsToken = !values.token;
    $("setupHint").hidden = !needsToken;

    for (const platform of PLATFORMS) {
      const card = cards[platform.id];
      const status = values.statuses?.[platform.id];
      let { text, error } = statusText(status, values.syncs?.[platform.id]);
      if (platform.id === "instagram" && !values.instagramUsername && !status?.running) {
        ({ text, error } = { text: "Add your username in settings", error: false });
      }
      const line = card.querySelector(".status");
      line.textContent = text;
      line.classList.toggle("error", error);
      for (const button of card.querySelectorAll("button")) button.disabled = needsToken || Boolean(status?.running);
    }
  }

  // Settings save as you type; a short confirmation replaces a Save button.
  let savedTimer;
  for (const field of FIELDS) {
    $(field).addEventListener("input", () => {
      let value = $(field).value.trim();
      if (field === "instagramUsername") value = value.replace(/^@/, "");
      chrome.storage.local.set({ [field]: value });
      $("saved").textContent = "Saved";
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => ($("saved").textContent = ""), 1200);
    });
  }

  // Last-sync times come from the server, so they're right even for syncs
  // from before this panel existed. Refreshed when a sync finishes.
  async function loadSyncs() {
    values.syncs = (await chrome.runtime.sendMessage({ type: "platform-syncs" })) ?? undefined;
    render();
  }

  const onStorageChange = (changes) => {
    const finished = changes.statuses &&
      PLATFORMS.some(({ id }) => changes.statuses.oldValue?.[id]?.running && !changes.statuses.newValue?.[id]?.running);
    for (const [key, change] of Object.entries(changes)) values[key] = change.newValue;
    render();
    if (finished) loadSyncs();
  };

  async function open() {
    Object.assign(values, DEFAULTS, await chrome.storage.local.get([...FIELDS, "statuses"]));
    for (const field of FIELDS) $(field).value = values[field] ?? "";
    render();
    document.documentElement.appendChild(host);
    chrome.storage.onChanged.addListener(onStorageChange);
    showSettings(!values.token);
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
