// Turns X bookmark responses (the GraphQL "Bookmarks" timeline the bookmarks
// page loads as you scroll) into ingest items. X doesn't expose when a post
// was bookmarked, so saved_at stays empty.

export function extractTweets(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const tweets = [];
  const visit = (node, depth) => {
    if (!node || typeof node !== "object" || depth > 40) return;
    // Tweets sit at entries[].content.itemContent.tweet_results.result;
    // restricted ones are wrapped in TweetWithVisibilityResults.
    if (node.tweet_results?.result) {
      const result = node.tweet_results.result;
      const tweet = result.__typename === "TweetWithVisibilityResults" ? result.tweet : result;
      if (tweet?.rest_id && tweet.legacy) tweets.push(tweet);
      return;
    }
    for (const value of Object.values(node)) visit(value, depth + 1);
  };
  visit(data, 0);
  return tweets;
}

function author(tweet) {
  const user = tweet.core?.user_results?.result ?? {};
  // X moved screen_name and name from legacy to core in 2025; read both.
  return {
    handle: user.core?.screen_name ?? user.legacy?.screen_name ?? null,
    name: user.core?.name ?? user.legacy?.name ?? null,
  };
}

function mediaFrom(tweet) {
  const media = tweet.legacy.extended_entities?.media ?? tweet.legacy.entities?.media ?? [];
  return media.map((item) => {
    const variants = (item.video_info?.variants ?? []).filter((v) => v.content_type === "video/mp4");
    const best = variants.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
    return {
      type: item.type === "photo" ? "image" : "video",
      url: item.media_url_https ?? null,
      video_url: best?.url ?? null,
      width: item.original_info?.width ?? null,
      height: item.original_info?.height ?? null,
      alt: item.ext_alt_text || null,
    };
  });
}

// Tracking and rendering metadata that adds bulk without meaning.
const DROP_KEYS = new Set(["edit_control", "unmention_data", "views", "source"]);

export function toIngestItem(tweet) {
  const { handle, name } = author(tweet);
  // Long posts keep their full text in note_tweet; legacy.full_text is cut off.
  const text = tweet.note_tweet?.note_tweet_results?.result?.text ?? tweet.legacy.full_text ?? null;
  const createdAt = tweet.legacy.created_at ? new Date(tweet.legacy.created_at) : null;
  return {
    external_id: String(tweet.rest_id),
    permalink: handle ? `https://x.com/${handle}/status/${tweet.rest_id}` : `https://x.com/i/status/${tweet.rest_id}`,
    author_handle: handle,
    author_name: name || null,
    text,
    media: mediaFrom(tweet),
    posted_at: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toISOString() : null,
    raw: Object.fromEntries(Object.entries(tweet).filter(([key]) => !DROP_KEYS.has(key))),
  };
}
