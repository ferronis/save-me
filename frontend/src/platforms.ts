// Display names for platform ids, shared by the icons and the network filter.
const NAMES: Record<string, string> = {
  threads: 'Threads',
  instagram: 'Instagram',
  bluesky: 'Bluesky',
  x: 'X',
  reddit: 'Reddit',
  youtube: 'YouTube',
  tiktok: 'TikTok',
}

export function platformName(platform: string) {
  return NAMES[platform] ?? platform
}
