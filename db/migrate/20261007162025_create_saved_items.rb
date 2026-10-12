class CreateSavedItems < ActiveRecord::Migration[8.1]
  def change
    create_table :saved_items do |t|
      t.string :platform, null: false
      t.string :external_id, null: false
      t.string :permalink
      t.string :author_handle
      t.string :author_name
      t.text :text
      t.json :media, null: false, default: []
      t.json :raw, null: false, default: {}
      t.datetime :posted_at
      t.datetime :saved_at

      # Filled in by the classifier. categories holds one to three names, the
      # main one first.
      t.json :categories, null: false, default: []
      t.text :summary
      t.text :suggested_action
      t.integer :priority
      t.date :deadline_on
      t.datetime :classified_at

      t.string :status, null: false, default: "inbox"
      t.datetime :snoozed_until

      t.timestamps
    end
    add_index :saved_items, [ :platform, :external_id ], unique: true
    add_index :saved_items, [ :status, :priority ]
    add_index :saved_items, :classified_at
    add_index :saved_items, :deadline_on
  end
end
