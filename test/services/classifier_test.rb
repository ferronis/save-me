require "test_helper"

class ClassifierTest < ActiveSupport::TestCase
  # Records the call and returns canned output, standing in for ClaudeCli.
  class FakeRunner
    attr_reader :calls

    def initialize(output)
      @output = output
      @calls = []
    end

    def run(**args)
      @mutex ||= Mutex.new
      @mutex.synchronize { @calls << args }
      @output.respond_to?(:call) ? @output.call(args) : @output
    end
  end

  def save(id, **attrs)
    SavedItem.create!(platform: "threads", external_id: id, text: "post #{id}", posted_at: Time.utc(2026, 10, 1), **attrs)
  end

  test "applies results to the matching saves" do
    a = save("a")
    b = save("b")
    runner = FakeRunner.new("items" => [
      { "id" => a.id, "categories" => [ " Recipes ", "Recipes", "", "Baking", "Home", "Extra" ], "summary" => "Focaccia", "suggested_action" => "Bake it",
        "priority" => 60, "deadline_on" => nil },
      { "id" => b.id, "categories" => [ "AI & Coding" ], "summary" => "Startup credits", "suggested_action" => "Apply",
        "priority" => 140, "deadline_on" => "2026-10-20" }
    ])

    assert_equal 2, Classifier.new(runner: runner).classify([ a, b ])

    a.reload
    assert_equal [ [ "Recipes", "Baking", "Home" ], "Focaccia", "Bake it", 60, nil ], [ a.categories, a.summary, a.suggested_action, a.priority, a.deadline_on ]
    assert a.classified_at
    b.reload
    assert_equal 100, b.priority
    assert_equal Date.new(2026, 10, 20), b.deadline_on
  end

  test "leaves skipped saves unclassified and ignores unknown ids and bad dates" do
    a = save("a")
    b = save("b")
    runner = FakeRunner.new("items" => [
      { "id" => a.id, "categories" => [ "Pottery" ], "summary" => "s", "suggested_action" => "x", "priority" => 10, "deadline_on" => "next week" },
      { "id" => 999_999, "categories" => [ "Junk" ], "summary" => "s", "suggested_action" => "x", "priority" => 10, "deadline_on" => nil }
    ])

    assert_equal 1, Classifier.new(runner: runner).classify([ a, b ])
    assert_nil a.reload.deadline_on
    assert_nil b.reload.classified_at
  end

  test "sends existing categories and a compact view of each save" do
    save("old", categories: [ "Pottery", "Apps & Tools" ], classified_at: Time.current)
    fresh = save("new", text: "x" * 5000, media: [ { "type" => "image", "alt" => "a bowl" } ],
      raw: { "text_post_app_info" => { "link_preview_attachment" => { "url" => "https://glaze.example", "title" => "Glazes" } } })
    runner = FakeRunner.new("items" => [])

    Classifier.new(runner: runner).classify([ fresh ])

    prompt = runner.calls.first[:prompt]
    assert_includes prompt, "Existing categories: Apps & Tools, Pottery\n"
    assert_includes prompt, "https://glaze.example"
    assert_includes prompt, "image: a bowl"
    assert_not_includes prompt, "x" * 2001
  end

  test "falls back to starter categories when nothing is classified yet" do
    runner = FakeRunner.new("items" => [])
    Classifier.new(runner: runner).classify([ save("a") ])
    assert_includes runner.calls.first[:prompt], "AI & Coding, Recipes, Pottery"
  end

  test "skips the call for an empty batch" do
    runner = FakeRunner.new("items" => [])
    assert_equal 0, Classifier.new(runner: runner).classify([])
    assert_empty runner.calls
  end

  test "passes Instagram's topic hint to the model" do
    reel = SavedItem.create!(platform: "instagram", external_id: "r1", text: nil,
      raw: { "visual_discovery_organic_search_query" => "how to spiral wedge clay" })
    runner = FakeRunner.new("items" => [])

    Classifier.new(runner: runner).classify([ reel ])
    assert_includes runner.calls.first[:prompt], "how to spiral wedge clay"
  end

  test "classifies several batches with one call each" do
    a = save("a")
    b = save("b")
    runner = FakeRunner.new(lambda do |args|
      id = args[:prompt][/"id": (\d+)/, 1].to_i
      { "items" => [ { "id" => id, "categories" => [ "Pottery" ], "summary" => "s", "suggested_action" => "x", "priority" => 10, "deadline_on" => nil } ] }
    end)

    assert_equal 2, Classifier.new(runner: runner).classify_batches([ [ a ], [ b ], [] ])
    assert_equal 2, runner.calls.size
    assert a.reload.classified_at
    assert b.reload.classified_at
  end

  test "passes Bluesky link cards to the model" do
    post = SavedItem.create!(platform: "bluesky", external_id: "at://did:plc:abc/app.bsky.feed.post/1", text: "look",
      raw: { "item" => { "embed" => { "external" => { "uri" => "https://glaze.example", "title" => "Glaze math" } } } })
    runner = FakeRunner.new("items" => [])

    Classifier.new(runner: runner).classify([ post ])
    assert_includes runner.calls.first[:prompt], "https://glaze.example"
    assert_includes runner.calls.first[:prompt], "Glaze math"
  end

  test "tells the model about the person's interests when configured" do
    previous = ENV["CLASSIFIER_INTERESTS"]
    ENV["CLASSIFIER_INTERESTS"] = "pottery, sourdough, and home robotics."
    assert_includes Classifier.system_prompt, "Their interests include pottery, sourdough, and home robotics."

    ENV.delete("CLASSIFIER_INTERESTS")
    assert_not_includes Classifier.system_prompt, "interests"
    assert_includes Classifier.system_prompt, "Return exactly one entry per post"
  ensure
    ENV["CLASSIFIER_INTERESTS"] = previous
  end
end
