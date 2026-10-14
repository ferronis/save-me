import { test } from "node:test";
import assert from "node:assert/strict";
import { estimatePublished, extractVideos, toIngestItem } from "../youtube.js";

const NOW = new Date("2026-10-14T00:00:00Z");

// Shaped like a real Watch Later lockup, trimmed to the fields we read.
const lockup = (id, overrides = {}) => ({
  lockupViewModel: {
    contentId: id,
    contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
    contentImage: { thumbnailViewModel: { overlays: [{ thumbnailBottomOverlayViewModel: { badges: [{ thumbnailBadgeViewModel: { text: "13:54" } }] } }] } },
    metadata: { lockupMetadataViewModel: {
      title: { content: "Coding Challenge 1: Starfield Simulation" },
      metadata: { contentMetadataViewModel: { metadataRows: [
        { metadataParts: [{ text: { content: "The Coding Train", commandRuns: [{ onTap: { innertubeCommand: { commandMetadata: { webCommandMetadata: { url: "/@TheCodingTrain" } } } } }] } }] },
        { metadataParts: [{ text: { content: "1.3M views" } }, { text: { content: "3 years ago" } }] },
      ] } },
    } },
    ...overrides,
  },
});

test("reads videos from the first page and from continuations, skipping non-videos", () => {
  const firstPage = { contents: { itemSectionRenderer: { contents: [lockup("a"), lockup("p", { contentType: "LOCKUP_CONTENT_TYPE_PLAYLIST" }), { continuationItemViewModel: {} }] } } };
  const continuation = { onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [lockup("b")] } }] };
  assert.deepEqual(extractVideos(JSON.stringify(firstPage), NOW).map((v) => v.id), ["a"]);
  assert.deepEqual(extractVideos(JSON.stringify(continuation), NOW).map((v) => v.id), ["b"]);
  assert.deepEqual(extractVideos("nope"), []);
});

test("maps a lockup to a save with a stable thumbnail and an estimated upload date", () => {
  const [video] = extractVideos(JSON.stringify(lockup("17WoOqgXsRM")), NOW);
  const item = toIngestItem(video);
  assert.equal(item.external_id, "17WoOqgXsRM");
  assert.equal(item.permalink, "https://www.youtube.com/watch?v=17WoOqgXsRM");
  assert.equal(item.author_handle, "TheCodingTrain");
  assert.equal(item.author_name, "The Coding Train");
  assert.equal(item.text, "Coding Challenge 1: Starfield Simulation");
  assert.equal(item.media[0].url, "https://i.ytimg.com/vi/17WoOqgXsRM/hqdefault.jpg");
  assert.equal(item.posted_at.slice(0, 4), "2023");
  assert.deepEqual(item.raw, { video_id: "17WoOqgXsRM", title: "Coding Challenge 1: Starfield Simulation", channel: "The Coding Train", duration: "13:54", views: "1.3M views", published: "3 years ago" });
});

test("reads the older playlistVideoRenderer shape", () => {
  const renderer = { playlistVideoRenderer: {
    videoId: "old1",
    title: { runs: [{ text: "Old layout" }] },
    shortBylineText: { runs: [{ text: "Chan", navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: "/@chan" } } }] },
    lengthText: { simpleText: "4:01" },
    // As Watch Later shows it: no space between the number and the unit.
    videoInfo: { runs: [{ text: "128K" }, { text: " • " }, { text: "2w ago" }] },
  } };
  const item = toIngestItem(extractVideos(JSON.stringify(renderer), NOW)[0]);
  assert.equal(item.author_handle, "chan");
  assert.equal(item.raw.published, "2w ago");
  assert.equal(item.raw.views, "128K");
  assert.equal(item.posted_at, "2026-09-30T00:00:00.000Z");
});

test("estimates upload dates from short and long ages", () => {
  assert.equal(estimatePublished("10y ago", NOW).slice(0, 4), "2016");
  assert.equal(estimatePublished("2 months ago", NOW), "2026-08-15T00:00:00.000Z");
  assert.equal(estimatePublished("5mo ago", NOW), "2026-05-17T00:00:00.000Z");
  assert.equal(estimatePublished(null, NOW), null);
  assert.equal(estimatePublished("Premieres soon", NOW), null);
});
