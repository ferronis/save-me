require "net/http"

# Copies a save's first image to local disk. Platform CDN links are signed and
# expire within weeks, so the browse UI can't rely on them.
class ThumbnailCache
  MAX_BYTES = 5.megabytes

  def initialize(fetcher: method(:download))
    @fetcher = fetcher
  end

  # Returns true when the save has a cached thumbnail afterwards.
  def cache(save)
    return true if File.exist?(save.thumbnail_path)

    url = save.thumbnail_source_url
    return false unless url&.start_with?("https://")

    body = @fetcher.call(url)
    return false if body.nil? || body.bytesize > MAX_BYTES

    FileUtils.mkdir_p(save.thumbnail_path.dirname)
    File.binwrite(save.thumbnail_path, body)
    true
  end

  private

  def download(url)
    response = Net::HTTP.get_response(URI(url))
    response.body if response.is_a?(Net::HTTPSuccess) && response["content-type"].to_s.start_with?("image/")
  rescue StandardError => e
    Rails.logger.warn("Thumbnail download failed for #{url}: #{e.message}")
    nil
  end
end
