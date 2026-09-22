# Validation — 2026-09-22

## Version 2.2.2 — verified album lookup and artwork

- Reproduced the missing-album case using live YouTube Music responses for `SCTh2x8Kz4Q`: the official-video queue entry has an artist and video thumbnail, but no album link. Song search returns another video ID; browsing its album `MPREb_B3Inw3sN8Ga` lists the original official-video IDs. Search now discovers candidates, and the original ID must occur in the album before its fields are accepted. No fuzzy title-only assignment is used.
- The matcher handles queue primary/counterpart wrappers, checks up to three candidate albums, rejects ambiguous editions, and keeps compact successful album data (16 entries) and artwork (4 entries, at most 8 MiB) in memory for ten minutes. Failures and aborted lookups are not cached. Metadata retrieval uses the Music `/next` request without an unnecessary player request.
- Live image fetches here took about eight seconds; the previous eight-second overall artwork deadline could omit a valid cover. Artwork now has a 20-second total deadline and a ten-second per-image deadline, with smaller album image variants available as fallbacks. Cancellation remains propagated and all timers/listeners are cleaned up.
- The revised resolver was run with a real YouTube.js 18 client and live network requests for all 12 video IDs from the user's playlist `OLAK5uy_nuiuG2WyfAcLsgpacnRuV5P5o-yqQWyBU`. All returned `Lonely People With Power`, year `2025`, track numbers 1–12, album artist `Deafheaven`, and the same 544×544 JPEG album cover. Track 10 returned `Incidental III (feat. Paul Banks)`.
- These live tags were applied with the actual M4A writer to temporary copies of the user's 12 uploaded downloads. `ffprobe` read the expected album/year/track/artwork in every output. SHA-256 hashes of the copied AAC packets matched every original. This validates metadata retrieval and tagging on real downloaded media; it is not a new SABR download in the Android app.
- Cold-cache live lookups for Magnolia and Incidental III also returned the correct album and 544×544 artwork independently of the playlist cache.
- Validation passed: **69 Node tests**, **4 native media tests**, lint, production build and Goja bundle/matcher/writer checks. Webpack reports only its existing bundle-size advisories.
- A reduced fixture from the live album response is retained as `test/fixtures/deafheaven-album.json`; it contains only public album/track fields and image URLs, without menus, tracking data or credentials.
- Added regressions for all 12 original IDs, feature-name aliases, rejection of unrelated IDs, ambiguous albums, wrappers, cache reuse/expiry/eviction, cancellation and stalled artwork requests. Goja executes the album matcher and cache logic as well as the M4A writer. Run M14–M15 in the manual plan on Android after updating.

## Version 2.2.1 — tag download runtime fix

- Reproduced a tag-only failure in the Goja revision pinned by Gopeed: `Uint8Array.from('data', ...)` throws `TypeError: Value is not an object: data` while constructing the first metadata atom. Node accepts this call, which is why the original Node media tests missed the failure. The previous Goja check only initialized the bundle and did not execute the tag writer.
- MP4 atom names are now written directly as four single-byte character codes. This preserves the `0xA9` prefix of iTunes tag names; UTF-8 remains the encoding for the tag values.
- Added an executable Goja regression check to `go run .` in `test/goja`: it runs the real M4A writer with a deterministic pull adapter and split input chunks, checks completion, Unicode metadata, one-byte atom names, relocated sample offsets and unchanged media bytes. This adapter tests the writer's binary operations, not live HTTP, WebView or the Android app.
- The same fix was also exercised locally with Gopeed's actual stream JavaScript and its AAC fixture: the original writer failed and the corrected writer completed.
- Local validation passed: 60 Node tests, all four native AAC integrity/tagging tests, lint, production build and the expanded Goja checks. Webpack reports only the existing bundle-size advisories.
- A full live tagged download on Android still needs the user's device test. This patch addresses a reproduced runtime failure; it does not claim that all live metadata/network cases have been verified.

## Version 2.2.0 — music metadata

- `npm test`: **60 tests passed**, covering the existing downloads plus explicit music choices, M4A selection, lazy metadata resolution, cancellation/restart/error propagation, exact video-ID matching, missing-data fallback, artwork limits and HTTP response cleanup, malformed MP4 handling and offset relocation.
- `npm run test:media`: **4 tests passed** using actual FFmpeg/ffprobe and locally generated AAC audio. Layouts: regular faststart MP4, fragmented MP4 with absolute fragment offsets, fragmented MP4 with moof-relative offsets, and DASH MP4 with segment indexes.
- In each native media test, ffprobe reads Unicode title/artist, album, album artist, year, track number, source comment and embedded PNG artwork. Decoded audio SHA-256 hashes match the untagged original, both from the beginning and after seeking to one second. No live YouTube audio was used for these tests.
- The production bundle compiles and registers all handlers with the Goja revision pinned by Gopeed beta.3. Build/lint complete successfully; webpack still reports advisory bundle-size warnings.
- The 2.2.0 catalogue adapters were checked against the installed **YouTube.js 18.0.0** parsers (`PlaylistPanelVideo`, `MusicResponsiveListItem`, `MusicDetailHeader`, `MusicResponsiveHeader`, `TrackInfo` and `Album`) and exercised with fixtures. A public live metadata lookup for `ML1A1-VSWWo` was attempted here but **timed out**. Actual catalogue retrieval and artwork download in Gopeed remain unverified.
- No Android app, Android media scanner/player, live SABR-to-tagged-file transfer, or end-to-end device cancellation/restart is claimed tested. Run **M01–M13** in [PIANO_TEST_MANUALI.it.md](PIANO_TEST_MANUALI.it.md).

