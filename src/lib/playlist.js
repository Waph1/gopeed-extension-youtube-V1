import { createLocalApiInnertube } from './sabr/common.js';

export function extractPlaylistId(input, followVideoPlaylist = false) {
  let url;
  try {
    url = new URL(input);
  } catch (_) {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(host)) return null;
  if (url.pathname.replace(/\/$/, '') !== '/playlist' && !followVideoPlaylist) return null;
  const id = url.searchParams.get('list');
  if (!id && url.pathname.replace(/\/$/, '') !== '/playlist') return null;
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) throw new MessageError('Invalid YouTube playlist URL.');
  if (/^RD/.test(id) || id === 'WL' || id === 'LL')
    throw new MessageError(
      'Mixes, radio, Watch Later and Liked Videos are not supported. Use a public playlist or album URL.'
    );
  return id;
}

export async function resolvePlaylist(id, limit = 0) {
  const yt = await createLocalApiInnertube({ withPlayer: false });
  let page;
  try {
    page = await yt.getPlaylist(id);
    if (!page.items?.length) throw new Error('Empty playlist');
  } catch (error) {
    // OLAK5uy album playlists may be exposed only by the Music browse client.
    if (!id.startsWith('OLAK5uy')) throw error;
    page = await yt.music.getPlaylist(id);
  }
  const title = String(page.info?.title || page.header?.title || id);
  const videos = [];
  let position = 0;
  for (let pageNumber = 1; pageNumber <= 1000; pageNumber++) {
    for (const item of page.items || []) {
      // Continuation nodes are not playlist positions.
      if (/Continuation/.test(item.type || '')) continue;
      position++;
      const videoId =
        item.id ||
        item.content_id ||
        item.video_id ||
        item.on_tap_endpoint?.payload?.videoId ||
        item.endpoint?.payload?.videoId;
      if (item.is_playable === false || !/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) continue;
      if (item.content_type && !['VIDEO', 'SHORT'].includes(item.content_type)) continue;
      videos.push({
        id: videoId,
        title: String(item.title || item.metadata?.title || item.overlay_metadata?.primary_text || videoId),
        index: position,
      });
      if (limit > 0 && videos.length >= limit) return { title, videos };
    }
    if (!page.has_continuation) break;
    if (pageNumber === 1000)
      throw new MessageError('Playlist exceeds the safety limit of 1000 pages. Set Playlist Limit.');
    // A failed continuation must not silently turn an entire playlist into a partial download.
    try {
      page = await page.getContinuation();
    } catch (error) {
      throw new MessageError(
        `Unable to load playlist page ${pageNumber + 1}: ${error.message}. Retry or set Playlist Limit.`
      );
    }
  }
  if (!videos.length) throw new MessageError('This YouTube playlist has no available videos.');
  return { title, videos };
}
