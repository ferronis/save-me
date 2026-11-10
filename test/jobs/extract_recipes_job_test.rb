require "test_helper"

class ExtractRecipesJobTest < ActiveJob::TestCase
  def save(id, categories: [ "Cooking" ], **attrs)
    SavedItem.create!(platform: "instagram", external_id: id, text: "post #{id}", categories: categories,
      classified_at: Time.current, **attrs)
  end

  # Stands in for ClaudeCli: checks every save it is shown, or none.
  def stub_claude(check_all: true, &block)
    calls = 0
    run = lambda do |prompt:, **|
      calls += 1
      ids = prompt.scan(/"id": (\d+)/).flatten.map(&:to_i)
      items = check_all ? ids.map { |id| { "id" => id, "is_recipe" => true, "title" => "Dish", "yield" => nil, "ingredients" => [], "steps" => [ "Cook it." ], "notes" => [] } } : []
      { "items" => items }
    end
    ClaudeCli.stub(:run, run, &block)
    calls
  end

  test "checks every unchecked food save and leaves other categories alone" do
    (ExtractRecipesJob::BATCH_SIZE + 1).times { |i| save("food#{i}", categories: [ i.even? ? "Cooking" : "Recipes" ]) }
    other = save("code", categories: [ "AI & Coding" ])
    done = save("done", recipe_checked_at: 1.day.ago)

    calls = stub_claude { ExtractRecipesJob.perform_now }

    assert_equal 2, calls
    assert_equal 0, SavedItem.recipe_unchecked.count
    assert_nil other.reload.recipe_checked_at
    assert_nil done.reload.recipe
  end

  test "fetches what a video says before writing out its recipe" do
    video = save("video", media: [ { "type" => "video" } ])
    photo = save("photo", media: [ { "type" => "image" } ])
    seen = []
    transcriber = Object.new
    transcriber.define_singleton_method(:transcribe) { |s| seen << s.external_id; s.update!(transcript: "spoken", transcript_checked_at: Time.current) }
    prompts = []
    run = ->(prompt:, **) { prompts << prompt; { "items" => [] } }

    VideoTranscriber.stub(:ready?, true) do
      VideoTranscriber.stub(:new, transcriber) do
        ClaudeCli.stub(:run, run) { ExtractRecipesJob.perform_now }
      end
    end

    assert_equal [ "video" ], seen
    assert_includes prompts.first, '"transcript": "spoken"'
    assert_nil photo.reload.transcript_checked_at
  end

  test "a transcript that crashes doesn't stop the others or the recipe" do
    broken = save("broken", media: [ { "type" => "video" } ])
    fine = save("fine", media: [ { "type" => "video" } ])
    transcriber = Object.new
    transcriber.define_singleton_method(:transcribe) do |s|
      raise Errno::ENOSPC if s == broken

      s.update!(transcript: "spoken", transcript_checked_at: Time.current)
    end

    VideoTranscriber.stub(:ready?, true) do
      VideoTranscriber.stub(:new, transcriber) { stub_claude { ExtractRecipesJob.perform_now } }
    end

    assert broken.reload.recipe
    assert_equal "spoken", fine.reload.transcript
  end

  test "stops when a batch makes no progress" do
    save("s1")

    calls = stub_claude(check_all: false) { ExtractRecipesJob.perform_now }

    assert_equal 1, calls
    assert_equal 1, SavedItem.recipe_unchecked.count
  end

  test "classification queues extraction once food saves are classified" do
    SavedItem.create!(platform: "threads", external_id: "new", text: "pasta")
    run = lambda do |prompt:, **|
      id = prompt[/"id": (\d+)/, 1].to_i
      { "items" => [ { "id" => id, "categories" => [ "Cooking" ], "summary" => "s", "suggested_action" => "a", "priority" => 50, "deadline_on" => nil } ] }
    end

    ClaudeCli.stub(:run, run) do
      assert_enqueued_with(job: ExtractRecipesJob) { ClassifySavesJob.perform_now }
    end
  end
end
