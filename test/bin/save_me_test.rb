require "test_helper"
require "open3"

class SaveMeLauncherTest < ActiveSupport::TestCase
  LAUNCHER = Rails.root.join("bin/save-me").to_s

  test "reads settings as plain KEY=value lines and records where claude lives" do
    Dir.mktmpdir do |dir|
      tools = File.join(dir, "My Tools")
      FileUtils.mkdir_p(tools)
      File.write(File.join(tools, "claude"), "#!/bin/sh\n")
      File.chmod(0o755, File.join(tools, "claude"))
      config = File.join(dir, "save-me.env")
      File.write(config, <<~ENV)
        # A comment, with = in it
        CLASSIFIER_INTERESTS=pottery, sourdough, and home robotics
        INGEST_TOKEN="a b=c"
        SECRET_KEY_BASE=test
      ENV

      out, err, status = Open3.capture3({ "SAVE_ME_CONFIG" => config, "PATH" => "#{tools}:/usr/bin:/bin" }, LAUNCHER, "setup")

      assert status.success?, err
      assert_includes out, "paste this ingest token into its settings: a b=c"
      assert_includes File.read(config), "CLAUDE_BIN=#{tools}/claude\n"

      out, err, status = Open3.capture3({ "SAVE_ME_CONFIG" => config, "PATH" => ENV["PATH"] }, LAUNCHER,
        "runner", "puts ENV['CLASSIFIER_INTERESTS']")
      assert status.success?, err
      assert_equal "pottery, sourdough, and home robotics\n", out
    end
  end

  test "creates a private settings file with a token on first run" do
    Dir.mktmpdir do |dir|
      config = File.join(dir, "save-me.env")

      out, _err, status = Open3.capture3({ "SAVE_ME_CONFIG" => config, "PATH" => "/usr/bin:/bin" }, LAUNCHER, "setup")

      assert status.success?
      assert_match(/^INGEST_TOKEN=\h{64}$/, File.read(config))
      assert_match(/token .*: \h{64}$/, out)
      assert_equal 0o600, File.stat(config).mode & 0o777
    end
  end
end
