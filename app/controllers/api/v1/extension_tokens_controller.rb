module Api
  module V1
    # Hands the ingest token to the Save Me extension so nobody has to copy it
    # out of the settings file. Browsers always send Origin on a POST and
    # pages can't change it, so requiring a chrome-extension:// origin (or
    # none, from a non-browser client that could read the settings file
    # anyway) keeps the token from every web page, including this server's
    # own viewer. Cross-origin pages couldn't read the response regardless,
    # since there are no CORS headers, and config.hosts blocks DNS rebinding.
    class ExtensionTokensController < ApplicationController
      def create
        token = ENV["INGEST_TOKEN"].to_s
        return head :not_found if token.empty?

        origin = request.headers["Origin"].to_s
        return head :forbidden unless origin.empty? || origin.start_with?("chrome-extension://")

        render json: { token: token }
      end
    end
  end
end
