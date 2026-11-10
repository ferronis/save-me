require "test_helper"

class RecipeExtractorTest < ActiveSupport::TestCase
  # Records the call and returns canned output, standing in for ClaudeCli.
  class FakeRunner
    attr_reader :calls

    def initialize(output)
      @output = output
      @calls = []
    end

    def run(**args)
      @calls << args
      @output
    end
  end

  def save(id, **attrs)
    SavedItem.create!(platform: "instagram", external_id: id, text: "post #{id}", categories: [ "Cooking" ], **attrs)
  end

  def result(id, **overrides)
    { "id" => id, "is_recipe" => true, "title" => "Gyudon", "yield" => nil,
      "ingredients" => [], "steps" => [], "notes" => [] }.merge(overrides.stringify_keys)
  end

  test "stores the recipe and keeps missing quantities missing" do
    a = save("a")
    runner = FakeRunner.new("items" => [
      result(a.id, yield: " Serves 4 ",
        ingredients: [
          { "section" => nil, "quantity" => "2 cups", "item" => "rice" },
          { "section" => "Sauce", "quantity" => "", "item" => " soy sauce " },
          { "section" => nil, "quantity" => nil, "item" => "" }
        ],
        steps: [ "Add everything to the rice cooker.", " " ],
        notes: [ "Sauce quantities aren't given." ])
    ])

    assert_equal 1, RecipeExtractor.new(runner: runner).extract([ a ])

    a.reload
    assert a.recipe_checked_at
    assert_equal({
      "title" => "Gyudon", "yield" => "Serves 4",
      "ingredients" => [
        { "section" => nil, "quantity" => "2 cups", "item" => "rice" },
        { "section" => "Sauce", "quantity" => nil, "item" => "soy sauce" }
      ],
      "steps" => [ "Add everything to the rice cooker." ],
      "notes" => [ "Sauce quantities aren't given." ]
    }, a.recipe)
  end

  test "marks posts that aren't recipes, or have nothing to cook from, as checked with no recipe" do
    ad = save("ad")
    empty = save("empty")
    skipped = save("skipped")
    runner = FakeRunner.new("items" => [
      result(ad.id, is_recipe: false, ingredients: [ { "section" => nil, "quantity" => nil, "item" => "bread bag" } ]),
      result(empty.id),
      result(999_999, steps: [ "Ignored" ])
    ])

    assert_equal 2, RecipeExtractor.new(runner: runner).extract([ ad, empty, skipped ])
    assert ad.reload.recipe_checked_at
    assert_nil ad.recipe
    assert_nil empty.reload.recipe
    assert_nil skipped.reload.recipe_checked_at
  end

  test "sends the whole caption, past the classifier's cutoff" do
    long = save("long", text: "#{"x" * 3000} END")
    runner = FakeRunner.new("items" => [])

    RecipeExtractor.new(runner: runner).extract([ long ])
    assert_includes runner.calls.first[:prompt], "x END"
  end

  test "sends the video's description and transcript, but not a description that repeats the caption" do
    youtube = save("yt", platform: "youtube", text: "Pad thai", description: "2 tbsp fish sauce", transcript: "soak the noodles")
    tiktok = save("tt", platform: "tiktok", text: "Feta pasta", description: "Feta pasta ")
    runner = FakeRunner.new("items" => [])

    RecipeExtractor.new(runner: runner).extract([ youtube, tiktok ])

    prompt = runner.calls.first[:prompt]
    assert_includes prompt, '"description": "2 tbsp fish sauce"'
    assert_includes prompt, '"transcript": "soak the noodles"'
    assert_equal 1, prompt.scan('"description"').size
  end

  test "skips the call for an empty batch" do
    runner = FakeRunner.new("items" => [])
    assert_equal 0, RecipeExtractor.new(runner: runner).extract([])
    assert_empty runner.calls
  end
end
