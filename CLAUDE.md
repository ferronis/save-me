# save-me

Local, single-user tool that collects your social media saves, classifies them, and suggests what to do with each. See README.md for an overview.

Rails 8.1 API (Ruby 3.3, Postgres) on **:3080** + Vite / React 19 / Tailwind 4 / TS on **:3081**. Monorepo: Rails at the root, SPA in `frontend/`, which proxies `/api` and `/up` to Rails. Conventions follow `ferronis/starter`, minus auth, admin, and deploy. Ports 3070/3071 belong to wubbin; pick something else if these collide.

Frontend needs Node 24 (`frontend/.nvmrc`). jsdom fails to start on Node 20.

## Ingest

`POST /api/v1/ingest` with `Authorization: Bearer $INGEST_TOKEN` and `{ platform, items: [...] }`. Items upsert on `(platform, external_id)`. Re-ingesting refreshes only `SavedItem::SOURCE_FIELDS`; classification and status are never overwritten by a sync. Any other keys in an item are ignored. A missing `INGEST_TOKEN` rejects every request.

No CORS config: the Chrome extension calls the server from its service worker with `host_permissions` for localhost, which bypasses CORS.

## Chrome extension

`extension/` is a plain MV3 extension with no build step; load it unpacked. Tests: `cd extension && npm test` (node:test).

There is no popup. Clicking the toolbar icon injects `panel.js` into the current page (`activeTab` + `scripting`), which toggles a frosted-glass panel in a closed shadow root. It has to live in the page because an extension popup is an opaque window, so real glass is impossible there. Styles go through a constructed stylesheet so strict page CSPs don't block them. The panel can't call the server itself (page CORS), so it asks `background.js` (`platform-syncs` message), which reads `GET /api/v1/platform_syncs`: saves per platform and when each last synced (`platform_syncs` table, touched on every ingest). Chrome's own pages refuse injection, so the icon does nothing there.

Neither Threads nor Instagram exposes saved posts through a public API, so the extension captures what each web app already loads; Bluesky uses the same approach for consistency. For Threads:

- `hook.js` runs in the page's MAIN world at `document_start`. It must load before Threads caches its `fetch` reference; a hook installed later sees nothing. It forwards any `/graphql` response or embedded `script[type="application/json"]` containing `saved_media`.
- The first page of saves (about 20) is embedded in the HTML. Later pages come from `POST /graphql/query` as you scroll. Both carry `xdt_text_app_viewer.saved_media.edges[].node.thread_items[].post`.
- The list is virtualized, so DOM scraping only ever sees about 5 posts. Use the JSON.
- Threads does not fetch the next page while the tab is hidden, and a page can take well over 10 seconds even when visible. Syncs therefore run in their own focused popup window (opened at `/saved#save-me-sync`, which tells `relay.js` to start scrolling) and only give up after about 30 seconds without new content.
- `background.js` parses with `threads.js` and posts to the ingest endpoint. Sync stops at the first payload with no new saves. On a first sync everything is new, so it runs to the end on its own. If the previous sync for a platform never finished, the next one runs all the way through (`fullSync`) to fill any gap.
- Threads does not expose when something was saved, so `saved_at` stays null. Multi-part self-threads ("1/3") arrive as the first post only.

Instagram uses the same passive approach. Its saved page fetches `/api/v1/feed/saved/posts/` over XHR (21 per page, `{ items: [{ media }] }`, nothing embedded in the HTML); `hook.js` forwards those responses and `instagram.js` maps them. The sync window opens `/<username>/saved/all-posts/`, so the popup asks for the Instagram username. Mapping helpers shared with Threads are in `media.js`. Reels get `/reel/<code>/` permalinks, everything else `/p/<code>/`. Saved ads come through too (`product_type: "ad"`). The extension never calls Instagram or Threads APIs itself, only reads what the pages load; keep it that way.

Bluesky follows the same pattern on `bsky.app/saved`: the page calls the official `app.bsky.bookmark.getBookmarks` on the user's PDS, and `hook.js` forwards those responses. `bluesky.js` maps them. External id is the post's `at://` URI. Bookmarks carry `createdAt`, so Bluesky is the only platform with a real `saved_at`. Bookmarks of deleted or blocked posts have no post view and are skipped. It was built from the lexicon and has not been verified against a live account yet.

