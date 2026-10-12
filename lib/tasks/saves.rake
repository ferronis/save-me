require "open3"

namespace :saves do
  desc "Classify every unclassified save now, without the job queue"
  task classify: :environment do
    before = SavedItem.unclassified.count
    ClassifySavesJob.perform_now
    puts "Classified #{before - SavedItem.unclassified.count}, #{SavedItem.unclassified.count} left."
  end

  desc "Download thumbnails for saves that don't have one cached yet"
  task thumbnails: :environment do
    CacheThumbnailsJob.perform_now
    puts "#{Dir[Rails.root.join("storage/thumbnails", Rails.env, "*.jpg")].size} thumbnails cached."
  end

  # Save Me used Postgres before it moved to SQLite. Ids are kept, so cached
  # thumbnails in storage/thumbnails still match their saves.
  desc "Copy saves from an older Postgres install into an empty database"
  task :import_postgres, [ :database ] => :environment do |_, args|
    abort "This database already has saves; import only into an empty one." if SavedItem.exists?

    database = args[:database].presence || "save_me_development"
    # One transaction, so a failure partway leaves the database empty and the
    # import can simply be run again.
    ActiveRecord::Base.transaction do
      { SavedItem => "saved_items", PlatformSync => "platform_syncs" }.each do |model, table|
        json, status = Open3.capture2("psql", "-X", "-At", "-d", database,
          "-c", "SELECT COALESCE(json_agg(t), '[]') FROM #{table} t")
        abort "Couldn't read #{table} from #{database} with psql." unless status.success?

        rows = JSON.parse(json).map { |row| row.slice(*model.column_names) }
        # Batches keep each INSERT statement a reasonable size.
        rows.each_slice(500) { |batch| model.insert_all!(batch) }
        puts "Imported #{rows.size} #{table}."
      end
    end
  end
end
