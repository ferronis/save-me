import { test } from "node:test";
import assert from "node:assert/strict";
import { extractMedias, toIngestItem } from "../instagram.js";

const reel = {
  pk: "2000000000000000002",
  code: "ZyXwVu98765",
  product_type: "clips",
  taken_at: 1791300000,
  caption: { text: "Three shelf layouts for a small window" },
  user: { username: "plantshelf.studio", full_name: "" },
  image_versions2: { candidates: [{ url: "https://cdn/cover.jpg", width: 720, height: 1280 }] },
  video_versions: [{ url: "https://cdn/reel.mp4" }],
  original_width: 720,
  original_height: 1280,
  video_dash_manifest: "<?xml ...>",
  mezql_token: "secret",
  organic_tracking_token: "secret",
  visual_discovery_organic_search_query: "vertical garden grid setup ideas",
};

test("maps a reel with a reel permalink and a video entry", () => {
  const item = toIngestItem(reel);
  assert.equal(item.external_id, "2000000000000000002");
  assert.equal(item.permalink, "https://www.instagram.com/reel/ZyXwVu98765/");
  assert.equal(item.author_handle, "plantshelf.studio");
  assert.equal(item.author_name, null);
  assert.equal(item.text, "Three shelf layouts for a small window");
  assert.equal(item.posted_at, new Date(1791300000 * 1000).toISOString());
  assert.deepEqual(item.media, [
    { type: "video", url: "https://cdn/cover.jpg", video_url: "https://cdn/reel.mp4", width: 720, height: 1280, alt: null },
  ]);
  assert.equal(item.raw.visual_discovery_organic_search_query, "vertical garden grid setup ideas");
  for (const key of ["video_dash_manifest", "mezql_token", "organic_tracking_token"]) assert.equal(item.raw[key], undefined);
});

test("maps a captionless carousel post or ad with a /p/ permalink", () => {
  const item = toIngestItem({
    pk: 42,
    code: "Abc",
    product_type: "ad",
    caption: null,
    owner: { username: "brand" },
    carousel_media: [
      { image_versions2: { candidates: [{ url: "https://cdn/1.jpg" }] } },
      { image_versions2: { candidates: [] } },
    ],
  });
  assert.equal(item.permalink, "https://www.instagram.com/p/Abc/");
  assert.equal(item.author_handle, "brand");
  assert.equal(item.text, null);
  assert.equal(item.media.length, 1);
});

test("extracts medias from a saved-feed response", () => {
  const text = JSON.stringify({ num_results: 2, more_available: true, items: [{ media: reel }, { media: { code: "no-pk" } }, {}] });
  assert.deepEqual(extractMedias(text).map((m) => m.code), ["ZyXwVu98765"]);
  assert.deepEqual(extractMedias("for (;;);" + JSON.stringify({ items: [{ media: reel }] })).length, 1);
  assert.deepEqual(extractMedias("<html>"), []);
});
