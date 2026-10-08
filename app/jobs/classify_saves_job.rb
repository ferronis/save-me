# Classifies every unclassified save, several batches at a time. Only one runs
# at a time; a job enqueued while one is running waits its turn rather than
# being dropped, so saves that arrive mid-run still get picked up.
#
# It loops instead of re-enqueueing itself: a follow-up enqueued from inside
# perform hits this job's own concurrency lock and gets discarded.
class ClassifySavesJob < ApplicationJob
  BATCH_SIZE = 20
  # Claude calls in flight at once. Each takes about 25 seconds, almost all of
  # it model time, so running a few side by side is the main speedup.
  PARALLEL_BATCHES = 3

  # The lock must outlast a run: Solid Queue's default is 3 minutes, and a big
  # backlog takes longer, which would let a second run start alongside.
  limits_concurrency to: 1, key: "classify_saves", duration: 1.hour

  def perform
    classifier = Classifier.new

    loop do
      saves = SavedItem.unclassified.order(:id).limit(BATCH_SIZE * PARALLEL_BATCHES).to_a
      # Stop if a round made no progress, so a save the model keeps skipping
      # can't loop forever.
      break if classifier.classify_batches(saves.each_slice(BATCH_SIZE).to_a).zero?
    end
  end
end
