# save-me

Local, single-user tool that collects your social media saves, classifies them, and suggests what to do with each. See README.md for an overview.

Rails 8.1 API (Ruby 3.3, SQLite) on **:3080** + Vite / React 19 / Tailwind 4 / TS on **:3081**. Monorepo: Rails at the root, SPA in `frontend/`, which proxies `/api` and `/up` to Rails. `npm run build` writes the SPA into `public/` (gitignored), which Rails serves on :3080. Conventions follow `ferronis/starter`, minus auth, admin, and deploy. Ports 3070/3071 belong to wubbin; pick something else if these collide.

Frontend needs Node 24 (`frontend/.nvmrc`). jsdom fails to start on Node 20.

## Ingest

`POST /api/v1/ingest` with `Authorization: Bearer $INGEST_TOKEN` and `{ platform, items: [...] }`. Items upsert on `(platform, external_id)`. Re-ingesting refreshes only `SavedItem::SOURCE_FIELDS`; classification and status are never overwritten by a sync. Any other keys in an item are ignored. A missing `INGEST_TOKEN` rejects every request.

No CORS config: the Chrome extension calls the server from its service worker with `host_permissions` for localhost, which bypasses CORS.

## Chrome extension

`extension/` is a plain MV3 extension with no build step; load it unpacked. Tests: `cd extension && npm test` (node:test).

There is no popup. Clicking the toolbar icon injects `panel.js` into the current page (`activeTab` + `scripting`), which toggles a frosted-glass panel in a closed shadow root. It has to live in the page because an extension popup is an opaque window, so real glass is impossible there. Styles go through a constructed stylesheet so strict page CSPs don't block them. The panel can't call the server itself (page CORS), so it asks `background.js` (`platform-syncs` message), which reads `GET /api/v1/platform_syncs`: saves per platform and when each last synced (`platform_syncs` table, touched on every ingest). Chrome's own pages refuse injection. When that happens, `background.js` sets `help.html` as the tab's popup, opens it with `chrome.action.openPopup()`, and clears it again so the next click on a website still injects the panel.

The panel's "Open Save Me" button sends `open-viewer`, and `background.js` focuses an existing viewer tab or opens one. When `platform-syncs` comes back null, the server is unreachable: the panel shows how to start it and disables that button.

Settings (server URL, ingest token, Instagram username) live on the extension's options page (`options.html`), never in the panel. The panel runs inside arbitrary web pages, and a hostile page can capture even a closed shadow root by patching `attachShadow` before injection. So the panel only ever learns *whether* a token exists, and its gear sends `open-options` to `background.js`. Keep the token out of the panel.

Neither Threads nor Instagram exposes saved posts through a public API, so the extension captures what each web app already loads; Bluesky uses the same approach for consistency. For Threads:

- `hook.js` runs in the page's MAIN world at `document_start`. It must load before Threads caches its `fetch` reference; a hook installed later sees nothing. It forwards any `/graphql` response or embedded `script[type="application/json"]` containing `saved_media`.
- The first page of saves (about 20) is embedded in the HTML. Later pages come from `POST /graphql/query` as you scroll. Both carry `xdt_text_app_viewer.saved_media.edges[].node.thread_items[].post`.
- The list is virtualized, so DOM scraping only ever sees about 5 posts. Use the JSON.
- Threads does not fetch the next page while the tab is hidden, and a page can take well over 10 seconds even when visible. Syncs therefore run in their own focused popup window (opened at `/saved#save-me-sync`, which tells `relay.js` to start scrolling) and only give up after about 30 seconds without new content.
- `background.js` parses with `threads.js` and posts to the ingest endpoint. Sync stops at the first payload with no new saves. On a first sync everything is new, so it runs to the end on its own. If the previous sync for a platform never finished, or browsing outside a sync brought in new saves (`needsFull`), the next one runs all the way through (`fullSync`) to fill any gap.
- Threads does not expose when something was saved, so `saved_at` stays null. Multi-part self-threads ("1/3") arrive as the first post only.

