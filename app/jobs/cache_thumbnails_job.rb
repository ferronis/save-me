# Caches thumbnails for every save that has media. Only one runs at a time; a
# job enqueued while one is running waits its turn rather than being dropped,
# so saves that arrive mid-run still get their thumbnails.
class CacheThumbnailsJob < ApplicationJob
  # Outlasts a full pass; Solid Queue's 3-minute default could let runs overlap.
  limits_concurrency to: 1, key: "cache_thumbnails", duration: 30.minutes

  def perform
    cache = ThumbnailCache.new
    SavedItem.where("jsonb_array_length(media) > 0").find_each { |save| cache.cache(save) }
  end
end
