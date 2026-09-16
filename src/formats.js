const QUALITY_HEIGHTS = {
  '2160p': 2160,
  '1440p': 1440,
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
  '360p': 360,
  '240p': 240,
  '144p': 144,
};

// Prefer the most widely playable codecs when several formats share the same resolution.
const VIDEO_CODEC_RANKS = [
  ['avc1', 3],
  ['vp9', 2],
  ['vp09', 2],
  ['av01', 1],
];

const MEDIUM_AUDIO_BITRATE = 128000;

function height(format) {
  if (format.height) {
    return format.height;
  }
  const label = parseInt(format.quality_label, 10);
  return isNaN(label) ? 0 : label;
}

function bitrate(format) {
  return format.bitrate || format.average_bitrate || 0;
}

function codecRank(format) {
  const mimeType = String(format.mime_type || '').toLowerCase();
  for (let i = 0; i < VIDEO_CODEC_RANKS.length; i++) {
    if (mimeType.indexOf(VIDEO_CODEC_RANKS[i][0]) >= 0) {
      return VIDEO_CODEC_RANKS[i][1];
    }
  }
  return 0;
}

function container(format) {
  return String(format.mime_type || '').split(';')[0];
}

function byVideoQuality(a, b) {
  return height(b) - height(a) || (b.fps || 0) - (a.fps || 0) || codecRank(b) - codecRank(a) || bitrate(b) - bitrate(a);
}

function byAudioQuality(a, b) {
  return bitrate(b) - bitrate(a);
}

// OTF streams are served in segments and DRM protected streams can't be downloaded with a plain http request.
function isDownloadable(format) {
  if (format.is_type_otf === true) {
    return false;
  }
  if (format.drm_families && format.drm_families.length > 0) {
    return false;
  }
  return !!(format.url || format.signature_cipher || format.cipher);
}

/**
 * Tell what a format carries: `muxed` (video and audio), `video` only or `audio` only.
 */
export function formatKind(format) {
  const mimeType = String(format.mime_type || '');
  if (mimeType.indexOf('audio/') === 0) {
    return 'audio';
  }
  return format.has_audio === true ? 'muxed' : 'video';
}

/**
 * Split the streaming data into muxed (video+audio), video only and audio only formats, best quality first.
 */
export function collectFormats(info) {
  const streamingData = info.streaming_data || {};
  const collected = { muxed: [], video: [], audio: [] };
  const all = (streamingData.formats || []).concat(streamingData.adaptive_formats || []);
  for (const format of all) {
    if (!isDownloadable(format)) {
      continue;
    }
    collected[formatKind(format)].push(format);
  }
  collected.muxed.sort(byVideoQuality);
  collected.video.sort(byVideoQuality);
  collected.audio = preferMainAudio(collected.audio).sort(byAudioQuality);
  return collected;
}

// Drop dubbed/descriptive/drc tracks as long as regular ones are available.
function preferMainAudio(formats) {
  const filters = [
    (format) => format.is_dubbed !== true && format.is_auto_dubbed !== true,
    (format) => format.is_descriptive !== true && format.is_secondary !== true,
    (format) => format.is_drc !== true,
  ];
  let remaining = formats;
  for (const filter of filters) {
    const filtered = remaining.filter(filter);
    if (filtered.length > 0) {
      remaining = filtered;
    }
  }
  const original = remaining.filter((format) => format.is_original === true);
  return original.length > 0 ? original : remaining;
}

/**
 * Pick a video format for the given quality setting, `quality` is `highest`, `lowest` or a label like `1080p`.
 * A label is treated as an upper bound, the closest available quality is used when there is no exact match.
 */
export function selectVideo(formats, quality) {
  if (formats.length === 0) {
    return null;
  }
  if (quality === 'highest') {
    return formats[0];
  }
  if (quality === 'lowest') {
    return formats[formats.length - 1];
  }
  const target = QUALITY_HEIGHTS[quality];
  if (!target) {
    return formats[0];
  }
  for (const format of formats) {
    if (height(format) <= target) {
      return format;
    }
  }
  return formats[formats.length - 1];
}

/**
 * Pick an audio format for the given quality setting: `highest`, `medium` (around 128kbps) or `lowest`.
 */
export function selectAudio(formats, quality) {
  if (formats.length === 0) {
    return null;
  }
  if (quality === 'lowest') {
    return formats[formats.length - 1];
  }
  if (quality === 'medium') {
    let closest = formats[0];
    for (const format of formats) {
      if (Math.abs(bitrate(format) - MEDIUM_AUDIO_BITRATE) < Math.abs(bitrate(closest) - MEDIUM_AUDIO_BITRATE)) {
        closest = format;
      }
    }
    return closest;
  }
  return formats[0];
}

/**
 * One video format per resolution, so the task dialog stays readable.
 */
export function listVideoChoices(formats) {
  const best = {};
  for (const format of formats) {
    const key = height(format);
    if (!key) {
      continue;
    }
    if (!best[key] || byVideoQuality(format, best[key]) < 0) {
      best[key] = format;
    }
  }
  return Object.keys(best)
    .map((key) => best[key])
    .sort(byVideoQuality);
}

/**
 * One audio format per container and bitrate, so the task dialog stays readable.
 */
export function listAudioChoices(formats) {
  const best = {};
  for (const format of formats) {
    const key = container(format) + '@' + Math.round(bitrate(format) / 1000);
    if (!best[key] || byAudioQuality(format, best[key]) < 0) {
      best[key] = format;
    }
  }
  return Object.keys(best)
    .map((key) => best[key])
    .sort(byAudioQuality);
}

export function videoLabel(format) {
  if (format.quality_label) {
    return format.quality_label;
  }
  return height(format) ? height(format) + 'p' : 'video';
}

export function audioLabel(format) {
  return Math.round(bitrate(format) / 1000) + 'kbps';
}

export function mimeTypeToExt(mimeType, fallback) {
  if (!mimeType) {
    return '.' + fallback;
  }
  const type = mimeType.split(';')[0];
  if (type === 'audio/mp4') {
    return '.m4a';
  }
  return '.' + type.split('/')[1];
}
