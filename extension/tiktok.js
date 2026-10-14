// Turns TikTok Favorites responses (/api/user/collect/item_list/, which the
// Favorites tab on your profile loads as you scroll) into ingest items.
// TikTok doesn't expose when a video was favorited, so saved_at stays empty.

export function extractItems(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  return (data?.itemList ?? []).filter((item) => item?.id);
}

function mediaFrom(item) {
  // Photo posts carry an image carousel instead of a video.
  const images = item.imagePost?.images ?? [];
  if (images.length) {
    return images.map((image) => ({
      type: "image",
      url: image.imageURL?.urlList?.[0] ?? null,
      video_url: null,
      width: image.imageWidth ?? null,
      height: image.imageHeight ?? null,
      alt: null,
    }));
  }
  const video = item.video ?? {};
  const cover = video.cover || video.originCover || video.dynamicCover;
  if (!cover) return [];
  return [{ type: "video", url: cover, video_url: null, width: video.width ?? null, height: video.height ?? null, alt: null }];
}

export function toIngestItem(item) {
  const handle = item.author?.uniqueId ?? null;
  const kind = item.imagePost?.images?.length ? "photo" : "video";
  const createdAt = item.createTime ? new Date(Number(item.createTime) * 1000) : null;
  return {
    external_id: String(item.id),
    permalink: `https://www.tiktok.com/@${encodeURIComponent(handle ?? "_")}/${kind}/${item.id}`,
    author_handle: handle,
    author_name: item.author?.nickname || null,
    text: item.desc || null,
    media: mediaFrom(item),
    posted_at: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toISOString() : null,
    // Video URLs, bitrate ladders, and tracking fields are most of an item's size.
    raw: {
      id: String(item.id),
      desc: item.desc ?? null,
      createTime: item.createTime ?? null,
      author: { uniqueId: handle, nickname: item.author?.nickname ?? null },
      music: item.music ? { title: item.music.title ?? null, authorName: item.music.authorName ?? null } : null,
      hashtags: (item.textExtra ?? []).map((tag) => tag.hashtagName).filter(Boolean),
      duration: item.video?.duration ?? null,
      stats: item.stats ?? null,
    },
  };
}
