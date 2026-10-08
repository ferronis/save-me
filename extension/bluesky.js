// Turns Bluesky bookmark responses (app.bsky.bookmark.getBookmarks) into
// ingest items. Unlike Threads and Instagram, each bookmark carries the time it
// was saved.

export function extractBookmarks(text) {
  try {
    const data = JSON.parse(text);
    // Skip bookmarks of deleted or blocked posts, which have no post view.
    return (data.bookmarks ?? []).filter((bookmark) => bookmark?.item?.uri && bookmark.item.record);
  } catch {
    return [];
  }
}

function mediaFrom(embed) {
  if (!embed) return [];
  const type = embed.$type ?? "";
  const size = (ratio) => ({ width: ratio?.width ?? null, height: ratio?.height ?? null });

  if (type.startsWith("app.bsky.embed.images")) {
    return (embed.images ?? []).map((image) => ({
      type: "image", url: image.fullsize ?? image.thumb ?? null, video_url: null, ...size(image.aspectRatio), alt: image.alt || null,
    }));
  }
  if (type.startsWith("app.bsky.embed.video")) {
    return [{ type: "video", url: embed.thumbnail ?? null, video_url: embed.playlist ?? null, ...size(embed.aspectRatio), alt: embed.alt || null }];
  }
  if (type.startsWith("app.bsky.embed.external")) {
    const external = embed.external ?? {};
    return external.thumb ? [{ type: "link", url: external.thumb, video_url: null, width: null, height: null, alt: external.title || null }] : [];
  }
  if (type.startsWith("app.bsky.embed.recordWithMedia")) return mediaFrom(embed.media);
  return [];
}

export function toIngestItem(bookmark) {
  const post = bookmark.item;
  const handle = post.author?.handle;
  const rkey = post.uri.split("/").pop();
  return {
    external_id: post.uri,
    permalink: handle ? `https://bsky.app/profile/${handle}/post/${rkey}` : null,
    author_handle: handle ?? null,
    author_name: post.author?.displayName || null,
    text: post.record?.text ?? null,
    media: mediaFrom(post.embed),
    posted_at: post.record?.createdAt ?? post.indexedAt ?? null,
    saved_at: bookmark.createdAt ?? null,
    raw: bookmark,
  };
}
