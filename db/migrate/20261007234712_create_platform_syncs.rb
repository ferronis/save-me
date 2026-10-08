class CreatePlatformSyncs < ActiveRecord::Migration[8.1]
  def change
    create_table :platform_syncs do |t|
      t.string :platform, null: false, index: { unique: true }
      t.datetime :synced_at, null: false
      t.timestamps
    end

    # Best guess for syncs that happened before this table: when each
    # platform's newest save arrived.
    reversible do |dir|
      dir.up do
        execute <<~SQL
          INSERT INTO platform_syncs (platform, synced_at, created_at, updated_at)
          SELECT platform, MAX(created_at), NOW(), NOW() FROM saved_items GROUP BY platform
        SQL
      end
    end
  end
end
