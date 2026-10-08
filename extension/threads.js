// Turns Threads GraphQL payloads into ingest items for the Save Me server.
import { mediaList, postedAt, slimRaw } from "./media.js";

// Meta prefixes some responses with an anti-hijacking guard and may stream
// several JSON documents separated by newlines.
export function parsePayload(text) {
  const body = text.replace(/^for \(;;\);/, "");
  try {
    return [JSON.parse(body)];
  } catch {
    return body.split("\n").flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  }
}

export function findSavedMedia(node, found = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 60) return found;
  if (node.saved_media?.edges) {
    found.push(node.saved_media);
    return found;
  }
  for (const value of Object.values(node)) findSavedMedia(value, found, depth + 1);
  return found;
}

export function extractPosts(text) {
  const posts = [];
  for (const doc of parsePayload(text)) {
    for (const savedMedia of findSavedMedia(doc)) {
      for (const edge of savedMedia.edges) {
        for (const item of edge?.node?.thread_items ?? []) {
          if (item?.post?.pk) posts.push(item.post);
        }
      }
    }
  }
  return posts;
}

export function toIngestItem(post) {
  const username = post.user?.username;
  return {
    external_id: String(post.pk),
    permalink: username && post.code ? `https://www.threads.com/@${username}/post/${post.code}` : null,
    author_handle: username ?? null,
    author_name: post.user?.full_name || null,
    text: post.caption?.text ?? null,
    media: mediaList(post),
    posted_at: postedAt(post),
    raw: slimRaw(post),
  };
}
