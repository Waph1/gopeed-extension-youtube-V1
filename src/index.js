import { Innertube, Platform } from 'youtubei.js';

Platform.shim.eval = async (data, env) => {
  const code = `var exportedVars;\n${(data.output || '').replace('const exportedVars =', 'exportedVars =')}`;
  return new Function(code)();
};

const youtubeReady = Innertube.create({
  cache: {
    get: async (key) => {
      const value = gopeed.storage.get(key);
      if (!value) {
        return;
      }
      return base64ToArrayBuffer(value);
    },
    set: async (key, value) => {
      gopeed.storage.set(key, arrayBufferToBase64(value));
    },
    remove: async (key) => {
      gopeed.storage.remove(key);
    },
  },
  generate_session_locally: true,
  timezone: '',
});

async function resolveVideo(videoId, quality) {
  const youtube = await youtubeReady;

  // Try ANDROID client first — direct URLs, no decipher needed, fast
  try {
    const info = await youtube.getBasicInfo(videoId, { client: 'ANDROID' });
    const formats = info.streaming_data?.formats || [];
    if (formats.length > 0 && formats[0]?.url) {
      gopeed.logger.info('[RESOLVE] ANDROID client: direct URLs available');
      return info;
    }
  } catch (err) {
    gopeed.logger.info('[RESOLVE] ANDROID client failed, falling back to WEB:', err.message);
  }

  // Fallback: WEB client with player decipher
  return youtube.getBasicInfo(videoId);
}

function getStreamUrl(info, format) {
  // ANDROID formats have direct URLs
  if (format.url) {
    return format.url;
  }
  // WEB formats need deciphering
  if (format.decipher) {
    return format.decipher(info.actions.session.player);
  }
  throw new Error('No stream URL available');
}

// https://www.youtube.com/watch?v=aqz-KE-bpKQ
// https://youtu.be/aqz-KE-bpKQ
gopeed.events.onResolve(async (ctx) => {
  const url = new URL(ctx.req.url);
  let videoId = url.searchParams.get('v');
  if (!videoId) {
    const pathParts = url.pathname.split('/');
    if (url.hostname === 'youtu.be') {
      videoId = pathParts[1];
    } else if (pathParts.includes('shorts') || pathParts.includes('embed') || pathParts.includes('v')) {
      videoId = pathParts[pathParts.length - 1];
    }
  }

  if (!videoId) {
    return;
  }

  try {
    const quality = gopeed.settings.quality === 'lowest' ? '360p' : 'best';
    const info = await resolveVideo(videoId, quality);

    const files = [];
    if (gopeed.settings.separateStreams === true) {
      const video = info.chooseFormat({
        type: 'video',
        quality,
      });
      const audio = info.chooseFormat({
        type: 'audio',
        quality,
      });
      files.push(
        {
          name: `${info.basic_info.title}.${video.quality_label}.video${mimeTypeToExt(video.mime_type, 'mp4')}`,
          size: video.content_length,
          req: {
            url: getStreamUrl(info, video),
            extra: {
              header: {
                'User-Agent': 'com.google.android.youtube/19.29.37 (Linux; U; Android 11) gzip',
                'Referer': 'https://www.youtube.com/',
              },
            },
          },
        },
        {
          name: `${info.basic_info.title}.${parseInt(audio.bitrate / 1000)}kbps.audio${mimeTypeToExt(
            audio.mime_type,
            'webm'
          )}`,
          size: audio.content_length,
          req: {
            url: getStreamUrl(info, audio),
            extra: {
              header: {
                'User-Agent': 'com.google.android.youtube/19.29.37 (Linux; U; Android 11) gzip',
                'Referer': 'https://www.youtube.com/',
              },
            },
          },
        }
      );
    } else {
      const bestFormat = info.chooseFormat({
        type: 'video+audio',
        quality,
      });
      files.push({
        name: `${info.basic_info.title}.${bestFormat.quality_label}${mimeTypeToExt(bestFormat.mime_type, 'mp4')}`,
        size: bestFormat.content_length,
        req: {
          url: getStreamUrl(info, bestFormat),
          extra: {
            header: {
              'User-Agent': 'com.google.android.youtube/19.29.37 (Linux; U; Android 11) gzip',
              'Referer': 'https://www.youtube.com/',
            },
          },
        },
      });
    }

    ctx.res = {
      name: info.basic_info.title,
      files,
    };
  } catch (err) {
    gopeed.logger.error('Failed to resolve YouTube video:', err);
    throw new MessageError(`Failed to resolve video: ${err.message || err}`);
  }
});

function arrayBufferToBase64(buffer) {
  let binary = '';
  // eslint-disable-next-line no-undef
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  // eslint-disable-next-line no-undef
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function mimeTypeToExt(mimeType, fallback) {
  if (!mimeType) {
    return '.' + fallback;
  }
  return '.' + mimeType.split(';')[0].split('/')[1];
}
