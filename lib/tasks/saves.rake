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
end
