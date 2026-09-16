# Gopeed YouTube Extension

> **Fork Notice**: This is a fork of [monkeyWie/gopeed-extension-youtube](https://github.com/monkeyWie/gopeed-extension-youtube). Download YouTube videos easily with [Gopeed](https://gopeed.com).

> Require Gopeed version >= 1.9.0

## Install

Open the `Gopeed` extension page, enter `https://github.com/Wpnnt/gopeed-extension-youtube-1`, and click install.

![](image/install.gif)

## Usage

Create task with youtube video url, and click `Download` button, then the video will be resolved and ready to download.

![](image/create.gif)

Supported links:

- videos: `https://www.youtube.com/watch?v=aqz-KE-bpKQ`, `https://youtu.be/aqz-KE-bpKQ`, shorts and embeds
- playlists: `https://www.youtube.com/playlist?list=PL...`

### Playlists

A playlist link resolves to every video it contains, each one is listed in the task dialog and downloads into a folder named after the playlist. Videos are numbered in playlist order, and unavailable or private entries are skipped.

Resolving a playlist means fetching the streams of each video, so a large playlist takes a while to open the task dialog. Use the `Playlist Limit` setting to only take the first videos of a playlist.

Mixes and radios (`list=RD...`), the watch later list and the liked videos list are not supported, they are not public playlists.

### Quality

The default quality is set on the extension settings page:

| Setting                             | What it does                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Download Mode`                     | Video with audio in a single file, video and audio as separate files, video only, or audio only          |
| `Video Quality`                     | `Highest`, `Lowest` or a resolution, a resolution is a maximum and the closest available quality is used |
| `Audio Quality`                     | `Highest`, `Medium` (around 128kbps) or `Lowest`                                                         |
| `Choose Quality On Download`        | List every available stream in the task dialog instead of applying the defaults                          |
| `Download Playlist From Video Link` | Follow the playlist of a `watch?v=...&list=...` link instead of downloading the single video             |
| `Playlist Limit`                    | Maximum number of videos taken from a playlist, `0` means no limit                                       |

With `Choose Quality On Download` enabled, the task dialog lists one entry per resolution plus the available audio streams, so the quality can be picked for each download. Every entry is selected by default, untick the ones you don't want before clicking `Create`.

Youtube only muxes video and audio together up to 720p. For a higher quality choose `Video and audio (separate files)`, or pick a video stream and an audio stream in the task dialog, and merge them with `ffmpeg`:

```bash
ffmpeg -i video.webm -i audio.m4a -c:v copy -c:a copy output.mp4
```

## Known Limitations

- **403 Errors on Download**: Some videos may return HTTP 403 errors even when the resolved URL returns 200 outside Gopeed. This is a limitation of YouTube's content delivery restrictions. Check `core.log` in Gopeed for details.
- **Client Stability**: The `ANDROID` client is most stable for obtaining downloadable streams. `WEB` and `MWEB` clients may return URLs with decryption issues (`n` parameter).
- **Separate Streams**: Not all videos support downloading video and audio separately. Use this option cautiously; some videos may fail to resolve properly.
- **Playlists**: Resolving is done video by video, so youtube may throttle long playlists. Videos that fail are skipped and reported in `core.log`.
- **Album Playlists**: Youtube Music album playlists (`list=OLAK5uy_...`) are often made of art tracks that youtube reports as unavailable. When that happens the error message repeats what youtube answers, for example `2 unavailable videos are hidden`, and there is nothing to download.
- **Shorts & Embeds**: Support for YouTube Shorts and embedded videos is limited and may not work reliably.

## Support & Contributing

This is a fork with limited maintenance. Issues and PRs are welcome, but response times may vary. For upstream issues or questions about the original extension, refer to [monkeyWie/gopeed-extension-youtube](https://github.com/monkeyWie/gopeed-extension-youtube).

## Useful Links

- [YouTube.js](https://github.com/LuanRT/YouTube.js)
- [How to develop a gopeed extension](https://docs.gopeed.com/dev-extension.html)
- [Original Repository](https://github.com/monkeyWie/gopeed-extension-youtube)
