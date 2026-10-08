# When each platform last sent saves to the server.
class PlatformSync < ApplicationRecord
  def self.record(platform)
    upsert({ platform: platform, synced_at: Time.current }, unique_by: :platform)
  end
end
