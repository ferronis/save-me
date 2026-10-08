class ReplaceCategoryWithCategories < ActiveRecord::Migration[8.1]
  def up
    add_column :saved_items, :categories, :string, array: true, null: false, default: []
    execute "UPDATE saved_items SET categories = ARRAY[category] WHERE category IS NOT NULL"
    remove_index :saved_items, :category
    remove_column :saved_items, :category
    add_index :saved_items, :categories, using: :gin
  end

  def down
    add_column :saved_items, :category, :string
    execute "UPDATE saved_items SET category = categories[1]"
    remove_index :saved_items, :categories
    remove_column :saved_items, :categories
    add_index :saved_items, :category
  end
end
