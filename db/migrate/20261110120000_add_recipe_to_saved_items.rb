class AddRecipeToSavedItems < ActiveRecord::Migration[8.1]
  def change
    # recipe stays null for saves that aren't recipes; recipe_checked_at
    # records that the extractor has looked, so it never asks twice.
    add_column :saved_items, :recipe, :json
    add_column :saved_items, :recipe_checked_at, :datetime
  end
end
