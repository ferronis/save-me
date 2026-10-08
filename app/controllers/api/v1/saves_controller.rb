module Api
  module V1
    # Read and triage saves for the browse UI. Local and single-user, so no auth.
    class SavesController < ApplicationController
      PAGE_SIZE = 50
      VIEWS = {
        "next" => -> { SavedItem.active.by_urgency },
        "snoozed" => -> { SavedItem.still_snoozed.order(:snoozed_until) },
        "done" => -> { SavedItem.where(status: "done").order(updated_at: :desc) },
        "dismissed" => -> { SavedItem.where(status: "dismissed").order(updated_at: :desc) }
      }.freeze

      def index
        scope = VIEWS.fetch(params[:view].to_s, VIEWS["next"]).call
        scope = scope.in_category(params[:category]) if params[:category].present?
        scope = scope.search(params[:q]) if params[:q].present?
        offset = params[:offset].to_i.clamp(0, 1_000_000)

        render json: {
          total: scope.count,
          items: scope.offset(offset).limit(PAGE_SIZE).map { |save| save_json(save) }
        }
      end

      # Saves per platform and when each last synced, for the extension's panel.
      def platform_syncs
        counts = SavedItem.group(:platform).count
        synced = PlatformSync.pluck(:platform, :synced_at).to_h

        render json: (counts.keys | synced.keys).index_with { |platform|
          { count: counts.fetch(platform, 0), synced_at: synced[platform] }
        }
      end

      def categories
        render json: SavedItem.active.category_counts.map { |name, count| { name: name, count: count } }
      end

      def update
        save = SavedItem.find(params[:id])
        status = params[:status].to_s
        snoozed_until = status == "snoozed" ? parse_time(params[:snoozed_until]) : nil

        if status == "snoozed" && (snoozed_until.nil? || snoozed_until <= Time.current)
          return render json: { error: "snoozed_until must be a future time" }, status: :unprocessable_entity
        end

        if save.update(status: status, snoozed_until: snoozed_until)
          render json: save_json(save)
        else
          render json: { error: save.errors.full_messages.to_sentence }, status: :unprocessable_entity
        end
      end

      def thumbnail
        save = SavedItem.find(params[:id])
        return head :not_found unless File.exist?(save.thumbnail_path)

        expires_in 1.year, public: true
        send_file save.thumbnail_path, type: "image/jpeg", disposition: "inline"
      end

      private

      def save_json(save)
        save.slice(:id, :platform, :permalink, :author_handle, :author_name, :text, :posted_at,
          :categories, :summary, :suggested_action, :priority, :deadline_on, :status, :snoozed_until)
          .merge(
            media_count: save.media.size,
            thumbnail_url: File.exist?(save.thumbnail_path) ? "/api/v1/saves/#{save.id}/thumbnail" : nil,
            # Shape and kind of the first media item, so the viewer can size the
            # image before it loads and mark videos.
            media_aspect: media_aspect(save),
            media_type: save.media.find { |m| m["url"].present? }&.dig("type")
          )
      end

      def media_aspect(save)
        first = save.media.find { |m| m["url"].present? }
        width, height = first&.values_at("width", "height")
        (width.to_f / height).round(3) if width.to_i.positive? && height.to_i.positive?
      end

      def parse_time(value)
        Time.zone.iso8601(value.to_s)
      rescue ArgumentError
        nil
      end
    end
  end
end
