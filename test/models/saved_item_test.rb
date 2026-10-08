require "test_helper"

class SavedItemTest < ActiveSupport::TestCase
  test "accepts X and Reddit saves" do
    assert SavedItem.new(platform: "x", external_id: "1").valid?
    assert SavedItem.new(platform: "reddit", external_id: "t3_a").valid?
  end

  test "gives the classifier X links and Reddit communities and links" do
    tweet = SavedItem.new(platform: "x", external_id: "1", raw: { "legacy" => { "entities" => { "urls" => [ { "expanded_url" => "https://glaze.example" } ] } } })
    assert_equal({ url: "https://glaze.example" }, tweet.classifier_context[:link])

    post = SavedItem.new(platform: "reddit", external_id: "t3_a", raw: { "subreddit" => "r/Pottery", "link" => "https://i.redd.it/bowl.jpg" })
    assert_equal "r/Pottery", post.classifier_context[:topic_hint]
    assert_equal({ url: "https://i.redd.it/bowl.jpg" }, post.classifier_context[:link])
  end
end
