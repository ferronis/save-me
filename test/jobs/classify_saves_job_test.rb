require "test_helper"

class ClassifySavesJobTest < ActiveJob::TestCase
  def save(id)
    SavedItem.create!(platform: "threads", external_id: id, text: "post #{id}")
  end

  # Stands in for ClaudeCli: classifies every save it is shown, or none.
  def stub_claude(classify_all: true, &block)
    calls = 0
    run = lambda do |prompt:, **|
      calls += 1
      ids = prompt.scan(/"id": (\d+)/).flatten.map(&:to_i)
      items = classify_all ? ids.map { |id| { "id" => id, "categories" => [ "AI & Coding" ], "summary" => "s", "suggested_action" => "a", "priority" => 50, "deadline_on" => nil } } : []
      { "items" => items }
    end
    ClaudeCli.stub(:run, run, &block)
    calls
  end

  test "works through every batch in one run, several at a time" do
    batch = ClassifySavesJob::BATCH_SIZE
    (batch * ClassifySavesJob::PARALLEL_BATCHES + batch + 1).times { |i| save("s#{i}") }

    calls = stub_claude { assert_no_enqueued_jobs { ClassifySavesJob.perform_now } }

    assert_equal 0, SavedItem.unclassified.count
    assert_equal ClassifySavesJob::PARALLEL_BATCHES + 2, calls
  end

  test "stops when a batch makes no progress" do
    save("s1")

    calls = stub_claude(classify_all: false) { ClassifySavesJob.perform_now }

    assert_equal 1, calls
    assert_equal 1, SavedItem.unclassified.count
  end
end
