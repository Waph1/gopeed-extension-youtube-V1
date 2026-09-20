export const DOWNLOAD_MODES = ['muxed', 'separate', 'video', 'audio'];
export const VIDEO_QUALITIES = [
  'highest',
  '4320p',
  '2160p',
  '1440p',
  '1080p',
  '720p',
  '480p',
  '360p',
  '240p',
  '144p',
  'lowest',
];
export const AUDIO_QUALITIES = ['highest', '256', '192', '128', '96', '64', 'lowest'];

function option(value, allowed, fallback) {
  return allowed.includes(String(value)) ? String(value) : fallback;
}
function bool(value, fallback = false) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

// A URL fragment belongs to the extension: it is never sent to YouTube.
export function readSettings(rawUrl = '', values = gopeed.settings || {}) {
  const count = Number(values.playlistLimit);
  const settings = {
    downloadMode: option(values.downloadMode, DOWNLOAD_MODES, 'muxed'),
    videoQuality: option(values.videoQuality, VIDEO_QUALITIES, 'highest'),
    audioQuality: option(values.audioQuality === 'medium' ? '128' : values.audioQuality, AUDIO_QUALITIES, 'highest'),
    audioContainer: option(values.audioContainer, ['m4a', 'webm'], 'm4a'),
    askQuality: bool(values.askQuality),
    playlistFromVideoUrl: bool(values.playlistFromVideoUrl),
    playlistLimit: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
  };
  const hash = new URL(rawUrl || 'https://www.youtube.com').hash;
  if (hash.startsWith('#gopeed:')) {
    const params = new URLSearchParams(hash.slice(8));
    const fields = {
      mode: ['downloadMode', DOWNLOAD_MODES],
      video: ['videoQuality', VIDEO_QUALITIES],
      audio: ['audioQuality', AUDIO_QUALITIES],
      container: ['audioContainer', ['m4a', 'webm']],
    };
    for (const [key, value] of params) {
      if (!fields[key] || !fields[key][1].includes(value))
        throw new Error(`Invalid Gopeed download option: ${key}=${value}`);
      settings[fields[key][0]] = value;
    }
    settings.askQuality = false;
  }
  return settings;
}
