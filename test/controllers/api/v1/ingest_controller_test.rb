require "test_helper"

class Api::V1::IngestControllerTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  TOKEN = "test-token"

  setup { ENV["INGEST_TOKEN"] = TOKEN }
  teardown { ENV.delete("INGEST_TOKEN") }

  def ingest(body, token: TOKEN)
    post "/api/v1/ingest", params: body, as: :json,
      headers: { "Authorization" => "Bearer #{token}" }
  end

  def item(id, **extra)
    { external_id: id, permalink: "https://www.threads.com/@a/post/#{id}", text: "post #{id}" }.merge(extra)
  end

  test "rejects a wrong token" do
    ingest({ platform: "threads", items: [ item("1") ] }, token: "nope")
    assert_response :unauthorized
  end

  test "rejects everything when no token is configured" do
    ENV.delete("INGEST_TOKEN")
    ingest({ platform: "threads", items: [ item("1") ] }, token: "")
    assert_response :unauthorized
  end

  test "rejects an unknown platform" do
    ingest({ platform: "myspace", items: [ item("1") ] })
    assert_response :unprocessable_entity
  end

  test "creates new items with media and raw payload" do
    ingest({ platform: "threads", items: [
      item("1", media: [ { type: "image", url: "https://x/1.jpg" } ], raw: { pk: "1", nested: { a: 1 } }),
      item("2")
    ] })

    assert_response :success
    assert_equal({ "created" => 2, "updated" => 0, "unchanged" => 0, "errors" => [] }, response.parsed_body)
    saved = SavedItem.find_by!(platform: "threads", external_id: "1")
    assert_equal "inbox", saved.status
    assert_equal "https://x/1.jpg", saved.media.first["url"]
    assert_equal({ "a" => 1 }, saved.raw["nested"])
  end

  test "re-ingest refreshes source fields but keeps classification and status" do
    ingest({ platform: "threads", items: [ item("1") ] })
    SavedItem.last.update!(categories: [ "pottery" ], status: "done", priority: 80)

    ingest({ platform: "threads", items: [ item("1", text: "edited") ] })
    assert_equal 1, response.parsed_body["updated"]

    ingest({ platform: "threads", items: [ item("1", text: "edited") ] })
    assert_equal 1, response.parsed_body["unchanged"]

    assert_equal 1, SavedItem.count
    saved = SavedItem.last
    assert_equal [ "edited", [ "pottery" ], "done", 80 ], [ saved.text, saved.categories, saved.status, saved.priority ]
  end

  test "ignores fields outside the source whitelist" do
    ingest({ platform: "threads", items: [ item("1", categories: [ "hacked" ], status: "done", platform: "reddit") ] })

    saved = SavedItem.last
    assert_empty saved.categories
    assert_equal [ "inbox", "threads" ], [ saved.status, saved.platform ]
  end

  test "reports a bad item without dropping the rest" do
    ingest({ platform: "threads", items: [ item("1"), { text: "no id" } ] })

    body = response.parsed_body
    assert_equal 1, body["created"]
    assert_equal 1, body["errors"].first["index"]
  end

  test "enqueues classification only when something new arrived" do
    assert_enqueued_with(job: ClassifySavesJob) do
      assert_enqueued_with(job: CacheThumbnailsJob) { ingest({ platform: "threads", items: [ item("1") ] }) }
    end
    assert_no_enqueued_jobs { ingest({ platform: "threads", items: [ item("1") ] }) }
  end

  test "records when the platform last synced, even with nothing new" do
    travel_to Time.utc(2026, 10, 7, 12) do
      ingest({ platform: "threads", items: [ item("1") ] })
    end
    travel_to Time.utc(2026, 10, 8, 12) do
      ingest({ platform: "threads", items: [ item("1") ] })
    end

    assert_equal Time.utc(2026, 10, 8, 12), PlatformSync.find_by!(platform: "threads").synced_at
  end

  test "rejects non-object entries per item without dropping the rest" do
    # Rails drops nulls from JSON arrays before the controller sees them, so
    # only the string reaches the model, at index 1.
    ingest({ platform: "threads", items: [ item("1"), nil, "oops", item("2") ] })

    assert_response :success
    body = response.parsed_body
    assert_equal 2, body["created"]
    assert_equal [ [ 1, [ "Item must be an object" ] ] ], body["errors"].map { |e| [ e["index"], e["messages"] ] }
  end

  test "treats explicit null media and raw as empty" do
    ingest({ platform: "threads", items: [ item("1", media: nil, raw: nil) ] })

    assert_equal 1, response.parsed_body["created"]
    saved = SavedItem.last
    assert_equal [ [], {} ], [ saved.media, saved.raw ]
  end

  test "rejects permalinks that aren't http(s)" do
    ingest({ platform: "threads", items: [
      item("1", permalink: "javascript:alert(1)"),
      item("2", permalink: "data:text/html,hi"),
      item("3", permalink: "https://ok.example/a\njavascript:alert(1)"),
      item("4")
    ] })

    body = response.parsed_body
    assert_equal 1, body["created"]
    assert_equal [ 0, 1, 2 ], body["errors"].map { |e| e["index"] }
    assert_includes body["errors"].first["messages"].first, "http(s)"
  end
end
