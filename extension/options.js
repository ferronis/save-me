// Settings page. It is an extension page, so unlike the in-page sync panel,
// no website can read these fields.
const FIELDS = ["serverUrl", "token", "instagramUsername"];
const DEFAULTS = { serverUrl: "http://localhost:3080", token: "", instagramUsername: "" };

const values = { ...DEFAULTS, ...(await chrome.storage.local.get(FIELDS)) };
let savedTimer;

// A usable server address, without a trailing slash, or null.
function parseServerUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href.replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

for (const field of FIELDS) {
  const input = document.getElementById(field);
  input.value = values[field] ?? "";
  // Save as you type; a short confirmation replaces a Save button.
  input.addEventListener("input", () => {
    let value = input.value.trim();
    if (field === "instagramUsername") value = value.replace(/^@/, "");
    if (field === "serverUrl") {
      // Only store a complete http(s) URL. While it's empty, half-typed, or
      // anything else, clear it so syncs fall back to the default server.
      const url = parseServerUrl(value);
      if (url) chrome.storage.local.set({ serverUrl: url });
      else chrome.storage.local.remove("serverUrl");
    } else {
      chrome.storage.local.set({ [field]: value });
    }
    const saved = document.getElementById("saved");
    saved.textContent = "Saved";
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (saved.textContent = ""), 1200);
  });
}

// Start where setup usually is: the token, if it's missing.
document.getElementById(values.token ? "serverUrl" : "token").focus();
