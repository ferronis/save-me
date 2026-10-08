require "test_helper"

class ClaudeCliTest < ActiveSupport::TestCase
  test "returns structured output" do
    assert_equal({ "items" => [] }, ClaudeCli.parse({ is_error: false, structured_output: { items: [] } }.to_json))
  end

  test "raises when claude reports an error" do
    error = assert_raises(ClaudeCli::Error) { ClaudeCli.parse({ is_error: true, result: "rate limited" }.to_json) }
    assert_match "rate limited", error.message
  end

  test "raises on missing structured output or non-JSON output" do
    assert_raises(ClaudeCli::Error) { ClaudeCli.parse({ is_error: false, result: "hi" }.to_json) }
    assert_raises(ClaudeCli::Error) { ClaudeCli.parse("Not logged in") }
  end
end