X and Reddit have each been verified with one live sync (19 X bookmarks with photos and video; 1 Reddit self post, confirming `old.reddit.com/saved` redirects to the signed-in user). X long posts (`note_tweet`) and Reddit pagination across several pages haven't been exercised yet.
- X: `x.com/i/bookmarks` loads the GraphQL `Bookmarks` timeline as you scroll; `hook.js` forwards it and `x.js` finds every `tweet_results.result` (unwrapping `TweetWithVisibilityResults`). User fields moved from `legacy` to `core` in 2025; both are read. Long posts use `note_tweet` text. No saved time.
- Reddit: new Reddit loads saved items as HTML fragments, so the extension uses `old.reddit.com/saved` instead, which renders items with stable `data-*` attributes and paginates with a "next" link. `relay.js` reads each page's `.thing` elements (the service worker has no DOM), sends them as JSON to `reddit.js`, and follows "next" until a page has nothing new. Comments (`t1_`) keep their body; link posts their title. The subreddit becomes the classifier's topic hint. A server-side pull with an app password was considered and rejected so all three platforms work the same way.

## Classification

`ClassifySavesJob` sends unclassified saves to Claude 20 at a time, looping until none are left or a batch makes no progress. Ingest enqueues it whenever something new arrives. `limits_concurrency` keeps one running at a time, and jobs enqueued meanwhile wait their turn rather than being discarded, so saves that land mid-run still get picked up. `CacheThumbnailsJob` works the same way. The lock only holds for its `duration` (1 hour for classify, 30 minutes for thumbnails; Solid Queue's default is 3 minutes), so a run longer than that could overlap a second one. Overlap only wastes work, since both write the same results. `bin/rails saves:classify` does the same synchronously.

`ClaudeCli` shells out to `claude -p` so classification runs on the Claude Code subscription, not an API key. That rules out `--bare`, which refuses OAuth. Instead the call passes `--setting-sources ""` (no hooks, plugins, or CLAUDE.md), `--tools ""`, `--strict-mcp-config`, and `--no-session-persistence`, runs in a temp dir, and reads `structured_output` from the JSON envelope. Model comes from `CLASSIFIER_MODEL` (default `sonnet`). A batch takes about 40 seconds.

The classifier only ever sees `SavedItem#classifier_context`, never the raw payload, which averages about 25 KB per Threads post. It reuses existing categories and falls back to `Classifier::STARTER_CATEGORIES` when none exist yet.

Solid Queue lives in the primary database. Dev runs the worker inside Puma when `SOLID_QUEUE_IN_PUMA=true`; tests use the `:test` adapter. Minitest 6 moved `stub` into the `minitest-mock` gem.

## Browse UI

`GET /api/v1/saves?view=next|snoozed|done|dismissed&category=&offset=` (50 per page), `GET /api/v1/categories`, `PATCH /api/v1/saves/:id` with `status` (and `snoozed_until` when snoozing), and `GET /api/v1/saves/:id/thumbnail`. No auth: local and single-user.

- A save has 1-3 `categories` (Postgres array, GIN-indexed); the first is the main one. Filter with `SavedItem.in_category`.
- "Do next" is `SavedItem.active.by_urgency`: priority, plus 20 when a deadline is within 7 days or 10 within 30, and capped at 10 once the deadline has passed. Snoozed saves rejoin it on their own when `snoozed_until` passes; nothing flips their status back.
- Platform CDN image links are signed and expire, so `CacheThumbnailsJob` copies each save's first image to `storage/thumbnails/<env>/<id>.jpg` after ingest. `bin/rails saves:thumbnails` backfills.
- The inflection `save`/`saves` is irregular on purpose; without it Rails singularizes `saves` to `safe`.
- Search (`q`) splits on whitespace and requires every word somewhere in the save: text, summary, next step, author, categories, or Instagram's topic hint (`SavedItem::SEARCH_FIELDS`).
- The UI uses the same glass language as the extension panel (`.slab`, `.pill`, `.quiet`, `.etched` in `index.css`), over fixed blurred shapes in `.backdrop` that give the glass something to blur. Cards fill the width in columns; `App.tsx` deals saves across columns left to right so the ranking reads along the top row.

## Not built yet

Pinterest.