Instagram uses the same passive approach. Its saved page fetches `/api/v1/feed/saved/posts/` over XHR (21 per page, `{ items: [{ media }] }`, nothing embedded in the HTML); `hook.js` forwards those responses and `instagram.js` maps them. The sync window opens `/<username>/saved/all-posts/`, so the popup asks for the Instagram username. Mapping helpers shared with Threads are in `media.js`. Reels get `/reel/<code>/` permalinks, everything else `/p/<code>/`. Saved ads come through too (`product_type: "ad"`). The extension never calls Instagram or Threads APIs itself, only reads what the pages load; keep it that way.

Bluesky follows the same pattern on `bsky.app/saved`: the page calls the official `app.bsky.bookmark.getBookmarks` on the user's PDS, and `hook.js` forwards those responses. `bluesky.js` maps them. External id is the post's `at://` URI. Bookmarks carry `createdAt`, so Bluesky is the only platform with a real `saved_at`. Bookmarks of deleted or blocked posts have no post view and are skipped. It was built from the lexicon and has not been verified against a live account yet.

YouTube and TikTok parsers were checked against live signed-in pages (5 Watch Later videos; 31 TikTok favorites including 2 photo posts) but no full extension sync has run yet.
- YouTube: Watch Later's first page is `window.ytInitialData` (`hook.js` stringifies it at DOMContentLoaded), and scrolling loads `/youtubei/v1/browse` continuations. That endpoint serves every YouTube page, so `hook.js` forwards it only while `location` is `/playlist?list=WL`. Watch Later still renders `playlistVideoRenderer` entries (age as "3mo ago"); other playlists use `lockupViewModel` with `contentType: LOCKUP_CONTENT_TYPE_VIDEO`, and `youtube.js` reads both. The list shows only an upload age, so `posted_at` is an estimate. Thumbnails use the unsigned `i.ytimg.com/vi/<id>/hqdefault.jpg`. Every YouTube sync is a full sync, because Watch Later can be sorted oldest first.
- TikTok: the Favorites tab loads `/api/user/collect/item_list/` (`{ itemList: [...] }`). The tab has no URL, so a sync opens `tiktok.com/@<tiktokUsername>` and `relay.js` clicks `[role="tab"][class*="PFavorite"]` (the other profile tabs have `data-e2e`, this one doesn't; a "Favorites" text match is the fallback) before scrolling. Cover and photo URLs are signed and expire, so the thumbnail cache matters here. Photo posts (`imagePost`) map to their images and `/photo/` permalinks. Hashtags become the classifier's topic hint.

X and Reddit have each been verified with one live sync (19 X bookmarks with photos and video; 1 Reddit self post, confirming `old.reddit.com/saved` redirects to the signed-in user). X long posts (`note_tweet`) and Reddit pagination across several pages haven't been exercised yet.
- X: `x.com/i/bookmarks` loads the GraphQL `Bookmarks` timeline as you scroll; `hook.js` forwards it and `x.js` finds every `tweet_results.result` (unwrapping `TweetWithVisibilityResults`). User fields moved from `legacy` to `core` in 2025; both are read. Long posts use `note_tweet` text. No saved time.
- Reddit: new Reddit loads saved items as HTML fragments, so the extension uses `old.reddit.com/saved` instead, which renders items with stable `data-*` attributes and paginates with a "next" link. `relay.js` reads each page's `.thing` elements (the service worker has no DOM), sends them as JSON to `reddit.js`, and follows "next" until a page has nothing new. Opening `/saved` or `/user/<name>/saved` yourself (outside a sync) sends that one page too, so Reddit is picked up while browsing like the other platforms. Comments (`t1_`) keep their body; link posts their title. The subreddit becomes the classifier's topic hint. A server-side pull with an app password was considered and rejected so all three platforms work the same way.

## Classification

`ClassifySavesJob` sends unclassified saves to Claude 20 at a time, looping until none are left or a batch makes no progress. Ingest enqueues it whenever something new arrives. `limits_concurrency` keeps one running at a time, and jobs enqueued meanwhile wait their turn rather than being discarded, so saves that land mid-run still get picked up. `CacheThumbnailsJob` works the same way. The lock only holds for its `duration` (1 hour for classify, 30 minutes for thumbnails; Solid Queue's default is 3 minutes), so a run longer than that could overlap a second one. Overlap only wastes work, since both write the same results. `bin/rails saves:classify` does the same synchronously.

`ClaudeCli` shells out to `claude -p` so classification runs on the Claude Code subscription, not an API key. That rules out `--bare`, which refuses OAuth. Instead the call passes `--setting-sources ""` (no hooks, plugins, or CLAUDE.md), `--tools ""`, `--strict-mcp-config`, and `--no-session-persistence`, runs in a temp dir, and reads `structured_output` from the JSON envelope. Model comes from `CLASSIFIER_MODEL` (default `sonnet`). A batch takes about 40 seconds.

The classifier only ever sees `SavedItem#classifier_context`, never the raw payload, which averages about 25 KB per Threads post. It reuses existing categories and falls back to `Classifier::STARTER_CATEGORIES` when none exist yet.

Solid Queue lives in the primary database. Dev runs the worker inside Puma when `SOLID_QUEUE_IN_PUMA=true`; tests use the `:test` adapter. Minitest 6 moved `stub` into the `minitest-mock` gem.

## Browse UI

`GET /api/v1/saves?view=next|snoozed|done|dismissed&category=&offset=` (50 per page), `GET /api/v1/categories`, `PATCH /api/v1/saves/:id` with `status` (and `snoozed_until` when snoozing), and `GET /api/v1/saves/:id/thumbnail`. No auth: local and single-user.

- A save has 1-3 `categories` (JSON array, queried with `json_each`); the first is the main one. Filter with `SavedItem.in_category`. Search uses SQLite `LIKE`, which ignores case for ASCII letters only.
- "Do next" is `SavedItem.active.by_urgency`: priority, plus 20 when a deadline is within 7 days or 10 within 30, and capped at 10 once the deadline has passed. Snoozed saves rejoin it on their own when `snoozed_until` passes; nothing flips their status back.
- `sort=newest` reorders any view by `posted_at` (newest first). The viewer offers it on "Do next" only. Every platform except Bluesky leaves `saved_at` null, so posting date is the only date every save has.
- The viewer is an installable web app (`frontend/public/manifest.webmanifest` plus icons; `config/initializers/mime_types.rb` serves the manifest as `application/manifest+json`). Chrome installs it into `~/Applications`, and Safari adds it to the Dock.
- Platform CDN image links are signed and expire, so `CacheThumbnailsJob` copies each save's first image to `storage/thumbnails/<env>/<id>.jpg` after ingest. `bin/rails saves:thumbnails` backfills.
- Permalinks must be `http(s)` (model validation), and the viewer renders only `http(s)` links (`safeHref`): a stored `javascript:` URL would run in the viewer's origin, which can call the unauthenticated saves API.
- The inflection `save`/`saves` is irregular on purpose; without it Rails singularizes `saves` to `safe`.
- Search (`q`) splits on whitespace and requires every word somewhere in the save: text, summary, next step, author, categories, or Instagram's topic hint (`SavedItem::SEARCH_FIELDS`).
- The UI uses the same glass language as the extension panel (`.slab`, `.pill`, `.quiet`, `.etched` in `index.css`), over fixed blurred shapes in `.backdrop` that give the glass something to blur. Cards fill the width in columns; `App.tsx` deals saves across columns left to right so the ranking reads along the top row.

## Install

`packaging/homebrew/save-me.rb` is the Homebrew formula (published in the `ferronis/homebrew-tap` repo). It builds the SPA, bundles gems without the dev/test groups, and links `storage/` to `var/save-me` so data survives upgrades. `bin/save-me` runs the app in production from `etc/save-me.env`, which it creates on first run with a random `INGEST_TOKEN` and `SECRET_KEY_BASE`. It reads that file as plain `KEY=value` lines, never sourcing it, so values with spaces need no quoting; `save-me setup` records `CLAUDE_BIN`, since `brew services` starts with a bare `PATH`. Production binds to 127.0.0.1, serves plain http, and allows only localhost hosts (DNS rebinding protection, since the API has no auth). `saves:import_postgres` moves data over from the old Postgres version.

## Not built yet

Pinterest.
