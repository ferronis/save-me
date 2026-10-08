class AddDeadlineOnToSavedItems < ActiveRecord::Migration[8.1]
  def change
    add_column :saved_items, :deadline_on, :date
    add_index :saved_items, :deadline_on
  end
end
