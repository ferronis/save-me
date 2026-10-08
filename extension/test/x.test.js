import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTweets, toIngestItem } from "../x.js";

const tweet = (overrides = {}) => ({
  __typename: "Tweet",
  rest_id: "1842000000000000001",
  core: { user_results: { result: { core: { screen_name: "potter", name: "A Potter" }, legacy: {} } } },
  legacy: {
    full_text: "Glaze chart https://t.co/abc",
    created_at: "Mon Oct 06 14:30:00 +0000 2026",
    entities: { urls: [{ expanded_url: "https://glaze.example" }] },
    extended_entities: {
      media: [
        { type: "photo", media_url_https: "https://pbs/1.jpg", original_info: { width: 1200, height: 900 }, ext_alt_text: "chart" },
        {
          type: "video",
          media_url_https: "https://pbs/v.jpg",
          original_info: { width: 720, height: 1280 },
          video_info: { variants: [
            { content_type: "application/x-mpegURL", url: "https://v/p.m3u8" },
            { content_type: "video/mp4", bitrate: 256000, url: "https://v/low.mp4" },
            { content_type: "video/mp4", bitrate: 2176000, url: "https://v/high.mp4" },
          ] },
        },
      ],
    },
  },
  views: { count: "123" },
  ...overrides,
});

const response = (...results) => JSON.stringify({
  data: { bookmark_timeline_v2: { timeline: { instructions: [{ type: "TimelineAddEntries", entries: [
    ...results.map((result) => ({ content: { itemContent: { tweet_results: { result } } } })),
    { content: { cursorType: "Bottom", value: "cursor" } },
  ] }] } } },
});

test("extracts tweets, unwrapping restricted ones", () => {
  const wrapped = { __typename: "TweetWithVisibilityResults", tweet: tweet({ rest_id: "2" }) };
  assert.deepEqual(extractTweets(response(tweet(), wrapped)).map((t) => t.rest_id), ["1842000000000000001", "2"]);
  assert.deepEqual(extractTweets("nope"), []);
});

test("maps a tweet with photo and video", () => {
  const item = toIngestItem(tweet());
  assert.equal(item.external_id, "1842000000000000001");
  assert.equal(item.permalink, "https://x.com/potter/status/1842000000000000001");
  assert.equal(item.author_handle, "potter");
  assert.equal(item.author_name, "A Potter");
  assert.equal(item.text, "Glaze chart https://t.co/abc");
  assert.equal(item.posted_at, "2026-10-06T14:30:00.000Z");
  assert.deepEqual(item.media, [
    { type: "image", url: "https://pbs/1.jpg", video_url: null, width: 1200, height: 900, alt: "chart" },
    { type: "video", url: "https://pbs/v.jpg", video_url: "https://v/high.mp4", width: 720, height: 1280, alt: null },
  ]);
  assert.equal(item.raw.views, undefined);
});

test("prefers the full text of long posts and reads older user fields", () => {
  const item = toIngestItem(tweet({
    core: { user_results: { result: { legacy: { screen_name: "old_style", name: "Old" } } } },
    note_tweet: { note_tweet_results: { result: { text: "The whole long post" } } },
  }));
  assert.equal(item.author_handle, "old_style");
  assert.equal(item.text, "The whole long post");
});
