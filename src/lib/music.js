import { createLocalApiInnertube, extractVideoId } from './sabr/common.js';

const text = (value) => (value == null ? '' : String(value).trim().slice(0, 4096));
const year = (value) => (/^[12]\d{3}$/.test(text(value)) ? text(value) : '');
const artists = (values) =>
  (values || [])
    .map((artist) => text(artist.name))
    .filter(Boolean)
    .join('; ');
const itemId = (item) => item?.video_id || item?.id;

// Only the exact video is eligible. Never tag a video with a neighbour in the
// Music radio queue or a different song detected in its background.
export function extractMusicMetadata(id, info, queue = [], album = null) {
  const basic = info?.basic_info || {};
  const result = {
    title: text(basic.title) || id,
    source: `https://www.youtube.com/watch?v=${id}`,
    thumbnails: basic.thumbnail || [],
  };
  const credits = info?.music_tracks || [];
  const credit = credits.length === 1 && credits[0].videoId === id ? credits[0] : null;
  if (credit) {
    result.title = text(credit.song) || result.title;
    result.artist = text(credit.artist);
    result.album = text(credit.album);
  }
  const current = queue.find((item) => itemId(item) === id);
  if (current) {
    result.title = text(current.title) || result.title;
    // Author/channel name is deliberately not used as a recording artist.
    result.artist = artists(current.artists) || result.artist;
    result.album = text(current.album?.name) || result.album;
    result.date = year(current.album?.year);
    result.albumId = text(current.album?.id);
    if (current.thumbnail?.length) result.thumbnails = current.thumbnail;
  }
  const albumTrack = album?.contents?.find((item) => itemId(item) === id);
  if (albumTrack) {
    result.title = text(albumTrack.title) || result.title;
    result.artist = artists(albumTrack.artists) || result.artist;
    result.album = text(album.header?.title) || result.album;
    const albumYear = album.header?.year || album.header?.subtitle?.runs?.find((run) => year(run.text))?.text;
    result.date = year(albumYear) || result.date;
    // An album track number must come from the album, never playlist order.
    const number = Number(text(albumTrack.index));
    if (Number.isInteger(number) && number > 0 && number <= 65535) result.trackNumber = number;
    result.albumArtist =
      text(album.header?.author?.name) ||
      artists(
        (album.header?.strapline_text_one?.runs || [])
          .filter((run) => run.endpoint?.payload?.browseId?.startsWith('UC'))
          .map((run) => ({ name: run.text }))
      );
    const thumbnails = album.header?.thumbnails || album.header?.thumbnail?.contents;
    if (thumbnails?.length) result.thumbnails = thumbnails;
  }
  return result;
}

function warn(message) {
  gopeed.logger?.warn?.(`Music metadata: ${message}`);
}

export function trustedArtworkUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      ['ytimg.com', 'googleusercontent.com', 'ggpht.com'].some(
        (host) => url.hostname === host || url.hostname.endsWith('.' + host)
      )
    );
  } catch (_) {
    return false;
  }
}

export async function fetchArtwork(thumbnails, signal, fetchFunc = fetch) {
  const candidates = [...thumbnails]
    .filter((image) => trustedArtworkUrl(image.url))
    .sort((a, b) => Math.min(b.width || 0, 1200) - Math.min(a.width || 0, 1200));
  for (const image of candidates.slice(0, 3)) {
    let reader;
    try {
      if (signal?.aborted) throw new Error('Artwork download cancelled');
      const response = await fetchFunc(image.url, { signal, redirect: 'error' });
      if (!response.ok) {
        await response.body?.cancel();
        continue;
      }
      const limit = 2 * 1024 * 1024;
      if (Number(response.headers.get('content-length')) > limit) {
        await response.body?.cancel();
        continue;
      }
      reader = response.body?.getReader();
      if (!reader) continue;
      let size = 0;
      const parts = [];
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > limit) throw new Error('Artwork exceeds 2 MiB');
        parts.push(chunk.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) {
        bytes.set(part, offset);
        offset += part.length;
      }
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value);
      if (jpeg || png) return { bytes, kind: jpeg ? 13 : 14 };
    } catch (error) {
      if (signal?.aborted) throw error;
    } finally {
      if (reader) {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
  }
  return null;
}

export async function resolveMusicMetadata(input, info, signal) {
  const id = extractVideoId(input);
  let metadata = extractMusicMetadata(id, info);
  const lifetime = new AbortController();
  const abort = () => lifetime.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 20000);
  try {
    if (signal?.aborted) throw new Error('Music metadata cancelled');
    // A single deadline covers session creation, Music info and album lookup.
    const yt = await createLocalApiInnertube({
      withPlayer: false,
      fetchFunc: (url, options) => fetch(url, { ...options, signal: lifetime.signal }),
    });
    const music = await yt.music.getInfo(id);
    const queue = (await music.getUpNext(false))?.contents || [];
    metadata = extractMusicMetadata(id, info, queue);
    if (metadata.albumId?.startsWith('MPR')) {
      try {
        const album = await yt.music.getAlbum(metadata.albumId);
        metadata = extractMusicMetadata(id, info, queue, album);
      } catch (_) {
        warn('Album details unavailable; keeping the verified track fields.');
      }
    }
  } catch (_) {
    warn('Music catalogue unavailable; keeping the title and verified source fields.');
  } finally {
    clearTimeout(timer);
    lifetime.abort();
    signal?.removeEventListener('abort', abort);
  }
  if (signal?.aborted) throw new Error('Music metadata cancelled');
  const artworkLifetime = new AbortController();
  const abortArtwork = () => artworkLifetime.abort();
  signal?.addEventListener('abort', abortArtwork, { once: true });
  const artworkTimer = setTimeout(abortArtwork, 8000);
  try {
    metadata.cover = await fetchArtwork(metadata.thumbnails, artworkLifetime.signal);
  } catch (_) {
    /* Text tags remain useful if artwork times out. */
  } finally {
    clearTimeout(artworkTimer);
    artworkLifetime.abort();
    signal?.removeEventListener('abort', abortArtwork);
  }
  if (signal?.aborted) throw new Error('Music metadata cancelled');
  if (!metadata.artist || !metadata.album) warn('Artist or album is missing; unavailable fields will be left empty.');
  if (!metadata.cover) warn('No supported artwork available; writing text tags without a cover.');
  delete metadata.thumbnails;
  delete metadata.albumId;
  return metadata;
}
