class CreatePlatformSyncs < ActiveRecord::Migration[8.1]
  def change
    create_table :platform_syncs do |t|
      t.string :platform, null: false, index: { unique: true }
      t.datetime :synced_at, null: false
      t.timestamps
    end
  end
end
