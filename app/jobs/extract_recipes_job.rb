# Writes out recipes for food saves the extractor hasn't looked at yet, after
# fetching what each video says. Runs after classification, since the
# categories decide which saves to check.
# Like ClassifySavesJob, it loops instead of re-enqueueing itself.
class ExtractRecipesJob < ApplicationJob
  # Smaller than the classifier's batches: a recipe's output is much longer
  # than a classification.
  BATCH_SIZE = 8

  limits_concurrency to: 1, key: "extract_recipes", duration: 1.hour

  def perform
    extractor = RecipeExtractor.new
    # Without the video tools, recipes come from captions alone.
    transcriber = VideoTranscriber.new if VideoTranscriber.ready?

    loop do
      saves = SavedItem.recipe_unchecked.order(:id).limit(BATCH_SIZE).to_a
      saves.each { |save| transcribe(transcriber, save) } if transcriber
      # Stop if a round made no progress, so a save the model keeps skipping
      # can't loop forever.
      break if extractor.extract(saves).zero?
    end
  end

  private

  # One video failing in an unexpected way shouldn't stop the run; that save's
  # recipe is written out from its caption alone.
  def transcribe(transcriber, save)
    transcriber.transcribe(save) if save.video? && save.transcript_checked_at.nil?
  rescue StandardError => e
    Rails.logger.error("Transcript crashed for save #{save.id}: #{e.class}: #{e.message}\n#{e.backtrace&.first(5)&.join("\n")}")
  end
end
