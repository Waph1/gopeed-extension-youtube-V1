import { createLocalApiInnertube, extractVideoId } from './sabr/common.js';

const text = (value) => (value == null ? '' : String(value).trim().slice(0, 4096));
const year = (value) => (/^[12]\d{3}$/.test(text(value)) ? text(value) : '');
const artists = (values) =>
  (values || [])
    .map((artist) => text(artist.name))
    .filter(Boolean)
    .join('; ');
const itemId = (item) => item?.video_id || item?.id;
const normalize = (value) => text(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
// Featured-artist aliases may differ between the video and the album. This
// normalization only narrows searches; final acceptance still requires the ID.
const searchTitle = (value) =>
  normalize(value)
    .replace(/\s*\((?:feat\.?|ft\.?)\s+[^)]*\)/g, '')
    .trim();
const albumCache = new Map();
const artworkCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

function cached(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}
function remember(cache, key, value, limit) {
  cache.delete(key);
  cache.set(key, { value, expires: Date.now() + CACHE_TTL });
  while (cache.size > limit) cache.delete(cache.keys().next().value);
  return value;
}
function queueItems(queue) {
  return queue.flatMap((item) => (item.primary ? [item.primary, ...(item.counterpart || [])] : [item]));
}
function containsTrack(album, id) {
  return album?.contents?.some((item) => itemId(item) === id);
}
function albumThumbnails(album) {
  return album?.header?.thumbnails || album?.header?.thumbnail?.contents || [];
}
function albumArtist(header) {
  return (
    text(header?.author?.name) ||
    artists(
      (header?.strapline_text_one?.runs || [])
        .filter((run) => run.endpoint?.payload?.browseId?.startsWith('UC'))
        .map((run) => ({ name: run.text }))
    )
  );
}
function checkMetadataCancelled(signal) {
  if (signal?.aborted) throw new Error('Music metadata cancelled');
}
// Store only the album fields we use, never the large parsed response/menu tree.
async function loadAlbum(yt, id, signal) {
  checkMetadataCancelled(signal);
  const hit = cached(albumCache, id);
  if (hit) return hit;
  const album = await yt.music.getAlbum(id);
  checkMetadataCancelled(signal);
  if (!album.header || !album.contents?.length || album.contents.length > 2000) return null;
  const compact = {
    header: {
      title: text(album.header.title),
      year: year(album.header.year) || year(album.header.subtitle?.runs?.find((run) => year(run.text))?.text),
      author: { name: albumArtist(album.header) },
      thumbnails: albumThumbnails(album).slice(0, 8),
    },
    contents: album.contents.map((item) => ({
      id: itemId(item),
      title: text(item.title),
      index: text(item.index),
      artists: (item.artists || []).map((artist) => ({ name: text(artist.name) })),
    })),
  };
  return remember(albumCache, id, compact, 16);
}

// Search only discovers candidate albums. A title/artist match alone never
// authorizes tags: the album must list the original requested video ID.
export async function findMusicAlbum(yt, id, metadata, signal) {
  if (metadata.albumId?.startsWith('MPR')) {
    try {
      const direct = await loadAlbum(yt, metadata.albumId, signal);
      if (containsTrack(direct, id)) return direct;
    } catch (_) {
      checkMetadataCancelled(signal);
      warn('Linked album unavailable; trying catalogue search.');
    }
  }
  const known = [...albumCache.keys()]
    .map((key) => cached(albumCache, key))
    .filter((album) => containsTrack(album, id));
  if (known.length === 1) return known[0];
  if (!metadata.artist || !metadata.title) return null;
  checkMetadataCancelled(signal);
  const search = await yt.music.search(`${metadata.artist} ${metadata.title}`, { type: 'song' });
  checkMetadataCancelled(signal);
  const items = (search.contents || []).flatMap((shelf) => shelf.contents || []);
  const ids = [
    ...new Set(
      items
        .filter(
          (item) =>
            item.album?.id?.startsWith('MPR') &&
            normalize(artists(item.artists)) === normalize(metadata.artist) &&
            searchTitle(item.title) === searchTitle(metadata.title)
        )
        .map((item) => item.album.id)
    ),
  ].slice(0, 3);
  const matches = [];
  for (const albumId of ids) {
    try {
      const album = await loadAlbum(yt, albumId, signal);
      if (containsTrack(album, id)) matches.push(album);
    } catch (_) {
      checkMetadataCancelled(signal);
      warn('Candidate album unavailable; trying the remaining candidates.');
    }
  }
  const preferred = metadata.album
    ? matches.filter((album) => normalize(album.header.title) === normalize(metadata.album))
    : [];
  if (preferred.length === 1) return preferred[0];
  // Ambiguous editions are left empty rather than assigned by search ranking.
  return matches.length === 1 ? matches[0] : null;
}

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
  const current = queueItems(queue).find((item) => itemId(item) === id);
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
    result.albumArtist = albumArtist(album.header);
    const thumbnails = albumThumbnails(album);
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
  if (signal?.aborted) throw new Error('Artwork download cancelled');
  // Reuse a successful smaller cover too, without retrying a stalled larger
  // variant for every track of the same album. Entries expire after ten minutes.
  const previous = candidates.map((image) => cached(artworkCache, image.url)).find(Boolean);
  if (previous) return previous;
  for (const image of candidates.slice(0, 3)) {
    let reader;
    const requestLifetime = new AbortController();
    const abortRequest = () => requestLifetime.abort();
    signal?.addEventListener('abort', abortRequest, { once: true });
    // A stalled large cover must leave time to try a smaller album image.
    const requestTimer = setTimeout(abortRequest, 10000);
    try {
      if (signal?.aborted) throw new Error('Artwork download cancelled');
      const hit = cached(artworkCache, image.url);
      if (hit) return hit;
      const response = await fetchFunc(image.url, { signal: requestLifetime.signal, redirect: 'error' });
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
      if (requestLifetime.signal.aborted) throw new Error('Artwork request cancelled');
      if (jpeg || png) return remember(artworkCache, image.url, { bytes, kind: jpeg ? 13 : 14 }, 4);
    } catch (error) {
      if (signal?.aborted) throw error;
    } finally {
      clearTimeout(requestTimer);
      requestLifetime.abort();
      signal?.removeEventListener('abort', abortRequest);
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
    // A single deadline covers the queue, bounded search and album lookup.
    const yt = await createLocalApiInnertube({
      withPlayer: false,
      fetchFunc: (url, options) => fetch(url, { ...options, signal: lifetime.signal }),
    });
    let queue = [];
    try {
      // Metadata needs only /next, not a second player request/playability check.
      queue = (await yt.music.getUpNext(id, false))?.contents || [];
      metadata = extractMusicMetadata(id, info, queue);
    } catch (_) {
      checkMetadataCancelled(lifetime.signal);
      warn('Music queue unavailable; trying the verified recording credits.');
    }
    const album = await findMusicAlbum(yt, id, metadata, lifetime.signal);
    if (album) metadata = extractMusicMetadata(id, info, queue, album);
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
  const artworkTimer = setTimeout(abortArtwork, 20000);
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
