// Turns Instagram saved-feed responses into ingest items.
import { mediaList, postedAt, slimRaw } from "./media.js";

// The feed responds with { items: [{ media }, ...], more_available, next_max_id }.
export function extractMedias(text) {
  try {
    const data = JSON.parse(text.replace(/^for \(;;\);/, ""));
    return (data.items ?? []).map((item) => item?.media).filter((media) => media?.pk);
  } catch {
    return [];
  }
}

export function toIngestItem(media) {
  const username = media.user?.username ?? media.owner?.username;
  const path = media.product_type === "clips" ? "reel" : "p";
  return {
    external_id: String(media.pk),
    permalink: media.code ? `https://www.instagram.com/${path}/${media.code}/` : null,
    author_handle: username ?? null,
    author_name: media.user?.full_name || null,
    text: media.caption?.text ?? null,
    media: mediaList(media),
    posted_at: postedAt(media),
    raw: slimRaw(media),
  };
}
