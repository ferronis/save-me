class SavedItem < ApplicationRecord
  PLATFORMS = %w[threads instagram bluesky x reddit pinterest].freeze
  STATUSES = %w[inbox done dismissed snoozed].freeze

  # Fields that come from the source platform. Re-ingesting an item refreshes
  # these but never touches classification or status.
  SOURCE_FIELDS = %w[permalink author_handle author_name text media raw posted_at saved_at].freeze

  validates :platform, inclusion: { in: PLATFORMS }
  validates :external_id, presence: true
  validates :status, inclusion: { in: STATUSES }

  scope :unclassified, -> { where(classified_at: nil) }

  # Inbox, plus snoozed saves whose snooze has run out.
  scope :active, -> { where(status: "inbox").or(where(status: "snoozed", snoozed_until: ..Time.current)) }
  scope :still_snoozed, -> { where(status: "snoozed", snoozed_until: Time.current..) }
  scope :in_category, ->(name) { where("? = ANY(categories)", name) }

  SEARCH_FIELDS = <<~SQL.squish.freeze
    concat_ws(' ', text, summary, suggested_action, author_handle, author_name,
      array_to_string(categories, ' '), raw->>'visual_discovery_organic_search_query', raw->>'subreddit')
  SQL

  # Every word must appear somewhere in the save, case-insensitively, so
  # "pottery wheel" finds a post about wheels tagged Pottery.
  scope :search, ->(query) {
    query.split.first(10).reduce(all) do |scope, word|
      scope.where("#{SEARCH_FIELDS} ILIKE ?", "%#{sanitize_sql_like(word)}%")
    end
  }

  # Ranks the "do next" queue: deadlines in the next week or month push a
  # save up, and a passed deadline sinks it.
  scope :by_urgency, -> {
    today = connection.quote(Date.current)
    score = <<~SQL.squish
      CASE
        WHEN deadline_on < #{today} THEN LEAST(COALESCE(priority, 0), 10)
        WHEN deadline_on <= #{today}::date + 7 THEN COALESCE(priority, 0) + 20
        WHEN deadline_on <= #{today}::date + 30 THEN COALESCE(priority, 0) + 10
        ELSE COALESCE(priority, 0)
      END
    SQL
    order(Arel.sql("#{score} DESC"), posted_at: :desc, id: :desc)
  }

  # Category name => number of saves, over the current scope.
  def self.category_counts
    names = select("unnest(categories) AS name")
    unscoped.from(names, :names).group("names.name")
      .order(Arel.sql("count(*) DESC, names.name")).count
  end

  # Upserts one batch from a single platform. Returns counts plus per-item
  # errors so one bad item doesn't sink the batch.
  def self.ingest(platform, items)
    result = { created: 0, updated: 0, unchanged: 0, errors: [] }

    items.each_with_index do |attrs, index|
      unless attrs.is_a?(Hash)
        result[:errors] << { index: index, external_id: nil, messages: [ "Item must be an object" ] }
        next
      end

      attrs = attrs.stringify_keys.slice("external_id", *SOURCE_FIELDS)
      # media and raw are NOT NULL; treat an explicit null as empty.
      attrs["media"] = [] if attrs.key?("media") && attrs["media"].nil?
      attrs["raw"] = {} if attrs.key?("raw") && attrs["raw"].nil?

      outcome = begin
        ingest_one(platform, attrs)
      rescue ActiveRecord::RecordNotUnique
        # Two syncs sent the same save at once and the other insert won; the
        # second attempt finds that row and updates it.
        ingest_one(platform, attrs)
      end

      if outcome.is_a?(Symbol)
        result[outcome] += 1
      else
        result[:errors] << { index: index, external_id: attrs["external_id"], messages: outcome }
      end
    end

    result
  end

  # Returns :created, :updated, or :unchanged, or the error messages.
  def self.ingest_one(platform, attrs)
    item = find_or_initialize_by(platform: platform, external_id: attrs["external_id"].to_s.presence)
    item.assign_attributes(attrs.slice(*SOURCE_FIELDS))
    new_record = item.new_record?
    changed = item.changed?
    return item.errors.full_messages unless item.save

    new_record ? :created : (changed ? :updated : :unchanged)
  end
  private_class_method :ingest_one

  # What the classifier sees for this save. Kept small: the raw payload can
  # run to tens of kilobytes per post.
  def classifier_context
    {
      id: id,
      platform: platform,
      author: author_handle,
      posted_on: posted_at&.to_date&.iso8601,
      text: text.to_s.truncate(2000),
      link: link_preview,
      topic_hint: topic_hint,
      media: media.map { |m| [ m["type"], m["alt"] ].compact.join(": ") }.presence
    }.compact
  end

  def thumbnail_path
    # Per environment, so test runs never see or clobber dev thumbnails.
    Rails.root.join("storage", "thumbnails", Rails.env, "#{id}.jpg")
  end

  def thumbnail_source_url
    media.find { |m| m["url"].present? }&.dig("url")
  end

  private

  # A platform's own label for what a post is about: Instagram's guess at the
  # topic (useful when a reel's caption is thin) or the Reddit community.
  def topic_hint
    case platform
    when "instagram" then raw["visual_discovery_organic_search_query"]
    when "reddit" then raw["subreddit"]
    end
  end

  def link_preview
    case platform
    when "threads"
      link = raw.dig("text_post_app_info", "link_preview_attachment")
      link && { url: link["url"], title: link["title"] }.compact.presence
    when "x"
      url = raw.dig("legacy", "entities", "urls")&.first&.dig("expanded_url")
      url && { url: url }
    when "reddit"
      raw["link"] && { url: raw["link"] }
    when "bluesky"
      embed = raw.dig("item", "embed") || {}
      link = embed["external"] || embed.dig("media", "external")
      link && { url: link["uri"], title: link["title"] }.compact.presence
    end
  end
end
