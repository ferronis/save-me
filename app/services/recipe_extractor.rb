# Writes out the recipe in a saved food post, as closely as the post gives it.
# Posts are often incomplete (no quantities, steps only shown in the video, or
# "recipe in bio"), so anything missing stays missing and is called out in the
# notes rather than filled in.
class RecipeExtractor
  SCHEMA = {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "integer" },
            is_recipe: { type: "boolean" },
            title: { type: "string" },
            yield: { type: [ "string", "null" ], description: "Servings or amount, as the post states it" },
            ingredients: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  section: { type: [ "string", "null" ], description: "Sub-heading such as Sauce or Batter" },
                  quantity: { type: [ "string", "null" ] },
                  item: { type: "string" }
                },
                required: %w[section quantity item],
                additionalProperties: false
              }
            },
            steps: { type: "array", items: { type: "string" } },
            notes: { type: "array", items: { type: "string" } }
          },
          required: %w[id is_recipe title yield ingredients steps notes],
          additionalProperties: false
        }
      }
    },
    required: [ "items" ],
    additionalProperties: false
  }.freeze

  SYSTEM_PROMPT = <<~PROMPT.freeze
    You turn saved social media posts about food into written-out recipes the person can cook from.

    For every post you are given, return:

    - is_recipe: true when the post gives at least some of a dish's ingredients or method. False for ads, product posts, restaurant photos, tips with no dish, or a post that only names a dish and points elsewhere for everything. When false, leave every other field empty.
    - title: the dish's name, short and plain.
    - yield: servings or amount when the post says so, otherwise null.
    - ingredients: every ingredient the post mentions, in the post's order. Copy quantities and units as written. When the post gives no quantity, set quantity to null; never guess one. Use section for sub-headings the post uses (such as Sauce or Batter), otherwise null.
    - steps: the method as short imperative steps, in order. Keep the post's times, temperatures, and cues. When the post describes the method loosely, turn its words into steps without adding techniques it doesn't mention.
    - notes: what a cook needs to know about gaps, one short sentence each. Say when quantities are missing, when steps seem to be only in the video, or when the post says the full recipe is elsewhere (name where). Include tips and substitutions from the post. Empty when nothing is missing.

    A post may also carry its video's description and a transcript of what's said in the video. Both are part of the post. The transcript is automatic, so words can be misheard: fix obvious mishearings of ingredient names, and when written and spoken quantities disagree, use the written ones.

    Stay faithful to the post. Write out what it says, fix obvious typos, and never add ingredients, amounts, or steps from your own knowledge.

    Return exactly one entry per post, using the post's id.
  PROMPT

  def initialize(runner: ClaudeCli)
    @runner = runner
  end

  # Extracts recipes from the given saves and returns how many were checked.
  # Saves the model skipped stay unchecked.
  def extract(saves)
    saves = saves.to_a
    return 0 if saves.empty?

    output = @runner.run(prompt: prompt_for(saves), system: SYSTEM_PROMPT, schema: SCHEMA)
    by_id = saves.index_by(&:id)

    Array(output["items"]).count do |result|
      save = by_id.delete(result["id"])
      save&.update!(recipe: recipe_from(result), recipe_checked_at: Time.current)
    end
  end

  private

  def recipe_from(result)
    ingredients = Array(result["ingredients"]).filter_map do |ingredient|
      item = ingredient["item"].to_s.strip
      next if item.empty?

      { "section" => ingredient["section"].to_s.strip.presence, "quantity" => ingredient["quantity"].to_s.strip.presence, "item" => item }
    end
    steps = clean_list(result["steps"])
    return nil unless result["is_recipe"] && (ingredients.any? || steps.any?)

    {
      "title" => result["title"].to_s.strip.presence,
      "yield" => result["yield"].to_s.strip.presence,
      "ingredients" => ingredients,
      "steps" => steps,
      "notes" => clean_list(result["notes"])
    }
  end

  def clean_list(values)
    Array(values).map { |value| value.to_s.strip }.compact_blank
  end

  def prompt_for(saves)
    <<~PROMPT
      Posts:
      #{JSON.pretty_generate(saves.map(&:recipe_context))}
    PROMPT
  end
end
