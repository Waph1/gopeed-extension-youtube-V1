import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/lib/music.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/^export /gm, '');
function setup(api = {}, fetchFunc = fetch) {
  const warnings = [];
  const scope = {
    URL,
    Uint8Array,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: fetchFunc,
    gopeed: { logger: { warn: (message) => warnings.push(message) } },
    extractVideoId: () => 'aaaaaaaaaaa',
    createLocalApiInnertube: async () => api,
  };
  vm.runInNewContext(source, scope);
  return { ...scope, warnings };
}
const id = 'aaaaaaaaaaa';
const info = { basic_info: { title: 'Original title', author: 'Uploader, not artist', thumbnail: [] } };

test('music tags come only from the requested recording, not other songs in the queue or video', () => {
  const api = setup();
  const result = api.extractMusicMetadata(
    id,
    { ...info, music_tracks: [{ videoId: 'bbbbbbbbbbb', song: 'Background music', artist: 'Wrong artist' }] },
    [{ video_id: 'bbbbbbbbbbb', title: 'Neighbour', artists: [{ name: 'Wrong artist' }] }]
  );
  assert.equal(result.title, 'Original title');
  assert.equal(result.artist, undefined);
  assert.equal(result.album, undefined);
  assert.equal(result.date, undefined);
  assert.equal(result.source, `https://www.youtube.com/watch?v=${id}`);
});

test('exact music item and album provide Unicode tags and album track number', () => {
  const result = setup().extractMusicMetadata(
    id,
    info,
    [
      {
        video_id: id,
        title: 'Città 🎵',
        artists: [{ name: 'Éva' }, { name: '李' }],
        album: { id: 'MPRalbum', name: 'Album', year: '2024' },
      },
    ],
    {
      header: { title: 'Album', year: '2023', author: { name: 'Various Artists' } },
      contents: [{ id, title: 'Città 🎵', index: '7' }],
    }
  );
  assert.equal(result.title, 'Città 🎵');
  assert.equal(result.artist, 'Éva; 李');
  assert.equal(result.album, 'Album');
  assert.equal(result.albumArtist, 'Various Artists');
  assert.equal(result.date, '2023');
  assert.equal(result.trackNumber, 7);
});

test('playlist position, upload year and unmatched album never become recording tags', () => {
  const result = setup().extractMusicMetadata(
    id,
    { ...info, basic_info: { ...info.basic_info, upload_date: '2026-09-20' } },
    [{ video_id: id, index: '42', author: 'Uploader', album: { name: 'Actual album', year: '42 songs' } }],
    { header: { title: 'Wrong album', year: '1980' }, contents: [{ id: 'bbbbbbbbbbb', index: '1' }] }
  );
  assert.equal(result.album, 'Actual album');
  assert.equal(result.date, '');
  assert.equal(result.artist, undefined);
  assert.equal(result.trackNumber, undefined);
});

test('catalogue failure still writes title/source; cancellation does not become a successful fallback', async () => {
  const api = setup({
    music: {
      getInfo: async () => {
        throw Error('Unavailable');
      },
    },
  });
  const metadata = await api.resolveMusicMetadata(id, info);
  assert.equal(metadata.title, 'Original title');
  assert.match(metadata.source, /aaaaaaaaaaa$/);
  assert.equal(metadata.artist, undefined);
  assert.ok(api.warnings.length > 0);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(api.resolveMusicMetadata(id, info, abort.signal), /cancelled/);
});

test('artwork accepts bounded JPEG/PNG bytes and rejects unsupported or oversized data', async () => {
  const { fetchArtwork, trustedArtworkUrl } = setup();
  assert.equal(trustedArtworkUrl('https://i.ytimg.com/image.jpg'), true);
  assert.equal(trustedArtworkUrl('https://ytimg.com.evil.test/image.jpg'), false);
  assert.equal(trustedArtworkUrl('https://user:pass@i.ytimg.com/image.jpg'), false);
  assert.equal(trustedArtworkUrl('http://i.ytimg.com/image.jpg'), false);
  const thumbs = [{ url: 'https://i.ytimg.com/image.jpg' }];
  const cover = await fetchArtwork(thumbs, null, async () => new Response(new Uint8Array([255, 216, 255, 0])));
  assert.equal(cover.kind, 13);
  assert.equal(cover.bytes.length, 4);
  assert.equal(await fetchArtwork(thumbs, null, async () => new Response('not an image')), null);
  assert.equal(await fetchArtwork(thumbs, null, async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1))), null);
});

test('failed artwork responses release the body before trying another image', async () => {
  const { fetchArtwork } = setup();
  let cancelled = false,
    requests = 0;
  const cover = await fetchArtwork(
    [{ url: 'https://i.ytimg.com/missing.jpg' }, { url: 'https://i.ytimg.com/cover.jpg' }],
    null,
    async () => {
      if (++requests === 1) {
        return new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
          { status: 404 }
        );
      }
      assert.equal(cancelled, true);
      return new Response(new Uint8Array([255, 216, 255, 0]));
    }
  );
  assert.equal(cover.kind, 13);
  assert.equal(requests, 2);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    fetchArtwork([{ url: 'https://i.ytimg.com/cover.jpg' }], abort.signal, () => {
      assert.fail('Cancelled artwork must not start another request');
    }),
    /cancelled/
  );
});
