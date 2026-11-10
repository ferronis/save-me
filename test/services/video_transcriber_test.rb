require "test_helper"

class VideoTranscriberTest < ActiveSupport::TestCase
  YOUTUBE_VTT = <<~VTT
    WEBVTT
    Kind: captions
    Language: en

    00:00:00.040 --> 00:00:01.589 align:start position:0%

    boil<00:00:00.120><c> the</c><00:00:00.240><c> water</c>

    00:00:01.589 --> 00:00:01.599 align:start position:0%
    boil the water
    add 2 tbsp salt

    00:00:01.599 --> 00:00:03.869 align:start position:0%
    add 2 tbsp salt
  VTT

  # Stands in for the shell: answers each tool from a table and records calls.
  class FakeRunner
    attr_reader :calls

    def initialize(outputs)
      @outputs = outputs
      @calls = []
    end

    def call(*command)
      @calls << command
      if command.first == "yt-dlp" && command.include?("--output")
        File.write(command[command.index("--output") + 1].sub("%(ext)s", "m4a"), "audio")
      end
      output = @outputs.fetch(command.first) { raise "unexpected #{command.first}" }
      output.is_a?(Exception) ? raise(output) : output
    end
  end

  def youtube(**attrs)
    SavedItem.create!(platform: "youtube", external_id: "v1", permalink: "https://www.youtube.com/watch?v=v1",
      text: "Perfect pasta", media: [ { "type" => "video" } ], **attrs)
  end

  def info(duration: 92, **extra)
    { "duration" => duration, "language" => "en-US", "description" => "Serves 2.\n500g spaghetti" }.merge(extra.stringify_keys).to_json
  end

  test "turns rolling captions into plain text" do
    assert_equal "boil the water add 2 tbsp salt", VideoTranscriber.caption_text(YOUTUBE_VTT)
    assert_equal "Hello there", VideoTranscriber.caption_text("1\n00:00:00,000 --> 00:00:01,000\nHello <i>there</i>\n")
    assert_nil VideoTranscriber.caption_text("WEBVTT\n\n")
    # Downloads arrive as binary.
    assert_equal "Crème fraîche 🍝", VideoTranscriber.caption_text("WEBVTT\n\nCrème fraîche 🍝\n".b)
  end

  test "uses YouTube's original-language captions and keeps the description" do
    save = youtube
    captions = { "fr" => [ { "ext" => "vtt", "url" => "https://t/fr" } ], "en-orig" => [ { "ext" => "json3", "url" => "https://t/json" }, { "ext" => "vtt", "url" => "https://t/orig" } ] }
    runner = FakeRunner.new("yt-dlp" => info("automatic_captions" => captions))
    fetched = []
    fetcher = ->(url, **) { fetched << url; YOUTUBE_VTT }

    VideoTranscriber.new(runner: runner, fetcher: fetcher).transcribe(save)

    save.reload
    assert_equal [ "https://t/orig" ], fetched
    assert_equal "Serves 2.\n500g spaghetti", save.description
    assert_equal "boil the water add 2 tbsp salt", save.transcript
    assert save.transcript_checked_at
  end

  test "prefers written subtitles over automatic ones" do
    save = youtube
    runner = FakeRunner.new("yt-dlp" => info(
      "subtitles" => { "live_chat" => [ { "ext" => "vtt", "url" => "https://t/chat" } ], "en" => [ { "ext" => "vtt", "url" => "https://t/written" } ] },
      "automatic_captions" => { "en-orig" => [ { "ext" => "vtt", "url" => "https://t/auto" } ] }))
    fetched = []

    VideoTranscriber.new(runner: runner, fetcher: ->(url, **) { fetched << url; "WEBVTT\n\nhi" }).transcribe(save)
    assert_equal [ "https://t/written" ], fetched
  end

  test "transcribes the audio when there are no captions, dropping music markers" do
    save = SavedItem.create!(platform: "tiktok", external_id: "t1", permalink: "https://www.tiktok.com/@a/video/1",
      text: "Feta pasta", media: [ { "type" => "video" } ])
    runner = FakeRunner.new("yt-dlp" => info(description: "Feta pasta"), "ffprobe" => "codec_type=video\ncodec_type=audio\nduration=60.1\n", "ffmpeg" => "",
      "whisper-cli" => " [Music] ♪ Bake at 400 for 40 minutes. (upbeat music)\n")

    VideoTranscriber.new(runner: runner, fetcher: ->(*) { flunk "nothing to fetch" }).transcribe(save)

    assert_equal "Bake at 400 for 40 minutes.", save.reload.transcript
    assert_equal %w[yt-dlp yt-dlp ffprobe ffmpeg whisper-cli], runner.calls.map(&:first)
  end

  test "drops whisper's looping output over music" do
    save = SavedItem.create!(platform: "tiktok", external_id: "t2", permalink: "https://www.tiktok.com/@a/video/2", media: [ { "type" => "video" } ])
    runner = FakeRunner.new("yt-dlp" => info, "ffprobe" => "codec_type=video\ncodec_type=audio\nduration=15\n", "ffmpeg" => "", "whisper-cli" => "1/2 tdm + " * 12)

    VideoTranscriber.new(runner: runner, fetcher: ->(*) { nil }).transcribe(save)
    assert_nil save.reload.transcript
  end

  test "skips videos over three minutes but keeps the description" do
    save = youtube
    runner = FakeRunner.new("yt-dlp" => info(duration: 181))

    VideoTranscriber.new(runner: runner, fetcher: ->(*) { flunk "nothing to fetch" }).transcribe(save)

    assert_nil save.reload.transcript
    assert_equal "Serves 2.\n500g spaghetti", save.description
    assert_equal 1, runner.calls.size
  end

  test "uses Instagram's caption file without calling Instagram" do
    save = SavedItem.create!(platform: "instagram", external_id: "i1", text: "Chashu",
      media: [ { "type" => "video", "video_url" => "https://cdn/v.mp4" } ],
      raw: { "video_duration" => 39.7, "video_subtitles_uri" => "https://cdn/subs.srt" })
    fetched = []

    VideoTranscriber.new(runner: FakeRunner.new({}), fetcher: ->(url, **) { fetched << url; "1\n00:00:00,000 --> 00:00:02,000\nBraise for 2 hours\n" }).transcribe(save)

    assert_equal [ "https://cdn/subs.srt" ], fetched
    assert_equal "Braise for 2 hours", save.reload.transcript
  end

  test "downloads the page's video for whisper when there's no caption file, and skips long reels" do
    reel = SavedItem.create!(platform: "threads", external_id: "th1", media: [ { "type" => "video", "video_url" => "https://cdn/v.mp4" } ])
    long = SavedItem.create!(platform: "instagram", external_id: "i2", media: [ { "type" => "video", "video_url" => "https://cdn/l.mp4" } ],
      raw: { "video_duration" => 600 })
    runner = FakeRunner.new("ffprobe" => "codec_type=video\ncodec_type=audio\nduration=30\n", "ffmpeg" => "", "whisper-cli" => "Fold in the butter.")
    fetched = []
    fetcher = ->(url, to: nil) { fetched << [ url, to.present? ]; true }

    transcriber = VideoTranscriber.new(runner: runner, fetcher: fetcher)
    transcriber.transcribe(reel)
    transcriber.transcribe(long)

    assert_equal [ [ "https://cdn/v.mp4", true ] ], fetched
    assert_equal "Fold in the butter.", reel.reload.transcript
    assert_nil long.reload.transcript
    assert long.transcript_checked_at
  end

  test "leaves the save unchecked when a tool fails, keeping the description it already found" do
    save = youtube
    runner = FakeRunner.new("yt-dlp" => info)
    runner.define_singleton_method(:call) do |*command|
      raise VideoTranscriber::Error, "Sign in to confirm you're not a bot" if command.include?("--output")

      super(*command)
    end

    VideoTranscriber.new(runner: runner, fetcher: ->(*) { nil }).transcribe(save)

    save.reload
    assert_nil save.transcript_checked_at
    assert_nil save.transcript
    assert_equal "Serves 2.\n500g spaghetti", save.description
  end

  test "transcribes every clip in a carousel, in order" do
    save = SavedItem.create!(platform: "instagram", external_id: "c1", media: [
      { "type" => "video", "video_url" => "https://cdn/1.mp4" }, { "type" => "image", "url" => "https://cdn/p.jpg" },
      { "type" => "video", "video_url" => "https://cdn/2.mp4" }
    ])
    spoken = [ "Make the dough.", "Bake for 20 minutes." ]
    runner = FakeRunner.new("ffprobe" => "codec_type=video\ncodec_type=audio\nduration=30\n", "ffmpeg" => "")
    runner.define_singleton_method(:call) { |*command| command.first == "whisper-cli" ? spoken.shift : super(*command) }
    fetched = []

    VideoTranscriber.new(runner: runner, fetcher: ->(url, to: nil) { fetched << url; true }).transcribe(save)

    assert_equal %w[https://cdn/1.mp4 https://cdn/2.mp4], fetched
    assert_equal "Make the dough.\n\nBake for 20 minutes.", save.reload.transcript
  end

  test "keeps earlier carousel clips when a later one has expired" do
    save = SavedItem.create!(platform: "instagram", external_id: "c2", media: [
      { "type" => "video", "video_url" => "https://cdn/1.mp4" }, { "type" => "video", "video_url" => "https://cdn/2.mp4" }
    ])
    runner = FakeRunner.new("ffprobe" => "codec_type=video\ncodec_type=audio\nduration=30\n", "ffmpeg" => "", "whisper-cli" => "Make the dough.")

    VideoTranscriber.new(runner: runner, fetcher: ->(url, to: nil) { url.end_with?("1.mp4") }).transcribe(save)

    save.reload
    assert_equal "Make the dough.", save.transcript
    assert_nil save.transcript_checked_at
  end

  test "treats a video with no audio track as no speech" do
    save = SavedItem.create!(platform: "instagram", external_id: "silent", media: [ { "type" => "video", "video_url" => "https://cdn/s.mp4" } ])
    runner = FakeRunner.new("ffprobe" => "codec_type=video\nduration=12.5\n")

    VideoTranscriber.new(runner: runner, fetcher: ->(*, **) { true }).transcribe(save)

    save.reload
    assert_nil save.transcript
    assert save.transcript_checked_at
    assert_equal %w[ffprobe], runner.calls.map(&:first)
  end

  test "hands a Bluesky HLS playlist straight to ffmpeg instead of downloading it" do
    save = SavedItem.create!(platform: "bluesky", external_id: "at://did:plc:a/app.bsky.feed.post/1",
      media: [ { "type" => "video", "video_url" => "https://video.bsky.app/watch/abc/playlist.m3u8" } ])
    runner = FakeRunner.new("ffprobe" => "codec_type=video\ncodec_type=audio\nduration=20\n", "ffmpeg" => "", "whisper-cli" => "Whisk the eggs.")

    VideoTranscriber.new(runner: runner, fetcher: ->(*, **) { flunk "playlists aren't downloaded" }).transcribe(save)

    assert_equal "Whisk the eggs.", save.reload.transcript
    assert_includes runner.calls.find { |c| c.first == "ffmpeg" }, "https://video.bsky.app/watch/abc/playlist.m3u8"
  end

  test "leaves a video with an expired link unchecked" do
    save = SavedItem.create!(platform: "instagram", external_id: "i3", media: [ { "type" => "video", "video_url" => "https://cdn/old.mp4" } ])

    VideoTranscriber.new(runner: FakeRunner.new({}), fetcher: ->(*, **) { nil }).transcribe(save)

    assert_nil save.reload.transcript_checked_at
  end
end
