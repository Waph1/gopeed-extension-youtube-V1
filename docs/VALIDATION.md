# Validation — 2026-09-20

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
