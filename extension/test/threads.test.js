import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPosts, toIngestItem } from "../threads.js";

const carouselPost = {
  pk: "1000000000000000001",
  code: "AbCdEf12345",
  taken_at: 1791000000,
  caption: { text: "Notes from my first glaze firing" },
  user: { username: "maker.jo", full_name: "Jo Maker" },
  logging_info_token: "secret",
  organic_tracking_token: "secret",
  image_versions2: { candidates: [] },
  carousel_media: [
    {
      image_versions2: { candidates: [{ url: "https://cdn/1.jpg", width: 1080, height: 1350 }] },
      original_width: 1080,
      original_height: 1350,
      accessibility_caption: "Photo of a kiln shelf",
    },
    {
      image_versions2: { candidates: [{ url: "https://cdn/2.jpg", width: 640, height: 640 }] },
      video_versions: [{ url: "https://cdn/2.mp4" }],
    },
  ],
};

const textPost = {
  pk: 123,
  code: "Abc",
  caption: null,
  user: { username: "someone", full_name: "" },
  image_versions2: { candidates: [] },
};

const payload = (posts, cursor = "c1") => ({
  data: {
    xdt_text_app_viewer: {
      saved_media: {
        edges: posts.map((post) => ({ node: { thread_items: [{ post }] } })),
        page_info: { end_cursor: cursor, has_next_page: true },
      },
    },
  },
});

test("extracts posts from a deeply nested embedded payload", () => {
  const embedded = { require: [[["x", { __bbox: { result: payload([carouselPost, textPost]) } }]]] };
  const posts = extractPosts(JSON.stringify(embedded));
  assert.deepEqual(posts.map((p) => p.code), ["AbCdEf12345", "Abc"]);
});

test("handles the for(;;) guard and newline-separated documents", () => {
  const text = "for (;;);" + JSON.stringify(payload([carouselPost])) + "\n" + JSON.stringify({ extensions: {} });
  assert.equal(extractPosts(text).length, 1);
});

test("returns nothing for unrelated or broken payloads", () => {
  assert.deepEqual(extractPosts(JSON.stringify({ data: { feed: {} } })), []);
  assert.deepEqual(extractPosts("not json"), []);
});

test("maps a carousel post to an ingest item", () => {
  const item = toIngestItem(carouselPost);

  assert.equal(item.external_id, "1000000000000000001");
  assert.equal(item.permalink, "https://www.threads.com/@maker.jo/post/AbCdEf12345");
  assert.equal(item.author_handle, "maker.jo");
  assert.equal(item.author_name, "Jo Maker");
  assert.equal(item.text, "Notes from my first glaze firing");
  assert.equal(item.posted_at, new Date(1791000000 * 1000).toISOString());
  assert.deepEqual(item.media, [
    { type: "image", url: "https://cdn/1.jpg", video_url: null, width: 1080, height: 1350, alt: "Photo of a kiln shelf" },
    { type: "video", url: "https://cdn/2.jpg", video_url: "https://cdn/2.mp4", width: 640, height: 640, alt: null },
  ]);
  assert.equal(item.raw.logging_info_token, undefined);
  assert.equal(item.raw.organic_tracking_token, undefined);
  assert.equal(item.raw.code, "AbCdEf12345");
});

test("maps a text-only post", () => {
  const item = toIngestItem(textPost);
  assert.equal(item.external_id, "123");
  assert.equal(item.text, null);
  assert.equal(item.author_name, null);
  assert.equal(item.posted_at, null);
  assert.deepEqual(item.media, []);
});
