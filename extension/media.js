// Helpers shared by the Threads and Instagram mappers. Both apps come from
// Meta and describe media the same way.

export function mediaFrom(entry) {
  const image = entry.image_versions2?.candidates?.[0];
  const video = entry.video_versions?.[0];
  if (!image && !video) return null;
  return {
    type: video ? "video" : "image",
    url: image?.url ?? null,
    video_url: video?.url ?? null,
    width: entry.original_width ?? image?.width ?? null,
    height: entry.original_height ?? image?.height ?? null,
    alt: entry.accessibility_caption ?? null,
  };
}

export function mediaList(post) {
  const entries = post.carousel_media?.length ? post.carousel_media : [post];
  return entries.map(mediaFrom).filter(Boolean);
}

// Tracking tokens and video manifests add bulk and are useless to us.
const DROP_KEYS = new Set(["logging_info_token", "organic_tracking_token", "mezql_token", "video_dash_manifest"]);

export function slimRaw(post) {
  return Object.fromEntries(Object.entries(post).filter(([key]) => !DROP_KEYS.has(key)));
}

export function postedAt(post) {
  return post.taken_at ? new Date(post.taken_at * 1000).toISOString() : null;
}
