// Turns YouTube Watch Later responses into ingest items: the page's own
// ytInitialData on load, and the /youtubei/v1/browse continuations it fetches
// as you scroll. Playlists list videos as lockupViewModel entries now; the
// older playlistVideoRenderer shape is read too. YouTube doesn't say when a
// video was added to Watch Later, so saved_at stays empty, and the list only
// gives an upload age ("3 years ago"), so posted_at is an estimate from it.

export function extractVideos(text, now = new Date()) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const videos = [];
  const visit = (node, depth) => {
    if (!node || typeof node !== "object" || depth > 60) return;
    if (node.lockupViewModel?.contentType === "LOCKUP_CONTENT_TYPE_VIDEO") {
      const video = fromLockup(node.lockupViewModel, now);
      if (video) videos.push(video);
      return;
    }
    if (node.playlistVideoRenderer?.videoId) {
      videos.push(fromPlaylistVideoRenderer(node.playlistVideoRenderer, now));
      return;
    }
    for (const value of Object.values(node)) visit(value, depth + 1);
  };
  visit(data, 0);
  return videos;
}

function fromLockup(lockup, now) {
  const id = lockup.contentId;
  if (!id) return null;
  const metadata = lockup.metadata?.lockupMetadataViewModel;
  const rows = metadata?.metadata?.contentMetadataViewModel?.metadataRows ?? [];
  const channel = rows[0]?.metadataParts?.[0]?.text;
  const channelUrl = channel?.commandRuns?.[0]?.onTap?.innertubeCommand?.commandMetadata?.webCommandMetadata?.url;
  const details = (rows[1]?.metadataParts ?? []).map((part) => part.text?.content).filter(Boolean);
  const badges = lockup.contentImage?.thumbnailViewModel?.overlays
    ?.flatMap((overlay) => overlay.thumbnailBottomOverlayViewModel?.badges ?? []) ?? [];
  return {
    id,
    title: metadata?.title?.content ?? null,
    channel: channel?.content ?? null,
    channelUrl: channelUrl ?? null,
    duration: badges[0]?.thumbnailBadgeViewModel?.text ?? null,
    published: details.find((detail) => / ago$/.test(detail)) ?? null,
    views: details.find((detail) => !/ ago$/.test(detail)) ?? null,
    now,
  };
}

function fromPlaylistVideoRenderer(renderer, now) {
  const byline = renderer.shortBylineText?.runs?.[0];
  // Runs like ["128K", " • ", "3mo ago"].
  const info = (renderer.videoInfo?.runs ?? []).map((run) => run.text?.trim()).filter((text) => text && text !== "•");
  return {
    id: renderer.videoId,
    title: renderer.title?.runs?.[0]?.text ?? renderer.title?.simpleText ?? null,
    channel: byline?.text ?? null,
    channelUrl: byline?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl ?? null,
    duration: renderer.lengthText?.simpleText ?? null,
    published: info.find((text) => / ago$/.test(text)) ?? null,
    views: info.find((text) => !/ ago$/.test(text)) ?? null,
    now,
  };
}

const UNIT_DAYS = { second: 0, minute: 0, hour: 0, day: 1, week: 7, month: 30, year: 365 };

// "10y ago", "3 years ago", "2 weeks ago" -> an approximate date.
export function estimatePublished(text, now = new Date()) {
  const match = text?.match(/(\d+)\s*(y|mo|w|d|h|m|s|year|month|week|day|hour|minute|second)s?\b/i);
  if (!match) return null;
  const unit = { y: "year", mo: "month", w: "week", d: "day", h: "hour", m: "minute", s: "second" }[match[2].toLowerCase()] ??
    match[2].toLowerCase();
  const days = Number(match[1]) * (UNIT_DAYS[unit] ?? 0);
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export function toIngestItem(video) {
  const handle = video.channelUrl?.match(/^\/@([^/?]+)/)?.[1] ?? null;
  return {
    external_id: video.id,
    permalink: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`,
    author_handle: handle ? decodeURIComponent(handle) : null,
    author_name: video.channel,
    text: video.title,
    // ytimg thumbnails aren't signed, so this link doesn't expire.
    media: [{ type: "video", url: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`, video_url: null, width: 480, height: 360, alt: null }],
    posted_at: estimatePublished(video.published, video.now),
    // The raw lockup runs to kilobytes of rendering data; keep what describes the video.
    raw: { video_id: video.id, title: video.title, channel: video.channel, duration: video.duration, views: video.views, published: video.published },
  };
}
