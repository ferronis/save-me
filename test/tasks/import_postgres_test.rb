require "test_helper"
require "rake"

class ImportPostgresTest < ActiveSupport::TestCase
  setup do
    Rails.application.load_tasks unless Rake::Task.task_defined?("saves:import_postgres")
    Rake::Task["saves:import_postgres"].reenable
  end

  test "copies saves with their ids, categories, and classification" do
    tables = {
      "saved_items" => [ { "id" => 41, "platform" => "threads", "external_id" => "a", "text" => "focaccia",
        "categories" => [ "Cooking", "Baking" ], "media" => [], "raw" => { "pk" => "a" }, "status" => "done",
        "priority" => 70, "classified_at" => "2026-10-08T12:00:00", "created_at" => "2026-10-08T11:00:00",
        "updated_at" => "2026-10-08T12:00:00", "category" => "dropped column" } ],
      "platform_syncs" => [ { "id" => 1, "platform" => "threads", "synced_at" => "2026-10-08T11:00:00",
        "created_at" => "2026-10-08T11:00:00", "updated_at" => "2026-10-08T11:00:00" } ]
    }
    psql = ->(*command) { [ tables.fetch(command.last[/FROM (\w+)/, 1]).to_json, Struct.new(:success?).new(true) ] }

    Open3.stub(:capture2, psql) { capture_io { Rake::Task["saves:import_postgres"].invoke } }

    save = SavedItem.find(41)
    assert_equal [ [ "Cooking", "Baking" ], "done", 70, { "pk" => "a" } ], [ save.categories, save.status, save.priority, save.raw ]
    assert_equal Time.utc(2026, 10, 8, 12), save.classified_at
    assert_equal [ "threads" ], PlatformSync.pluck(:platform)
  end

  test "leaves the database empty when a later table fails, so it can be run again" do
    psql = ->(*command) {
      ok = command.last.include?("saved_items")
      json = ok ? [ { "id" => 1, "platform" => "threads", "external_id" => "a", "created_at" => "2026-10-08T11:00:00",
        "updated_at" => "2026-10-08T11:00:00" } ].to_json : ""
      [ json, Struct.new(:success?).new(ok) ]
    }

    Open3.stub(:capture2, psql) do
      assert_raises(SystemExit) { capture_io { Rake::Task["saves:import_postgres"].invoke } }
    end

    assert_not SavedItem.exists?
  end

  test "refuses to import into a database that already has saves" do
    SavedItem.create!(platform: "threads", external_id: "x")

    assert_raises(SystemExit) { capture_io { Rake::Task["saves:import_postgres"].invoke } }
  end
end
