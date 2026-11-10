require "open3"

namespace :saves do
  desc "Classify every unclassified save now, without the job queue"
  task classify: :environment do
    before = SavedItem.unclassified.count
    ClassifySavesJob.perform_now
    puts "Classified #{before - SavedItem.unclassified.count}, #{SavedItem.unclassified.count} left."
  end

  desc "Write out recipes for food saves that haven't been checked yet"
  task recipes: :environment do
    ExtractRecipesJob.perform_now
    puts "#{SavedItem.where.not(recipe: nil).count} recipes, #{SavedItem.recipe_unchecked.count} saves left to check."
  end

  desc "Download the whisper.cpp speech model used to transcribe saved videos"
  task whisper_model: :environment do
    path = VideoTranscriber.model_path
    next puts("Speech model already at #{path}.") if File.exist?(path)

    FileUtils.mkdir_p(File.dirname(path))
    # Download beside the target first, so a cut-off download never looks finished.
    part = "#{path}.part"
    ok = system("curl", "--fail", "--location", "--silent", "--show-error", "--output", part, VideoTranscriber::MODEL_URL)
    abort "Couldn't download the speech model." unless ok
    unless Digest::SHA256.file(part).hexdigest == VideoTranscriber::MODEL_SHA256
      File.delete(part)
      abort "The downloaded speech model didn't match its checksum, so it wasn't installed."
    end
    File.rename(part, path)
    puts "Speech model saved to #{path}."
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