Music mode embeds iTunes-style MP4 tags while copying AAC unchanged. It buffers only bounded control boxes (4 MiB maximum per source control box) and artwork (2 MiB maximum), relocates sample/fragment absolute offsets, and rejects unsupported layouts rather than silently returning untagged/corrupt output. It uses the existing Gopeed stream/Blob runtime, **not** a Node API, external binary or FFmpeg runtime. Native FFmpeg is used for development validation only. WebM tagging and automatic music classification are deliberately not advertised.

## Previous 2.1.0 validation — 2026-09-20

## Confirmed

- `npm test`: **45 tests passed**. Includes inherited SABR framing/backpressure, browser/cookie and lifecycle tests plus regressions for audio-only/video-only/separate downloads, quality caps, portrait videos, audio container/bitrate selection, no video fallback in audio mode, per-download overrides, filename safety, album fallback and complete playlist pagination.
- `npm run lint`: passed.
- `npm run build`: passed. Webpack reports size recommendations for the self-contained bundles; no compilation errors. Both the installable extension and its embedded WebView code are built locally.
- Production `dist/index.js` compiles and registers `onResolve`, `onStart` and `onError` in the **same Goja revision used by Gopeed v2.0.0-beta.3**. This is a real JavaScript-engine check with minimal host stubs, not a complete Gopeed application test.
- Gopeed beta.3 source contains `runtime.blob`, WebView and the FFmpeg input-factory/producer-progress APIs required by the implementation.
- The actual playlist resolver, with a real YouTube.js client and live network requests, read the supplied album playlist:

  `OLAK5uy_m7WK0j-v1eLCguUDonKUjJs7Rjza-6lKg`

  Title: **Deafheaven / Bosse-De-Nage (2026 Mix)**

  | Position | Video ID | Title |
  | --- | --- | --- |
  | 1 | ML1A1-VSWWo | Punk Rock / Cody (2026 Mix) |
  | 2 | cbPAlLx6vuQ | A Mimesis of Purpose (2026 Mix) |

  Both items use YouTube's current `LockupView` shape. Titles, IDs and order were returned correctly. The Music fallback is covered by fixtures; it was not needed for this real playlist.

## Not confirmed end to end

A complete media transfer in the Gopeed application has **not** been verified here. The development environment prevents the local Chromium process from creating its required socket (`Operation not permitted`), so the WebView verification and final media-download smoke test could not run. No successful completed video/audio download is claimed from this environment.

A real unverified `getBasicInfo` request returned a valid public video's title together with `UNPLAYABLE / The page needs to be reloaded`. Accordingly, metadata resolution does not reject this pre-verification status when a title is available. Streaming availability is checked after playback verification, when SABR data is requested. This avoids a false early failure without pretending that a title proves downloadability.

The playback transport is based on the original extension's September 19, 2026 implementation, commit `eeb78d168e053e9a2aad1dbaa309fc11f6992f7c`. Platform-specific WebView, network, YouTube verification and codec behavior still require testing on the intended device.

## Reproduce locally

```bash
npm ci
npm run lint
npm test
npm run test:media # requires local ffmpeg and ffprobe
npm run build
cd test/goja
go run .
```

Go is required only for the final engine check, not to install the extension.

For device acceptance, use Gopeed 2.0.0-beta.3 or newer:

1. Install the fork and disable other YouTube extensions.
2. Download a public short video in **Video + audio**, at 720p or 1080p. Confirm playback has sound and the selected resolution follows the documented cap.
3. Repeat in **Audio only**, using M4A and WebM, then compare Highest and Lowest/128 kbps. Confirm no video track is present.
4. Enable **Choose Quality On Download**, deselect all files and choose a single variant; confirm only that variant starts.
5. Resolve the album above, select both tracks and confirm numbering/order. Try a playlist exceeding one page too.
6. Pause/restart a task. A fresh SABR stream should be created; byte-range resume is not supported, so a transfer can restart from the beginning.

Record Gopeed version, platform, public video URL, chosen mode and the actual error for failures. Do not share cookies, verification tokens or signed media URLs.
