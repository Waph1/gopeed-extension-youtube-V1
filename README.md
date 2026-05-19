# Gopeed YouTube Extension

> **Fork Notice**: This is a fork of [monkeyWie/gopeed-extension-youtube](https://github.com/monkeyWie/gopeed-extension-youtube). Download YouTube videos easily with [Gopeed](https://gopeed.com).

> Require Gopeed version >= 1.9.0

## Install

Open the `Gopeed` extension page, enter `https://github.com/Wpnnt/gopeed-extension-youtube-1`, and click install.

![](image/install.gif)

## Usage

Create task with youtube video url, and click `Download` button, then the video will be resolved and ready to download.

![](image/create.gif)

### Video Quality

Typically 1080p or better videos do not have audio encoded with it, this extension defaults to downloading audio and video without separation, so the video quality will all be lower than 1080p. If you want to download the highest quality video, you can choose the `audio` and `video` separately on extension settings page, and then use `ffmpeg` to merge them.

- ffmpeg command

```bash
ffmpeg -i video.webm -i audio.mp4 -c:v copy -c:a copy output.mp4
```

## Known Limitations

- **403 Errors on Download**: Some videos may return HTTP 403 errors even when the resolved URL returns 200 outside Gopeed. This is a limitation of YouTube's content delivery restrictions. Check `core.log` in Gopeed for details.
- **Client Stability**: The `ANDROID` client is most stable for obtaining downloadable streams. `WEB` and `MWEB` clients may return URLs with decryption issues (`n` parameter).
- **Separate Streams**: Not all videos support downloading video and audio separately. Use this option cautiously; some videos may fail to resolve properly.
- **Shorts & Embeds**: Support for YouTube Shorts and embedded videos is limited and may not work reliably.

## Support & Contributing

This is a fork with limited maintenance. Issues and PRs are welcome, but response times may vary. For upstream issues or questions about the original extension, refer to [monkeyWie/gopeed-extension-youtube](https://github.com/monkeyWie/gopeed-extension-youtube).

## Useful Links

- [YouTube.js](https://github.com/LuanRT/YouTube.js)
- [How to develop a gopeed extension](https://docs.gopeed.com/dev-extension.html)
- [Original Repository](https://github.com/monkeyWie/gopeed-extension-youtube)
