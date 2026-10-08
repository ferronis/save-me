import { test } from "node:test";
import assert from "node:assert/strict";
import { extractBookmarks, toIngestItem } from "../bluesky.js";

const post = (embed) => ({
  $type: "app.bsky.feed.defs#postView",
  uri: "at://did:plc:abc/app.bsky.feed.post/3kxyz",
  cid: "bafy",
  author: { did: "did:plc:abc", handle: "potter.bsky.social", displayName: "A Potter" },
  record: { $type: "app.bsky.feed.post", text: "Glaze test results", createdAt: "2026-10-01T12:00:00.000Z" },
  embed,
  indexedAt: "2026-10-01T12:00:01.000Z",
});

const bookmark = (embed) => ({
  subject: { uri: "at://did:plc:abc/app.bsky.feed.post/3kxyz", cid: "bafy" },
  createdAt: "2026-10-05T09:30:00.000Z",
  item: post(embed),
});

test("extracts post bookmarks and skips deleted or blocked ones", () => {
  const text = JSON.stringify({
    cursor: "c1",
    bookmarks: [bookmark(), { subject: {}, item: { $type: "app.bsky.feed.defs#notFoundPost", uri: "at://x", notFound: true } }],
  });
  assert.equal(extractBookmarks(text).length, 1);
  assert.deepEqual(extractBookmarks("nope"), []);
});

test("maps a bookmark, keeping when it was saved", () => {
  const item = toIngestItem(bookmark({
    $type: "app.bsky.embed.images#view",
    images: [{ thumb: "https://cdn/t.jpg", fullsize: "https://cdn/f.jpg", alt: "three bowls", aspectRatio: { width: 4, height: 3 } }],
  }));
  assert.equal(item.external_id, "at://did:plc:abc/app.bsky.feed.post/3kxyz");
  assert.equal(item.permalink, "https://bsky.app/profile/potter.bsky.social/post/3kxyz");
  assert.equal(item.author_name, "A Potter");
  assert.equal(item.text, "Glaze test results");
  assert.equal(item.posted_at, "2026-10-01T12:00:00.000Z");
  assert.equal(item.saved_at, "2026-10-05T09:30:00.000Z");
  assert.deepEqual(item.media, [{ type: "image", url: "https://cdn/f.jpg", video_url: null, width: 4, height: 3, alt: "three bowls" }]);
});

test("maps video, link-card, and quote-with-media embeds", () => {
  const video = toIngestItem(bookmark({ $type: "app.bsky.embed.video#view", thumbnail: "https://v/t.jpg", playlist: "https://v/p.m3u8" }));
  assert.equal(video.media[0].type, "video");
  assert.equal(video.media[0].video_url, "https://v/p.m3u8");

  const link = toIngestItem(bookmark({ $type: "app.bsky.embed.external#view", external: { uri: "https://glaze.example", title: "Glazes", thumb: "https://l/t.jpg" } }));
  assert.deepEqual(link.media.map((m) => [m.type, m.url, m.alt]), [["link", "https://l/t.jpg", "Glazes"]]);

  const quote = toIngestItem(bookmark({
    $type: "app.bsky.embed.recordWithMedia#view",
    record: {},
    media: { $type: "app.bsky.embed.images#view", images: [{ fullsize: "https://cdn/q.jpg" }] },
  }));
  assert.equal(quote.media[0].url, "https://cdn/q.jpg");

  assert.deepEqual(toIngestItem(bookmark()).media, []);
});
