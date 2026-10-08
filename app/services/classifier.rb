# Sorts saves into categories and decides what to do with each, using Claude.
class Classifier
  STARTER_CATEGORIES = [
    "AI & Coding", "Recipes", "Pottery", "Gardening", "Travel", "Design",
    "Business & Marketing", "Shopping", "Health & Fitness", "Home"
  ].freeze

  SCHEMA = {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "integer" },
            categories: { type: "array", items: { type: "string" } },
            summary: { type: "string" },
            suggested_action: { type: "string" },
            priority: { type: "integer" },
            deadline_on: { type: [ "string", "null" ], description: "YYYY-MM-DD" }
          },
          required: %w[id categories summary suggested_action priority deadline_on],
          additionalProperties: false
        }
      }
    },
    required: [ "items" ],
    additionalProperties: false
  }.freeze

  # Who the saves belong to, from CLASSIFIER_INTERESTS in .env. It steers
  # priority: a post that matches what they care about ranks higher.
  def self.about_the_person
    interests = ENV["CLASSIFIER_INTERESTS"].to_s.strip
    interests.empty? ? "" : " Their interests include #{interests.delete_suffix(".")}."
  end

  SYSTEM_PROMPT_TEMPLATE = <<~PROMPT.freeze
    You help one person get value out of posts they saved on social media instead of saving and forgetting them.%<about>s

    For every post you are given, return:

    - categories: one to three categories, the main one first. Add a second or third only when the post genuinely belongs to several, such as a pottery-glaze calculator app being both Pottery and Apps & Tools. Reuse existing categories whenever they fit. Only create a new one when nothing fits; keep it broad, Title Case, one to three words.
    - summary: one sentence saying what the post actually offers, specific enough to recognize later.
    - suggested_action: one concrete next step in the imperative, at most 20 words. Name the thing. Examples: "Install the Skillry skill pack and try it on a side project", "Bake this overnight focaccia this weekend", "Apply for Claude for Startups before the credits offer ends". For pure inspiration or reference, say what to keep it for.
    - priority from 0 to 100:
      - 80-100: time-sensitive with a real deadline soon, such as an expiring offer, an application window, an event, or a limited sale.
      - 50-79: clearly useful and doable soon, such as a tool to try or a recipe to cook.
      - 20-49: worth doing someday.
      - 0-19: pure inspiration, reference, or anything stale.
    - deadline_on: the date by which acting matters, as YYYY-MM-DD, only when the post states or clearly implies one. Resolve relative dates against the post's date. Otherwise null.

    Treat a saved ad like any other save: they chose to save it, so assume they are interested in the product. Name the product and suggest a concrete step such as checking price, reviews, or fit, and judge priority on how useful it looks to them, not on it being an ad. Never suggest skipping a save.

    Return exactly one entry per post, using the post's id.
  PROMPT

  def self.system_prompt
    format(SYSTEM_PROMPT_TEMPLATE, about: about_the_person)
  end

  def initialize(runner: ClaudeCli)
    @runner = runner
  end

  # Classifies the given saves and returns how many were updated. Saves the
  # model skipped stay unclassified.
  def classify(saves)
    classify_batches([ saves ])
  end

  # Sends each batch to Claude concurrently, then saves the results here on
  # the calling thread, so the worker threads never touch the database.
  def classify_batches(batches)
    batches = batches.map(&:to_a).reject(&:empty?)
    return 0 if batches.empty?

    categories = known_categories
    outputs = batches.map do |saves|
      prompt = prompt_for(saves, categories)
      Thread.new { @runner.run(prompt: prompt, system: self.class.system_prompt, schema: SCHEMA) }
    end.map(&:value)

    batches.zip(outputs).sum { |saves, output| apply(saves, output) }
  end

  private

  def apply(saves, output)
    by_id = saves.index_by(&:id)

    Array(output["items"]).count do |result|
      save = by_id.delete(result["id"])
      save&.update!(
        categories: Array(result["categories"]).map { |c| c.to_s.strip }.compact_blank.uniq.first(3),
        summary: result["summary"].to_s.strip.presence,
        suggested_action: result["suggested_action"].to_s.strip.presence,
        priority: result["priority"].to_i.clamp(0, 100),
        deadline_on: parse_date(result["deadline_on"]),
        classified_at: Time.current
      )
    end
  end

  def known_categories
    SavedItem.distinct.pluck(Arel.sql("unnest(categories)")).sort.presence || STARTER_CATEGORIES
  end

  def prompt_for(saves, categories)
    <<~PROMPT
      Today is #{Date.current.iso8601}.

      Existing categories: #{categories.join(", ")}

      Posts:
      #{JSON.pretty_generate(saves.map(&:classifier_context))}
    PROMPT
  end

  def parse_date(value)
    Date.iso8601(value.to_s)
  rescue Date::Error
    nil
  end
end
