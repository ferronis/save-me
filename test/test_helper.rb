ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)
    # Each worker's database numbers saves from 1, so shared thumbnail files
    # would collide across workers.
    parallelize_setup { |worker| SavedItem.thumbnail_dir = Rails.root.join("storage", "thumbnails", "test-#{worker}") }

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # Add more helper methods to be used by all tests here...
  end
end
