class SaveMe < Formula
  desc "Pull your saved social posts into one local feed, sorted by Claude"
  homepage "https://github.com/ferronis/save-me"
  license "MIT"
  head "https://github.com/ferronis/save-me.git", branch: "main"

  depends_on "node" => :build
  depends_on "ruby@3.3"

  def install
    cd "frontend" do
      system "npm", "ci"
      system "npm", "run", "build"
    end

    libexec.install %w[app bin config db lib public Gemfile Gemfile.lock Rakefile config.ru]
    (libexec/"tmp").mkpath
    (libexec/"log").mkpath
    # The database and cached thumbnails live outside the keg so they survive
    # upgrades.
    ln_s var/"save-me", libexec/"storage"

    ENV.prepend_path "PATH", Formula["ruby@3.3"].opt_bin
    # Homebrew builds every gem from source by default. Use the precompiled
    # gems the lockfile already lists, as a source install would.
    ENV.delete "BUNDLE_FORCE_RUBY_PLATFORM"
    cd libexec do
      system "bundle", "config", "set", "--local", "deployment", "true"
      system "bundle", "config", "set", "--local", "without", "development test"
      system "bundle", "install"
    end

    (bin/"save-me").write_env_script libexec/"bin/save-me",
      PATH:           "#{Formula["ruby@3.3"].opt_bin}:$PATH",
      SAVE_ME_CONFIG: etc/"save-me.env"
  end

  post_install_steps do
    mkdir_p "save-me", base: :var
  end

  service do
    run [opt_bin/"save-me", "server"]
    keep_alive true
    environment_variables PATH: std_service_path_env
    log_path var/"log/save-me.log"
    error_log_path var/"log/save-me.log"
  end

  def caveats
    <<~EOS
      Finish setting up:
        save-me setup                  # finds Claude Code and prints your ingest token
        brew services start save-me    # runs the server now and at login

      Then open http://localhost:3080 for the viewer, and install the browser
      extension from the README. Paste the ingest token into its settings.

      Settings: #{etc}/save-me.env
      Saves and thumbnails: #{var}/save-me
    EOS
  end

  test do
    assert_path_exists libexec/"public/index.html"
    assert_predicate bin/"save-me", :executable?
  end
end
