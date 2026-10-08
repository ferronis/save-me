require "open3"
require "tmpdir"

# Runs a single-shot `claude -p` call on the local Claude Code subscription and
# returns its structured output. The flags strip the call down to a plain model
# request: no tools, no MCP servers, no user/project settings (so no hooks,
# plugins, or CLAUDE.md), and no saved session.
class ClaudeCli
  class Error < StandardError; end

  TIMEOUT = 300

  # Low effort keeps the model from spending most of its output on thinking:
  # about twice as fast for classification, with no visible loss in quality.
  def self.run(prompt:, system:, schema:, model: ENV.fetch("CLASSIFIER_MODEL", "sonnet"),
               effort: ENV.fetch("CLASSIFIER_EFFORT", "low"))
    command = [
      "claude", "-p",
      "--output-format", "json",
      "--model", model,
      "--effort", effort,
      "--tools", "",
      "--setting-sources", "",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--system-prompt", system,
      "--json-schema", schema.to_json
    ]
    parse(capture(command, prompt))
  end

  def self.parse(stdout)
    envelope = JSON.parse(stdout)
    raise Error, "claude reported an error: #{envelope["result"].to_s.truncate(500)}" if envelope["is_error"]

    envelope["structured_output"] || raise(Error, "claude returned no structured output")
  rescue JSON::ParserError
    raise Error, "claude returned non-JSON output: #{stdout.to_s.truncate(500)}"
  end

  # Runs from a temp dir so no project files are in reach, and kills the
  # process if it hangs.
  def self.capture(command, input)
    Dir.mktmpdir do |dir|
      Open3.popen3(*command, chdir: dir) do |stdin, stdout, stderr, wait|
        # Write the prompt on its own thread so a child that stops reading
        # can't block us past the deadline.
        writer = Thread.new do
          stdin.write(input)
        rescue IOError, Errno::EPIPE
          nil
        ensure
          stdin.close unless stdin.closed?
        end
        out = Thread.new { stdout.read }
        err = Thread.new { stderr.read }

        unless wait.join(TIMEOUT)
          Process.kill("TERM", wait.pid)
          writer.kill
          raise Error, "claude timed out after #{TIMEOUT}s"
        end
        writer.join
        raise Error, "claude exited #{wait.value.exitstatus}: #{err.value.to_s.truncate(500)}" unless wait.value.success?

        out.value
      end
    end
  end
end
