require "test_helper"

class ThumbnailCacheTest < ActiveSupport::TestCase
  setup do
    @save = SavedItem.create!(platform: "threads", external_id: "t1",
      media: [ { "type" => "image", "url" => nil }, { "type" => "image", "url" => "https://cdn.example/1.jpg" } ])
  end

  teardown { FileUtils.rm_f(@save.thumbnail_path) }

  test "downloads the first image with a url once" do
    fetched = []
    cache = ThumbnailCache.new(fetcher: ->(url) { fetched << url; "bytes" })

    assert cache.cache(@save)
    assert cache.cache(@save)
    assert_equal [ "https://cdn.example/1.jpg" ], fetched
    assert_equal "bytes", File.binread(@save.thumbnail_path)
  end

  test "skips failed, oversized, and non-https downloads" do
    assert_not ThumbnailCache.new(fetcher: ->(_) { nil }).cache(@save)
    assert_not ThumbnailCache.new(fetcher: ->(_) { "x" * (ThumbnailCache::MAX_BYTES + 1) }).cache(@save)

    @save.update!(media: [ { "type" => "image", "url" => "http://cdn.example/1.jpg" } ])
    assert_not ThumbnailCache.new(fetcher: ->(_) { flunk "should not fetch" }).cache(@save)
    assert_not File.exist?(@save.thumbnail_path)
  end
end
