require "test_helper"

class Api::V1::SavesControllerTest < ActionDispatch::IntegrationTest
  def save(id, **attrs)
    SavedItem.create!(platform: "threads", external_id: id, text: id, posted_at: Time.utc(2026, 9, 1), **attrs)
  end

  def ids_in(view = nil, **params)
    get "/api/v1/saves", params: { view: view, **params }.compact
    assert_response :success
    response.parsed_body["items"].map { |item| item["text"] }
  end

  test "do next ranks by priority, boosted by near deadlines and sunk by passed ones" do
    travel_to Date.new(2026, 10, 7) do
      save("plain", priority: 60)
      save("soon", priority: 50, deadline_on: Date.new(2026, 10, 10))
      save("this_month", priority: 55, deadline_on: Date.new(2026, 10, 30))
      save("expired", priority: 90, deadline_on: Date.new(2026, 10, 1))
      save("unclassified")

      assert_equal %w[soon this_month plain expired unclassified], ids_in("next")
    end
  end

  test "views split by status, and expired snoozes come back to do next" do
    save("inbox")
    save("done", status: "done")
    save("dismissed", status: "dismissed")
    save("sleeping", status: "snoozed", snoozed_until: 1.day.from_now)
    save("woke_up", status: "snoozed", snoozed_until: 1.day.ago)

    assert_equal %w[inbox woke_up].sort, ids_in("next").sort
    assert_equal %w[sleeping], ids_in("snoozed")
    assert_equal %w[done], ids_in("done")
    assert_equal %w[dismissed], ids_in("dismissed")
  end

  test "filters by any of a save's categories" do
    save("both", categories: [ "Pottery", "Apps & Tools" ])
    save("pottery", categories: [ "Pottery" ])
    save("ai", categories: [ "AI & Coding" ])

    assert_equal %w[both pottery].sort, ids_in("next", category: "Pottery").sort
    assert_equal %w[both], ids_in("next", category: "Apps & Tools")
  end

  test "counts categories across active saves only" do
    save("a", categories: [ "Pottery", "Apps & Tools" ])
    save("b", categories: [ "Pottery" ])
    save("c", categories: [ "Pottery" ], status: "done")

    get "/api/v1/categories"
    assert_equal [ { "name" => "Pottery", "count" => 2 }, { "name" => "Apps & Tools", "count" => 1 } ], response.parsed_body
  end

  test "pages through results" do
    (Api::V1::SavesController::PAGE_SIZE + 3).times { |i| save("s#{i}") }

    get "/api/v1/saves", params: { offset: Api::V1::SavesController::PAGE_SIZE }
    assert_equal Api::V1::SavesController::PAGE_SIZE + 3, response.parsed_body["total"]
    assert_equal 3, response.parsed_body["items"].size
  end

  test "updates status and requires a time for snoozing" do
    item = save("x")
    until_time = 1.week.from_now.change(usec: 0)

    patch "/api/v1/saves/#{item.id}", params: { status: "snoozed" }, as: :json
    assert_response :unprocessable_entity

    patch "/api/v1/saves/#{item.id}", params: { status: "snoozed", snoozed_until: until_time.iso8601 }, as: :json
    assert_response :success
    assert_equal until_time, item.reload.snoozed_until

    patch "/api/v1/saves/#{item.id}", params: { status: "done", snoozed_until: until_time.iso8601 }, as: :json
    assert_equal [ "done", nil ], [ item.reload.status, item.snoozed_until ]

    patch "/api/v1/saves/#{item.id}", params: { status: "deleted" }, as: :json
    assert_response :unprocessable_entity
  end

  test "serves a cached thumbnail and 404s without one" do
    item = save("x")
    get "/api/v1/saves/#{item.id}/thumbnail"
    assert_response :not_found

    FileUtils.mkdir_p(item.thumbnail_path.dirname)
    File.binwrite(item.thumbnail_path, "jpeg-bytes")
    get "/api/v1/saves", params: { view: "next" }
    assert_equal "/api/v1/saves/#{item.id}/thumbnail", response.parsed_body["items"].first["thumbnail_url"]
    get "/api/v1/saves/#{item.id}/thumbnail"
    assert_response :success
    assert_equal "jpeg-bytes", response.body
  ensure
    FileUtils.rm_f(item.thumbnail_path) if item
  end

  test "describes the first media item's shape and kind" do
    save("x", media: [ { "type" => "image" }, { "type" => "video", "url" => "https://cdn/v.jpg", "width" => 1080, "height" => 1920 } ])
    save("y")

    items = ids_and_items("next")
    assert_equal [ 0.563, "video" ], items["x"].values_at("media_aspect", "media_type")
    assert_equal [ nil, nil ], items["y"].values_at("media_aspect", "media_type")
  end

  def ids_and_items(view)
    get "/api/v1/saves", params: { view: view }
    response.parsed_body["items"].index_by { |item| item["text"] }
  end

  test "searches text, summary, next step, author, and categories, case-insensitively" do
    save("a", summary: "Overnight FOCACCIA recipe")
    save("b", suggested_action: "Try the glaze calculator", categories: [ "Pottery" ])
    save("c", author_handle: "focaccia_fan")
    save("d")

    assert_equal %w[a c], ids_in("next", q: "focaccia").sort
    assert_equal %w[b], ids_in("next", q: "pottery")
    assert_equal %w[b], ids_in("next", q: "glaze", category: "Pottery")
    assert_empty ids_in("next", q: "100%")
    assert_equal %w[b], ids_in("next", q: "pottery calculator")
  end

  test "searches Instagram's topic hint" do
    SavedItem.create!(platform: "instagram", external_id: "r1", text: "so satisfying",
      raw: { "visual_discovery_organic_search_query" => "pottery wheel throwing for beginners" })

    assert_equal [ "so satisfying" ], ids_in("next", q: "wheel throwing")
  end

  test "reports saves per platform and when each last synced" do
    save("a")
    save("b")
    PlatformSync.create!(platform: "threads", synced_at: Time.utc(2026, 10, 7, 15, 42))
    PlatformSync.create!(platform: "bluesky", synced_at: Time.utc(2026, 10, 7, 16))

    get "/api/v1/platform_syncs"
    assert_equal({
      "threads" => { "count" => 2, "synced_at" => "2026-10-07T15:42:00.000Z" },
      "bluesky" => { "count" => 0, "synced_at" => "2026-10-07T16:00:00.000Z" }
    }, response.parsed_body)
  end

  test "rejects snoozing into the past" do
    item = save("x")
    patch "/api/v1/saves/#{item.id}", params: { status: "snoozed", snoozed_until: 1.hour.ago.iso8601 }, as: :json
    assert_response :unprocessable_entity
    assert_equal "inbox", item.reload.status
  end
end
