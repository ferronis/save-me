require "test_helper"

class SavedItemTest < ActiveSupport::TestCase
  test "accepts X, Reddit, YouTube, and TikTok saves" do
    assert SavedItem.new(platform: "x", external_id: "1").valid?
    assert SavedItem.new(platform: "reddit", external_id: "t3_a").valid?
    assert SavedItem.new(platform: "youtube", external_id: "17WoOqgXsRM").valid?
    assert SavedItem.new(platform: "tiktok", external_id: "7420").valid?
  end

  test "gives the classifier X links and Reddit communities and links" do
    tweet = SavedItem.new(platform: "x", external_id: "1", raw: { "legacy" => { "entities" => { "urls" => [ { "expanded_url" => "https://glaze.example" } ] } } })
    assert_equal({ url: "https://glaze.example" }, tweet.classifier_context[:link])

    post = SavedItem.new(platform: "reddit", external_id: "t3_a", raw: { "subreddit" => "r/Pottery", "link" => "https://i.redd.it/bowl.jpg" })
    assert_equal "r/Pottery", post.classifier_context[:topic_hint]
    assert_equal({ url: "https://i.redd.it/bowl.jpg" }, post.classifier_context[:link])
  end

  test "gives the classifier a TikTok's hashtags as its topic" do
    post = SavedItem.new(platform: "tiktok", external_id: "7420", raw: { "hashtags" => [ "pottery", "wheelthrowing" ] })
    assert_equal "pottery, wheelthrowing", post.classifier_context[:topic_hint]
  end
end
