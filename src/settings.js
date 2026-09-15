export const DOWNLOAD_MODES = ['muxed', 'separate', 'video', 'audio'];
export const VIDEO_QUALITIES = ['highest', '2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p', 'lowest'];
export const AUDIO_QUALITIES = ['highest', 'medium', 'lowest'];

function pickOption(value, allowed, fallback) {
  const option = typeof value === 'string' ? value.trim() : '';
  return allowed.indexOf(option) >= 0 ? option : fallback;
}

function toBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return fallback;
}

function toCount(value) {
  const count = Number(value);
  if (!isFinite(count) || count <= 0) {
    return 0;
  }
  return Math.floor(count);
}

/**
 * Read the extension settings, falling back to the manifest defaults when a value is missing or invalid.
 */
export function readSettings() {
  const settings = gopeed.settings || {};
  return {
    downloadMode: pickOption(settings.downloadMode, DOWNLOAD_MODES, 'muxed'),
    videoQuality: pickOption(settings.videoQuality, VIDEO_QUALITIES, 'highest'),
    audioQuality: pickOption(settings.audioQuality, AUDIO_QUALITIES, 'highest'),
    askQuality: toBoolean(settings.askQuality, false),
    playlistFromVideoUrl: toBoolean(settings.playlistFromVideoUrl, false),
    playlistLimit: toCount(settings.playlistLimit),
  };
}
