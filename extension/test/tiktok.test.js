import { test } from "node:test";
import assert from "node:assert/strict";
import { extractItems, toIngestItem } from "../tiktok.js";

const video = {
  id: "7420000000000000001",
  desc: "Trimming a bowl on the wheel #pottery",
  createTime: 1727800000,
  author: { uniqueId: "clayday", nickname: "Clay Day" },
  video: { cover: "https://p16/cover.jpeg", width: 576, height: 1024, duration: 42, playAddr: "https://v16/play.mp4", bitrateInfo: [{}] },
  music: { title: "original sound", authorName: "Clay Day", playUrl: "https://music" },
  textExtra: [{ hashtagName: "pottery" }],
  stats: { diggCount: 10 },
};

test("extracts favorites and ignores other responses", () => {
  assert.deepEqual(extractItems(JSON.stringify({ itemList: [video, { nope: true }], hasMore: true })).map((i) => i.id), [video.id]);
  assert.deepEqual(extractItems(JSON.stringify({ statusCode: 0 })), []);
  assert.deepEqual(extractItems("nope"), []);
});

test("maps a video favorite", () => {
  const item = toIngestItem(video);
  assert.equal(item.external_id, "7420000000000000001");
  assert.equal(item.permalink, "https://www.tiktok.com/@clayday/video/7420000000000000001");
  assert.equal(item.author_handle, "clayday");
  assert.equal(item.author_name, "Clay Day");
  assert.equal(item.text, "Trimming a bowl on the wheel #pottery");
  assert.equal(item.posted_at, "2024-10-01T16:26:40.000Z");
  assert.deepEqual(item.media, [{ type: "video", url: "https://p16/cover.jpeg", video_url: null, width: 576, height: 1024, alt: null }]);
  assert.deepEqual(item.raw.hashtags, ["pottery"]);
  assert.equal(item.raw.music.title, "original sound");
  assert.equal(JSON.stringify(item.raw).includes("playAddr"), false);
});

test("maps a photo post to its images", () => {
  const photo = { ...video, id: "7420000000000000002", video: {}, imagePost: { images: [
    { imageURL: { urlList: ["https://p16/1.jpeg"] }, imageWidth: 1080, imageHeight: 1440 },
    { imageURL: { urlList: ["https://p16/2.jpeg"] }, imageWidth: 1080, imageHeight: 1440 },
  ] } };
  const item = toIngestItem(photo);
  assert.equal(item.permalink, "https://www.tiktok.com/@clayday/photo/7420000000000000002");
  assert.deepEqual(item.media.map((m) => m.url), ["https://p16/1.jpeg", "https://p16/2.jpeg"]);
});
