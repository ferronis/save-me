# Solid Queue shares the primary database, so enqueue jobs only after the
# surrounding transaction commits. Otherwise a job could be picked up before its
# data is committed, or run after a rollback.
ActiveSupport.on_load(:active_job) do
  self.enqueue_after_transaction_commit = true
end
