// Turns saved items read from old.reddit.com's saved page into ingest items.
// relay.js reads each `.thing` element's data attributes in the page (the
// service worker has no DOM) and sends them here as JSON.

export function extractThings(text) {
  try {
    const things = JSON.parse(text);
    return Array.isArray(things) ? things.filter((thing) => thing?.fullname) : [];
  } catch {
    return [];
  }
}

// Old Reddit uses placeholder words instead of thumbnail URLs for some posts.
const NOT_IMAGES = new Set(["self", "default", "nsfw", "spoiler", "image", ""]);

export function toIngestItem(thing) {
  const isComment = thing.fullname.startsWith("t1_");
  const thumbnail = thing.thumbnail && !NOT_IMAGES.has(thing.thumbnail)
    ? (thing.thumbnail.startsWith("//") ? `https:${thing.thumbnail}` : thing.thumbnail)
    : null;
  const external = thing.url && !thing.url.startsWith("/r/") && !thing.url.includes("reddit.com/r/") ? thing.url : null;
  const text = isComment
    ? thing.body || null
    : [thing.title, thing.body].filter(Boolean).join("\n\n") || null;

  return {
    external_id: thing.fullname,
    permalink: thing.permalink ? `https://www.reddit.com${thing.permalink}` : null,
    author_handle: thing.author ?? null,
    author_name: null,
    text,
    media: thumbnail ? [{ type: "image", url: thumbnail, video_url: null, width: null, height: null, alt: null }] : [],
    posted_at: thing.timestamp ? new Date(Number(thing.timestamp)).toISOString() : null,
    raw: { ...thing, link: external },
  };
}
