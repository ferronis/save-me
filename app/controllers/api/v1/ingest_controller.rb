module Api
  module V1
    # Receives batches of saves from the Chrome extension.
    class IngestController < ApplicationController
      before_action :authenticate_ingest_token!

      def create
        platform = params[:platform].to_s
        items = params[:items]

        unless SavedItem::PLATFORMS.include?(platform)
          return render json: { error: "unknown platform" }, status: :unprocessable_entity
        end
        unless items.is_a?(Array)
          return render json: { error: "items must be an array" }, status: :unprocessable_entity
        end

        # The model slices each item down to SOURCE_FIELDS, so the unsafe hash
        # never reaches mass assignment unfiltered.
        # Anything that isn't an object stays as-is so the model can reject it
        # per item instead of failing the whole batch.
        result = SavedItem.ingest(platform, items.map { |item| item.respond_to?(:to_unsafe_h) ? item.to_unsafe_h : item })
        PlatformSync.record(platform)
        if result[:created].positive?
          ClassifySavesJob.perform_later
          CacheThumbnailsJob.perform_later
        end
        render json: result
      end

      private

      def authenticate_ingest_token!
        expected = ENV["INGEST_TOKEN"].to_s
        provided = request.authorization.to_s.delete_prefix("Bearer ")

        if expected.empty? || !ActiveSupport::SecurityUtils.secure_compare(provided, expected)
          head :unauthorized
        end
      end
    end
  end
end
