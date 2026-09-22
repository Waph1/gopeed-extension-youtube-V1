// These helpers use googlevideo's camelCase SABR format descriptors. A format
// does not need a direct URL: WEB commonly supplies only SABR descriptors.
export function resolution(format) {
  const width = Number(format.width),
    height = Number(format.height);
  return width > 0 && height > 0 ? Math.min(width, height) : parseInt(format.qualityLabel, 10) || 0;
}
export function audioBitrate(format) {
  return Number(format.averageBitrate || format.bitrate || 0);
}
export function usable(format) {
  return !format.drmFamilies?.length && !format.isTypeOtf;
}
export function selectAudioFormat(formats, quality = 'highest', container = 'm4a', itag = '') {
  let candidates = formats.filter(
    (f) =>
      usable(f) &&
      f.mimeType?.startsWith('audio/') &&
      f.mimeType.startsWith(container === 'webm' ? 'audio/webm' : 'audio/mp4')
  );
  // Keep the original language where possible, not a dub or descriptive track.
  for (const predicate of [
    (f) => !f.isDubbed && !f.isAutoDubbed,
    (f) => !f.isDescriptive && !f.isSecondary,
    (f) => !f.isDrc,
    (f) => f.isOriginal,
  ]) {
    const filtered = candidates.filter(predicate);
    if (filtered.length) candidates = filtered;
  }
  if (itag) candidates = candidates.filter((f) => String(f.itag) === String(itag));
  if (!candidates.length)
    throw new Error(
      `No ${container} audio stream is available${itag ? ` (format ${itag})` : ''}. Try the other audio container.`
    );
  candidates.sort((a, b) => audioBitrate(b) - audioBitrate(a));
  if (quality === 'lowest') return candidates[candidates.length - 1];
  const target = Number(quality) * 1000;
  if (target > 0) candidates.sort((a, b) => Math.abs(audioBitrate(a) - target) - Math.abs(audioBitrate(b) - target));
  return candidates[0];
}

export function audioChoices(formats) {
  const choices = [];
  for (const container of ['m4a', 'webm']) {
    const candidates = formats.filter(
      (f) => usable(f) && f.mimeType?.startsWith(container === 'm4a' ? 'audio/mp4' : 'audio/webm')
    );
    // Use the same language preference as automatic selection, at each quality.
    const seen = new Set();
    for (const format of candidates) {
      const bitrate = String(Math.round(audioBitrate(format) / 1000));
      const selected = selectAudioFormat(formats, bitrate, container);
      if (seen.has(selected.itag)) continue;
      seen.add(selected.itag);
      choices.push({
        mode: 'audio',
        audioContainer: container,
        audioQuality: bitrate,
        audioItag: String(selected.itag),
      });
    }
  }
  return choices;
}

export function planChoices(settings, formats = null) {
  const base = {
    mode: settings.downloadMode === 'music' ? 'audio' : settings.downloadMode,
    videoQuality: settings.videoQuality,
    audioQuality: settings.audioQuality,
    audioContainer: settings.downloadMode === 'music' ? 'm4a' : settings.audioContainer,
    musicMetadata: settings.downloadMode === 'music',
  };
  if (!settings.askQuality) {
    return base.mode === 'separate'
      ? [
          { ...base, mode: 'video' },
          { ...base, mode: 'audio' },
        ]
      : [base];
  }
  // Playlist options are explicit ceilings, resolved independently per item.
  const qualities = formats
    ? [
        ...new Set(
          formats
            .filter((f) => usable(f) && f.mimeType?.startsWith('video/'))
            .map(resolution)
            .filter(Boolean)
        ),
      ]
        .sort((a, b) => b - a)
        .map((n) => `${n}p`)
    : [...new Set([settings.videoQuality, '1080p', '720p', '480p'])];
  const videos = qualities.map((videoQuality) => ({
    ...base,
    mode: 'muxed',
    musicMetadata: false,
    audioContainer: 'm4a',
    videoQuality,
  }));
  const audio = formats
    ? audioChoices(formats)
    : ['highest', '128', 'lowest'].map((audioQuality) => ({
        ...base,
        mode: 'audio',
        musicMetadata: false,
        audioQuality,
      }));
  // Tagging is offered explicitly: a Music category or URL alone does not
  // identify a single song (concerts, podcasts and compilations exist there).
  const music = formats
    ? audio.filter((choice) => choice.audioContainer === 'm4a')
    : ['highest', '128', 'lowest'].map((audioQuality) => ({
        ...base,
        mode: 'audio',
        audioContainer: 'm4a',
        audioQuality,
      }));
  const choices = videos.concat(
    audio,
    music.map((choice) => ({ ...choice, musicMetadata: true }))
  );
  if (!choices.length) throw new Error('No downloadable audio or video formats were returned by YouTube.');
  return choices;
}
