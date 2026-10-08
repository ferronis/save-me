class CreateSavedItems < ActiveRecord::Migration[8.1]
  def change
    create_table :saved_items do |t|
      t.string :platform, null: false
      t.string :external_id, null: false
      t.string :permalink
      t.string :author_handle
      t.string :author_name
      t.text :text
      t.jsonb :media, null: false, default: []
      t.jsonb :raw, null: false, default: {}
      t.datetime :posted_at
      t.datetime :saved_at

      # Filled in by the classifier.
      t.string :category
      t.text :summary
      t.text :suggested_action
      t.integer :priority
      t.datetime :classified_at

      t.string :status, null: false, default: "inbox"
      t.datetime :snoozed_until

      t.timestamps
    end
    add_index :saved_items, [ :platform, :external_id ], unique: true
    add_index :saved_items, [ :status, :priority ]
    add_index :saved_items, :category
    add_index :saved_items, :classified_at
  end
end
