import { Innertube, Platform } from 'youtubei.js';
import { readSettings } from './settings.js';
import {
  audioLabel,
  collectFormats,
  formatKind,
  listAudioChoices,
  listVideoChoices,
  mimeTypeToExt,
  selectAudio,
  selectVideo,
  videoLabel,
} from './formats.js';

const PLAYLIST_CONCURRENCY = 5;
const PLAYLIST_MAX_PAGES = 100;
const MAX_NAME_LENGTH = 120;
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY = 500;

const CLIENT_HEADERS = {
  ANDROID: {
    'User-Agent': 'com.google.android.youtube/19.29.37 (Linux; U; Android 11) gzip',
    Referer: 'https://www.youtube.com/',
  },
  WEB: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://www.youtube.com/',
  },
};

Platform.shim.eval = async (data) => {
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

// https://www.youtube.com/watch?v=aqz-KE-bpKQ
// https://youtu.be/aqz-KE-bpKQ
// https://www.youtube.com/playlist?list=PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb
gopeed.events.onResolve(async (ctx) => {
  const settings = readSettings();
  const target = parseTarget(ctx.req.url, settings);
  if (!target) {
    return;
  }

  try {
    if (target.type === 'playlist') {
      ctx.res = await resolvePlaylist(target.playlistId, settings);
    } else {
      ctx.res = await resolveVideo(target.videoId, settings);
    }
  } catch (err) {
    gopeed.logger.error('Failed to resolve YouTube url:', err);
    throw new MessageError(`Failed to resolve ${target.type}: ${err.message || err}`);
  }
});

/**
 * Detect what a youtube url points to, a single video or a whole playlist.
 */
function parseTarget(rawUrl, settings) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (err) {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const pathParts = url.pathname.split('/').filter((part) => part !== '');
  const playlistId = (url.searchParams.get('list') || '').trim();

  let videoId = url.searchParams.get('v');
  if (!videoId) {
    if (host === 'youtu.be') {
      videoId = pathParts[0];
    } else if (pathParts.length >= 2 && ['shorts', 'embed', 'v', 'live'].indexOf(pathParts[0]) >= 0) {
      videoId = pathParts[pathParts.length - 1];
    }
  }
  videoId = /^[A-Za-z0-9_-]{11}$/.test(String(videoId || '').trim()) ? videoId.trim() : '';

  // A video url can carry a playlist too, only follow it when the url is a playlist url or the user opted in.
  if (playlistId && (pathParts[0] === 'playlist' || !videoId || settings.playlistFromVideoUrl)) {
    return { type: 'playlist', playlistId };
  }
  if (videoId) {
    return { type: 'video', videoId };
  }
  return null;
}

async function resolveVideo(videoId, settings) {
  const { info, client } = await withRetry(() => fetchVideoInfo(videoId));
  assertPlayable(info);

  const title = sanitizeName(textOf(info.basic_info.title) || videoId);
  const formats = planFormats(collectFormats(info), settings);
  if (formats.length === 0) {
    throw new Error('no downloadable stream found');
  }

  return {
    name: title,
    files: await buildFiles(info, client, formats, title, ''),
  };
}

async function resolvePlaylist(playlistId, settings) {
  if (/^(RD|LL|WL)/.test(playlistId)) {
    throw new Error('mixes, liked videos and watch later playlists are not supported');
  }

  const playlist = await fetchPlaylist(playlistId, settings.playlistLimit);
  if (playlist.items.length === 0) {
    throw new Error('playlist is empty or not accessible');
  }
  gopeed.logger.info(`[RESOLVE] resolving ${playlist.items.length} videos of playlist ${playlistId}`);

  const indexWidth = String(playlist.items.length).length;
  const grouped = await mapLimit(playlist.items, PLAYLIST_CONCURRENCY, async (item, index) => {
    try {
      const { info, client } = await withRetry(() => fetchVideoInfo(item.id));
      assertPlayable(info);

      const title = sanitizeName(textOf(info.basic_info.title) || item.title || item.id);
      const formats = planFormats(collectFormats(info), settings);
      if (formats.length === 0) {
        throw new Error('no downloadable stream found');
      }

      // Group the streams of a video in their own folder when it contributes more than one file.
      const prefix = `${padIndex(index + 1, indexWidth)}. `;
      const folder = formats.length > 1 ? prefix + title : '';
      const baseName = formats.length > 1 ? title : prefix + title;
      return await buildFiles(info, client, formats, baseName, folder);
    } catch (err) {
      gopeed.logger.warn(`[RESOLVE] skipping playlist video ${item.id}: ${err.message || err}`);
      return [];
    }
  });

  const files = [];
  for (const group of grouped) {
    for (const file of group) {
      files.push(file);
    }
  }
  if (files.length === 0) {
    throw new Error('no downloadable video found in this playlist');
  }
  return {
    name: sanitizeName(playlist.title || playlistId),
    files,
  };
}

async function fetchVideoInfo(videoId) {
  const youtube = await youtubeReady;

  // Try ANDROID client first — direct URLs, no decipher needed, fast
  try {
    const info = await youtube.getBasicInfo(videoId, { client: 'ANDROID' });
    if (hasDirectUrls(info)) {
      return { info, client: 'ANDROID' };
    }
    gopeed.logger.info('[RESOLVE] ANDROID client returned no direct url, falling back to WEB');
  } catch (err) {
    gopeed.logger.info('[RESOLVE] ANDROID client failed, falling back to WEB:', err.message || err);
  }

  // Fallback: WEB client with player decipher
  return { info: await youtube.getBasicInfo(videoId), client: 'WEB' };
}

async function fetchPlaylist(playlistId, limit) {
  const youtube = await youtubeReady;
  let page = await youtube.getPlaylist(playlistId);
  const title = textOf(page.info && page.info.title);

  const items = [];
  const seen = {};
  for (let pageCount = 0; pageCount < PLAYLIST_MAX_PAGES; pageCount++) {
    for (const item of page.items || []) {
      const id = playlistItemId(item);
      if (!id || seen[id]) {
        continue;
      }
      seen[id] = true;
      if (item.is_playable === false) {
        gopeed.logger.info(`[RESOLVE] skipping unplayable playlist video ${id}`);
        continue;
      }
      items.push({ id, title: playlistItemTitle(item) });
      if (limit > 0 && items.length >= limit) {
        return { title, items };
      }
    }
    if (!page.has_continuation) {
      break;
    }
    const current = page;
    try {
      page = await withRetry(() => current.getContinuation());
    } catch (err) {
      gopeed.logger.warn('[RESOLVE] failed to load the next playlist page:', err.message || err);
      break;
    }
  }
  return { title, items };
}

/**
 * Decide which streams end up in the resolve result, either every available quality so that the user can pick
 * them in the task dialog, or the ones matching the default quality settings.
 */
function planFormats(collected, settings) {
  if (settings.askQuality) {
    return listVideoChoices(collected.muxed)
      .concat(listVideoChoices(collected.video))
      .concat(listAudioChoices(collected.audio));
  }

  const audio = selectAudio(collected.audio, settings.audioQuality);
  if (settings.downloadMode === 'audio' && audio) {
    return [audio];
  }

  const muxed = selectVideo(collected.muxed, settings.videoQuality);
  const video = selectVideo(collected.video, settings.videoQuality);
  if (settings.downloadMode === 'video' && (video || muxed)) {
    return [video || muxed];
  }
  if (settings.downloadMode === 'separate' && video && audio) {
    return [video, audio];
  }
  if (muxed) {
    return [muxed];
  }
  // Not every video has a stream with video and audio muxed together, fall back to the separate streams.
  return [video, audio].filter((format) => !!format);
}

async function buildFiles(info, client, formats, baseName, folder) {
  const files = [];
  for (const format of formats) {
    files.push({
      name: fileName(baseName, format),
      path: folder,
      size: format.content_length || 0,
      req: {
        url: await getStreamUrl(info, format),
        extra: {
          header: CLIENT_HEADERS[client] || CLIENT_HEADERS.WEB,
        },
      },
    });
  }
  return files;
}

function fileName(baseName, format) {
  const kind = formatKind(format);
  if (kind === 'audio') {
    return `${baseName}.${audioLabel(format)}.audio${mimeTypeToExt(format.mime_type, 'webm')}`;
  }
  const suffix = kind === 'video' ? '.video' : '';
  return `${baseName}.${videoLabel(format)}${suffix}${mimeTypeToExt(format.mime_type, 'mp4')}`;
}

async function getStreamUrl(info, format) {
  // ANDROID formats have direct URLs
  if (format.url) {
    return format.url;
  }
  // WEB formats need deciphering
  if (typeof format.decipher === 'function') {
    const url = await format.decipher(info.actions.session.player);
    if (url) {
      return url;
    }
  }
  throw new Error('No stream URL available');
}

function hasDirectUrls(info) {
  const streamingData = info.streaming_data || {};
  const formats = (streamingData.formats || []).concat(streamingData.adaptive_formats || []);
  return formats.some((format) => !!format.url);
}

function assertPlayable(info) {
  const status = info.playability_status;
  if (status && status.status && status.status !== 'OK') {
    throw new Error(textOf(status.reason) || status.status);
  }
  if (info.basic_info && (info.basic_info.is_live || info.basic_info.is_upcoming)) {
    throw new Error('live and upcoming videos are not supported');
  }
}

// Playlist entries come in several shapes: PlaylistVideo, ReelItem, ShortsLockupView and LockupView.
function playlistItemId(item) {
  if (typeof item.id === 'string' && item.id) {
    return item.id;
  }
  if (typeof item.content_id === 'string' && item.content_id) {
    return isVideoLockup(item) ? item.content_id : '';
  }
  const endpoint = item.on_tap_endpoint || item.endpoint;
  const payload = endpoint && endpoint.payload;
  return (payload && payload.videoId) || '';
}

function isVideoLockup(item) {
  return !item.content_type || item.content_type === 'VIDEO' || item.content_type === 'SHORT';
}

function playlistItemTitle(item) {
  const metadata = item.metadata || {};
  const overlay = item.overlay_metadata || {};
  return (
    textOf(item.title) || textOf(metadata.title) || textOf(overlay.primary_text) || textOf(item.accessibility_text)
  );
}

/**
 * Retry an action a couple of times, youtube throttles bursts of requests with transient errors.
 */
async function withRetry(action) {
  let lastError;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * attempt));
    }
    try {
      return await action();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Run an async task over a list, keeping at most `limit` tasks in flight.
 */
async function mapLimit(items, limit, handler) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(
      (async () => {
        for (;;) {
          const index = cursor++;
          if (index >= items.length) {
            return;
          }
          results[index] = await handler(items[index], index);
        }
      })()
    );
  }
  await Promise.all(workers);
  return results;
}

function textOf(value) {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value.text === 'string') {
    return value.text;
  }
  if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
    return value.toString();
  }
  return '';
}

function sanitizeName(name) {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  if (cleaned.length > MAX_NAME_LENGTH) {
    return cleaned.slice(0, MAX_NAME_LENGTH).trim();
  }
  return cleaned || 'youtube';
}

function padIndex(index, width) {
  let text = String(index);
  while (text.length < width) {
    text = '0' + text;
  }
  return text;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
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
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
