class AddVideoTextToSavedItems < ActiveRecord::Migration[8.1]
  def change
    # What a saved video says, for the recipe extractor: the description the
    # platform shows under it (YouTube and TikTok) and its captions or a
    # local transcription. transcript_checked_at records that we've tried.
    add_column :saved_items, :description, :text
    add_column :saved_items, :transcript, :text
    add_column :saved_items, :transcript_checked_at, :datetime
  end
end
