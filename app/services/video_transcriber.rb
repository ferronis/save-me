require "net/http"
require "open3"
require "tmpdir"

# Gets what a saved video says, so a recipe that's only spoken in the video
# can still be written out. Captions come first; when there are none, the
# audio is transcribed locally with whisper.cpp.
#
# YouTube and TikTok are fetched by permalink with yt-dlp, which also brings
# YouTube's description (Watch Later only shows the title). Instagram and
# Threads use the caption file and video URL the page already loaded: those
# platforms need a login, and Save Me never calls them itself. Their links are
# signed and expire, so this has to run soon after a sync.
class VideoTranscriber
  class Error < StandardError; end

  # Longer videos are skipped. Recipe posts are short, and a long video's
  # transcript would swamp the extractor.
  MAX_SECONDS = 180
  MAX_DOWNLOAD_BYTES = 200.megabytes
  TIMEOUT = 180
  BY_PERMALINK = %w[youtube tiktok].freeze
  # whisper's markers for sounds it doesn't transcribe, such as [Music].
  NOISE = /\[[^\]]*\]|\([^)]*music[^)]*\)|♪/i

  # Pinned to one revision and checked against its hash, since the model file
  # is loaded by native code.
  MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base.bin"
  MODEL_SHA256 = "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe"

  def self.model_path
    ENV["WHISPER_MODEL"].presence || Rails.root.join("storage", "whisper", "ggml-base.bin").to_s
  end

  # True when every tool is installed. Without them, saves go to the recipe
  # extractor with their captions only.
  def self.ready?
    path = ENV["PATH"].to_s.split(File::PATH_SEPARATOR)
    %w[yt-dlp ffmpeg ffprobe whisper-cli].all? { |tool| path.any? { |dir| File.executable?(File.join(dir, tool)) } } &&
      File.exist?(model_path)
  end

  # Plain text from a WebVTT or SRT file. YouTube's auto captions roll, so
  # each line repeats in the next cue; repeats of the previous line are dropped.
  def self.caption_text(captions)
    lines = []
    # Downloads arrive as binary, and a caption with an accent or emoji would
    # otherwise break the string handling below.
    captions.to_s.dup.force_encoding(Encoding::UTF_8).scrub.each_line do |line|
      line = line.gsub(/<[^>]*>/, "").strip
      next if line.empty? || line.match?(/\A(WEBVTT|Kind:|Language:|NOTE\b|\d+\z)/) || line.include?("-->")

      lines << line unless lines.last == line
    end
    lines.join(" ").squish.presence
  end

  def initialize(runner: method(:run!), fetcher: method(:download))
    @runner = runner
    @fetcher = fetcher
  end

  # Fills in the save's description and transcript. A failed attempt keeps
  # what it found before failing, such as YouTube's description, but leaves
  # transcript_checked_at empty, so a sync that brings fresh video links can
  # try again (see SavedItem.ingest_one).
  def transcribe(save)
    found = {}
    BY_PERMALINK.include?(save.platform) ? from_permalink(save, found) : from_page_media(save, found)
    save.update!(**found, transcript_checked_at: Time.current)
  rescue Error => e
    Rails.logger.warn("Transcript failed for save #{save.id}: #{e.message}")
    save.update!(found)
  end

  private

  def from_permalink(save, found)
    raise Error, "no permalink" if save.permalink.blank?

    info = JSON.parse(@runner.call("yt-dlp", "--dump-json", "--skip-download", "--no-warnings", "--no-playlist", save.permalink))
    found[:description] = info["description"].to_s.strip.presence
    return if info["duration"].to_f > MAX_SECONDS

    url = caption_url(info)
    transcript = (self.class.caption_text(@fetcher.call(url)) if url)
    found[:transcript] = transcript || Dir.mktmpdir do |dir|
      @runner.call("yt-dlp", "--quiet", "--no-playlist", "--format", "bestaudio/best",
        "--max-filesize", MAX_DOWNLOAD_BYTES.to_s, "--output", "#{dir}/audio.%(ext)s", save.permalink)
      audio = Dir["#{dir}/audio.*"].first
      audio && whisper(audio)
    end
  rescue JSON::ParserError
    raise Error, "yt-dlp returned non-JSON output"
  end

  def from_page_media(save, found)
    return if save.raw["video_duration"].to_f > MAX_SECONDS

    subtitles = save.raw["video_subtitles_uri"]
    transcript = (self.class.caption_text(@fetcher.call(subtitles)) if subtitles.to_s.start_with?("https://"))
    # A carousel can hold several clips, so each is transcribed in order.
    found[:transcript] = transcript || begin
      urls = save.media.filter_map { |m| m["video_url"] if m["type"] == "video" && m["video_url"].to_s.start_with?("https://") }
      urls.filter_map do |url|
        Dir.mktmpdir do |dir|
          path = File.join(dir, "video.mp4")
          # A link that no longer downloads has expired; a later sync brings a fresh one.
          raise Error, "the video link has expired" unless @fetcher.call(url, to: path)

          whisper(path)
        end
      end.join("\n\n").presence
    end
  end

  # Prefers captions someone wrote over automatic ones, in the video's own
  # language. YouTube lists an automatic track for every language it can
  # translate to; the original is the one ending in "-orig".
  def caption_url(info)
    language = info["language"].to_s.split("-").first.to_s
    written = (info["subtitles"] || {}).except("live_chat")
    automatic = info["automatic_captions"] || {}
    tracks = written.find { |code, _| code.start_with?(language) }&.last if language.present?
    tracks ||= written.values.first
    tracks ||= automatic.find { |code, _| code.end_with?("-orig") }&.last
    tracks ||= automatic[language] if language.present?
    Array(tracks).find { |track| track["ext"] == "vtt" }&.dig("url")
  end

  def whisper(path)
    duration = @runner.call("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path).to_f
    return nil if duration > MAX_SECONDS

    wav = "#{path}.wav"
    @runner.call("ffmpeg", "-loglevel", "error", "-y", "-i", path, "-vn", "-ar", "16000", "-ac", "1", wav)
    text = @runner.call("whisper-cli", "--model", self.class.model_path, "--file", wav, "--language", "auto",
      "--no-timestamps", "--no-prints")
    # whisper can split a multibyte character across tokens.
    text = text.scrub.gsub(NOISE, " ").squish
    # Over music, whisper can loop on a few made-up words ("1/2 tdm + 1/2
    # tdm ..."), which could pass for quantities. Real speech repeats far less.
    words = text.split
    return nil if words.size >= 10 && words.uniq.size < words.size / 4

    text.presence
  end

  # Runs a command and returns its stdout, killing it if it hangs.
  def run!(*command)
    Open3.popen3(*command) do |stdin, stdout, stderr, wait|
      stdin.close
      out = Thread.new { stdout.read }
      err = Thread.new { stderr.read }
      unless wait.join(TIMEOUT)
        Process.kill("KILL", wait.pid)
        raise Error, "#{command.first} timed out after #{TIMEOUT}s"
      end
      raise Error, "#{command.first} exited #{wait.value.exitstatus}: #{err.value.to_s.truncate(300)}" unless wait.value.success?

      out.value
    end
  rescue Errno::ENOENT
    raise Error, "#{command.first} isn't installed"
  end

  # Returns the body, or with to: streams it into that file and returns true.
  # Returns nil when the link has expired or the file is too big.
  def download(url, to: nil)
    uri = URI(url)
    Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: 10, read_timeout: 60) do |http|
      http.request_get(uri.request_uri) do |response|
        return nil unless response.is_a?(Net::HTTPSuccess)
        return response.read_body unless to

        size = 0
        File.open(to, "wb") do |file|
          response.read_body do |chunk|
            size += chunk.bytesize
            return nil if size > MAX_DOWNLOAD_BYTES

            file.write(chunk)
          end
        end
        return true
      end
    end
  rescue StandardError => e
    Rails.logger.warn("Download failed for #{uri&.host}: #{e.message}")
    nil
  end
end
