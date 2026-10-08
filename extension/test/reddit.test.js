import { test } from "node:test";
import assert from "node:assert/strict";
import { extractThings, toIngestItem } from "../reddit.js";

const link = {
  fullname: "t3_abc123",
  permalink: "/r/Pottery/comments/abc123/my_first_bowl/",
  author: "example_potter",
  subreddit: "r/Pottery",
  url: "https://i.redd.it/bowl.jpg",
  timestamp: "1791000000000",
  title: "My first bowl",
  body: null,
  thumbnail: "//b.thumbs.redditmedia.com/bowl.jpg",
};

test("extracts things that have an id", () => {
  assert.equal(extractThings(JSON.stringify([link, { title: "no id" }])).length, 1);
  assert.deepEqual(extractThings("nope"), []);
});

test("maps a saved link post", () => {
  const item = toIngestItem(link);
  assert.equal(item.external_id, "t3_abc123");
  assert.equal(item.permalink, "https://www.reddit.com/r/Pottery/comments/abc123/my_first_bowl/");
  assert.equal(item.author_handle, "example_potter");
  assert.equal(item.text, "My first bowl");
  assert.equal(item.posted_at, new Date(1791000000000).toISOString());
  assert.deepEqual(item.media.map((m) => m.url), ["https://b.thumbs.redditmedia.com/bowl.jpg"]);
  assert.equal(item.raw.link, "https://i.redd.it/bowl.jpg");
});

test("maps a saved comment and skips placeholder thumbnails", () => {
  const item = toIngestItem({ ...link, fullname: "t1_c1", title: null, body: "Try a 1:1 ball clay mix", thumbnail: "self", url: "/r/Pottery/comments/abc123/" });
  assert.equal(item.text, "Try a 1:1 ball clay mix");
  assert.deepEqual(item.media, []);
  assert.equal(item.raw.link, null);
});

test("keeps a text post's body after its title", () => {
  const item = toIngestItem({ ...link, thumbnail: "self", body: "Spreadsheet? App? Notebook?" });
  assert.equal(item.text, "My first bowl\n\nSpreadsheet? App? Notebook?");
});
