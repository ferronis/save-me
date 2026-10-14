require "test_helper"

class Api::V1::ExtensionTokensControllerTest < ActionDispatch::IntegrationTest
  setup { ENV["INGEST_TOKEN"] = "test-token" }
  teardown { ENV.delete("INGEST_TOKEN") }

  def ask(origin)
    post "/api/v1/extension_token", headers: origin ? { "Origin" => origin } : {}
  end

  test "gives the token to an extension" do
    ask("chrome-extension://abcdefghijklmnop")
    assert_response :success
    assert_equal({ "token" => "test-token" }, response.parsed_body)
  end

  test "gives the token to a client that sends no origin" do
    ask(nil)
    assert_response :success
    assert_equal({ "token" => "test-token" }, response.parsed_body)
  end

  test "refuses web pages, including the viewer itself" do
    [ "https://evil.example", "http://localhost:3080", "null" ].each do |origin|
      ask(origin)
      assert_response :forbidden, origin
      assert_empty response.body
    end
  end

  test "has nothing to give when no token is configured" do
    ENV.delete("INGEST_TOKEN")
    ask("chrome-extension://abcdefghijklmnop")
    assert_response :not_found
  end
end
