// Toolbar popup for pages the sync panel can't open on. background.js shows it
// only after injecting the panel fails.
for (const [id, type] of [["openViewer", "open-viewer"], ["openSettings", "open-options"]]) {
  document.getElementById(id).addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type });
    window.close();
  });
}
