# YouTube Video & Audio for Gopeed

**[Istruzioni in italiano](docs/README.it.md)**

Fork maintained at **https://github.com/Waph1/gopeed-extension-youtube-V1**.
Based on [monkeyWie/gopeed-extension-youtube](https://github.com/monkeyWie/gopeed-extension-youtube), including its September 2026 SABR/WebView implementation.

**Requires Gopeed 2.0.0-beta.3 or newer with the WebView runtime.** Video + audio merging additionally requires Gopeed's FFmpeg runtime. Gopeed 1.x does not provide these APIs. A headless CLI/Docker installation without a WebView cannot use this extension. This extension does not require a separate yt-dlp server.

## Install / update

1. Install [Gopeed 2.0.0-beta.3 or newer](https://github.com/GopeedLab/gopeed/releases).
2. Disable/remove the old YouTube extension to avoid two extensions handling the same URL.
3. In Gopeed → Extensions → Install, paste:

   `https://github.com/Waph1/gopeed-extension-youtube-V1`

4. Open this extension's settings and choose your defaults.
5. Create a new task with a YouTube link.

The fork's identity is now **Waph1@youtube**, rather than monkeyWie@youtube. Existing installations with the old identity must be reinstalled from the URL above; copy your preferred settings first. Subsequent updates point to this fork, not the original repository. Existing tasks made by the old extension should be recreated.

## Download modes

| Setting | Result |
| --- | --- |
| Video + audio | One MP4, automatically merged without re-encoding; also works above 720p when available |
| Audio only | One M4A/AAC or WebM/Opus file, without downloading the video track |
| Music with metadata | One M4A/AAC with embedded title/source, plus available artist, album, year, album track number and artwork |
| Video only | One silent MP4, from the available MP4 video streams |
| Separate files | One silent MP4 and one audio file; no automatic merge |

Audio is copied at an existing YouTube quality. There is **no MP3 conversion, upsampling or promise of 320 kbps**. High-resolution MP4 output may contain AV1 or VP9 if H.264 is unavailable at that resolution; player support varies.

### Music tags (2.2.0)

Select **Download Mode → Music with metadata (M4A/AAC)** to tag every audio download in that mode, including playlist entries. Alternatively, enable **Choose Quality On Download** and select an M4A file labelled `music-tags` instead of its plain `audio` variant. Quality selection still applies; this mode always uses AAC/M4A even if the ordinary audio-format preference is WebM. There is no tagged WebM or MP3 output in this version.

This is an explicit choice: a Music category/link cannot reliably distinguish a single recording from a concert, compilation or video with background music. Ordinary Audio only remains an unchanged source stream.

- Title and the source video URL (comment tag) are always written for a completed music download.
- Artist, album and release year come from the matching YouTube Music entry; album artist and track number come from the matching album when exposed. Missing fields stay empty. The uploader is not assumed to be the artist, the video upload year is not used as the release year, and playlist position is not used as an album track number.
- Available JPEG/PNG album artwork is embedded; otherwise the matching track/video thumbnail is used. Unavailable, unsupported or oversized artwork is omitted with a log warning. Artwork is limited to 2 MiB.
- Catalogue lookup has a 20-second deadline; artwork has an 8-second deadline. Failures preserve the title/source and other verified fields, with warnings in `extension.log`. Cancelling still cancels the download.
- Tags are embedded in the M4A, not saved as a sidecar. Audio bytes are copied without conversion, downloading video, external tools or FFmpeg. MP4 headers/indexes are adjusted in bounded memory; an unsupported/malformed stream fails rather than being reported as a successfully tagged file.

For a single task (also works on a playlist):

```text
https://youtu.be/ML1A1-VSWWo#gopeed:mode=music&audio=highest
```

Update the extension and create a **new task**; previously downloaded files/existing task options are not retroactively changed. Android playback and tag display still require the device checks in the manual test plan.

## Quality defaults

- **Video Quality:** Highest, Lowest, or a maximum resolution from 144p to 4320p. The highest available resolution at or below the cap is selected. If every stream is above the cap, the lowest is used. Portrait videos use their shorter side. Codec preference applies within a resolution.
- **Audio Quality:** Highest, Lowest, or approximately 64/96/128/192/256 kbps. Numeric settings select the closest existing bitrate. “Highest” refers to the selected audio container, not all codecs combined.
- **Audio File Format:** M4A/AAC or WebM/Opus for audio-only and separate files. Merged MP4 uses AAC audio. Original-language tracks are preferred over dubs/descriptive/DRC tracks when available.
- **Choose Quality On Download:** Off by default. Enable it to expose choices in Gopeed's confirmation file list.

### Choose before confirming

Gopeed exposes a selectable **file list**, not custom extension dropdowns. With “Choose Quality On Download” enabled:

- Each video entry downloads a complete video + audio MP4 at the labelled resolution cap, using your default audio quality.
- Each audio entry downloads only that audio format. When YouTube exposes descriptors, the label includes bitrate/container and the format ID.
- Each M4A audio choice also has a `music-tags` alternative with embedded music metadata.
- **Gopeed initially selects every file. Deselect all, then select only the version(s) you want.** Otherwise all alternatives will download.
- Playlist choices, and videos whose descriptors are unavailable before verification, offer maximum-quality presets rather than claiming those resolutions exist.

To change both audio and video settings for a single download without changing defaults, append a fragment to the URL:

```text
https://www.youtube.com/watch?v=aqz-KE-bpKQ#gopeed:mode=muxed&video=1080p&audio=128
https://youtu.be/aqz-KE-bpKQ#gopeed:mode=audio&audio=highest&container=webm
```

Accepted fragment keys:

| Key | Values |
| --- | --- |
| `mode` | `muxed`, `audio`, `music` (tagged M4A), `video`, `separate` |
| `video` | `highest`, `lowest`, `144p`, `240p`, `360p`, `480p`, `720p`, `1080p`, `1440p`, `2160p`, `4320p` |
| `audio` | `highest`, `lowest`, `64`, `96`, `128`, `192`, `256` |
| `container` | `m4a`, `webm` |

A `#gopeed:` fragment disables the alternative-file list for that task. It is not sent to YouTube. It also works on playlist URLs and applies to every selected entry. Unknown/invalid options report an error instead of being ignored.

## Playlists and YouTube Music albums

Supported hosts include youtube.com, www.youtube.com, m.youtube.com, music.youtube.com and youtu.be. Video links include watch, Shorts, live archives, embed and shortened links.

Public playlist links and album IDs beginning with `OLAK5uy` are supported. The same album link can come from either YouTube or YouTube Music. Album listing falls back to the Music client if the regular playlist request fails or is empty.

Example:

```text
https://youtube.com/playlist?list=OLAK5uy_m7WK0j-v1eLCguUDonKUjJs7Rjza-6lKg
```

- Entries are numbered in their original order; repeated tracks are preserved.
- Private/unavailable entries reported by the listing are skipped. A track that fails only at download time appears as a failed task instead of disappearing silently.
- Pagination loads the whole list. A continuation failure is an error, not a silently truncated playlist.
- **Playlist Limit** limits the number of playable entries; `0` means no user limit. A safety ceiling of 1000 pages prevents an endless loop.
- Playback verification/stream preparation happens only when each download starts. Long queues do not reuse expired URLs from the initial playlist scan.
- A `watch?v=...&list=...` link downloads the single video by default. Enable **Download Playlist From Video Link** to follow its playlist.
- Radio/Mixes (`RD...`), Watch Later (`WL`) and Liked Videos (`LL`) are not supported. Ongoing live streams and upcoming videos are not supported.

## Troubleshooting

- **Old Gopeed / missing WebView:** upgrade to the version above and use a build with WebView support. Runtime requirements are checked explicitly.
- **Zero speed at the beginning:** player extraction and YouTube playback verification happen before media arrives. Merging also needs temporary disk space.
- **Paused or restarted downloads:** SABR output is not byte-range resumable. The extension generates a fresh stream; restarting can redownload from the beginning.
- **403 / unavailable / sign-in required:** an optional YouTube Cookie setting is available. It does not guarantee access to account-, region- or age-restricted videos. Never put cookies in an issue or log you share.
- **No audio in video:** “Video only” is intentionally silent. Use “Video + audio”.
- **All qualities downloading:** turn off “Choose Quality On Download”, or deselect all alternatives and select the wanted ones.
- **Audio bitrate differs from the label:** defaults/presets describe a target. YouTube may offer different formats or bitrates per track. Available-source format choices pin the audio format ID.

The extension retries a failed task automatically at most once. See Gopeed's `logs/extension.log` and `logs/core.log` for diagnosis. Report the Gopeed version, OS, public URL, mode and error, without cookies or signed stream URLs.

## Development and validation

```bash
npm ci
npm test
npm run test:media # Optional locally; requires ffmpeg/ffprobe, mandatory in CI
npm run lint
npm run build
# Optional native-engine smoke check (requires Go 1.25.4+):
cd test/goja && go run .
```

`dist/index.js` is committed because Gopeed executes the built artifact directly. Build also generates `.generated/bgutils.js` for the embedded WebView script; this intermediate file is not committed. The package lock and exact playback dependencies make builds reproducible. License notices produced by the bundler are retained.

See [docs/VALIDATION.md](docs/VALIDATION.md) for what was actually tested and the remaining limits. Offline tests are not evidence that YouTube will accept a particular account/network/device. This project cannot guarantee continued compatibility after YouTube changes.

## Technical references / attribution

- [Gopeed extension documentation](https://gopeed.com/docs/dev-extension)
- [Gopeed 2.0.0-beta.3 runtime](https://github.com/GopeedLab/gopeed/tree/v2.0.0-beta.3/pkg/download/engine/inject)
- [Gopeed resource/file model](https://github.com/GopeedLab/gopeed/blob/v2.0.0-beta.3/pkg/base/model.go)
- [Original extension, imported base eeb78d1](https://github.com/monkeyWie/gopeed-extension-youtube/tree/eeb78d168e053e9a2aad1dbaa309fc11f6992f7c)
- [YouTube.js](https://github.com/LuanRT/YouTube.js)
- [googlevideo](https://github.com/LuanRT/googlevideo)
- [BgUtils](https://github.com/LuanRT/BgUtils)

The SABR framing, bounded buffering, browser profile, verification, cookie handling and associated baseline tests derive from the original extension. This fork adds download modes, audio selection, quality caps, per-download overrides, Music-album fallback, playlist limits and further regression tests.
