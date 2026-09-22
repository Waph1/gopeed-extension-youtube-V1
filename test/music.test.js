import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/lib/music.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/^export /gm, '');
function setup(api = {}, fetchFunc = fetch, extras = {}) {
  const warnings = [];
  const scope = {
    URL,
    Uint8Array,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: fetchFunc,
    gopeed: { logger: { warn: (message) => warnings.push(message) } },
    extractVideoId: (input) => input,
    createLocalApiInnertube: async () => api,
    ...extras,
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
      getUpNext: async () => {
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
  assert.equal(await setup().fetchArtwork(thumbs, null, async () => new Response('not an image')), null);
  assert.equal(
    await setup().fetchArtwork(thumbs, null, async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1))),
    null
  );
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

const realAlbum = JSON.parse(readFileSync(new URL('fixtures/deafheaven-album.json', import.meta.url)));
const coverBytes = new Uint8Array([255, 216, 255, 0]);
const searchItem = (albumId, title = 'Incidental I') => ({
  title,
  artists: [{ name: 'Deafheaven' }],
  album: { id: albumId },
});

test('live album response shape supplies album, square cover, year and numbering for all 12 original IDs', async () => {
  let searches = 0,
    albums = 0,
    images = 0;
  const api = setup(
    {
      music: {
        getUpNext: async (videoId, automix) => {
          assert.equal(automix, false);
          const track = realAlbum.contents.find((item) => item.id === videoId);
          return {
            contents: [
              {
                video_id: videoId,
                title: track.title,
                artists: [{ name: 'Deafheaven' }],
                thumbnail: [{ url: 'https://i.ytimg.com/video.jpg', width: 853, height: 479 }],
              },
            ],
          };
        },
        search: async () => {
          searches++;
          // Search returns an ATV ID different from the requested official video.
          return { contents: [{ contents: [{ ...searchItem(realAlbum.albumId), id: '-YEYD4bW1yA' }] }] };
        },
        getAlbum: async (albumId) => {
          albums++;
          assert.equal(albumId, realAlbum.albumId);
          return realAlbum;
        },
      },
    },
    async (url) => {
      images++;
      assert.equal(url, realAlbum.header.thumbnail.contents[0].url);
      return new Response(coverBytes);
    }
  );
  for (const track of realAlbum.contents) {
    const metadata = await api.resolveMusicMetadata(track.id, info);
    assert.equal(metadata.album, 'Lonely People With Power');
    assert.equal(metadata.artist, 'Deafheaven');
    assert.equal(metadata.albumArtist, 'Deafheaven');
    assert.equal(metadata.date, '2025');
    assert.equal(metadata.title, track.title);
    assert.equal(metadata.trackNumber, Number(track.index));
    assert.equal(metadata.cover.kind, 13);
    assert.equal(metadata.source, `https://www.youtube.com/watch?v=${track.id}`);
  }
  assert.equal(searches, 1);
  assert.equal(albums, 1);
  assert.equal(images, 1);
});

test('search discovery tolerates featured aliases but requires original video in the album', async () => {
  const api = setup();
  const album = await api.findMusicAlbum(
    {
      music: {
        search: async () => ({
          contents: [{ contents: [searchItem(realAlbum.albumId, 'Incidental III (feat. Paul Banks)')] }],
        }),
        getAlbum: async () => realAlbum,
      },
    },
    'uNC9O-zREEU',
    { artist: 'Deafheaven', title: 'Incidental III (feat. Julian Plenti)' }
  );
  assert.equal(album.header.title, 'Lonely People With Power');
});

test('matching title and artist cannot tag a cover, remix or neighbour with another video ID', async () => {
  const api = setup();
  const result = await api.findMusicAlbum(
    {
      music: {
        search: async () => ({ contents: [{ contents: [searchItem(realAlbum.albumId)] }] }),
        getAlbum: async () => realAlbum,
      },
    },
    id,
    { artist: 'Deafheaven', title: 'Incidental I' }
  );
  assert.equal(result, null);
});

test('multiple editions containing the same video remain ambiguous unless a verified album name selects one', async () => {
  const api = setup();
  const yt = {
    music: {
      search: async () => ({ contents: [{ contents: [searchItem('MPRone'), searchItem('MPRtwo')] }] }),
      getAlbum: async (albumId) => ({ header: { title: albumId }, contents: [{ id, title: 'Incidental I' }] }),
    },
  };
  const metadata = { artist: 'Deafheaven', title: 'Incidental I' };
  assert.equal(await api.findMusicAlbum(yt, id, metadata), null);
  assert.equal((await api.findMusicAlbum(yt, id, { ...metadata, album: 'MPRtwo' })).header.title, 'MPRtwo');
});

test('queue wrappers preserve the requested counterpart identity', () => {
  const result = setup().extractMusicMetadata(id, info, [
    {
      primary: { video_id: 'bbbbbbbbbbb', title: 'Wrong', album: { name: 'Wrong' } },
      counterpart: [
        { video_id: id, title: 'Right', artists: [{ name: 'Artist' }], album: { id: 'MPRone', name: 'Album' } },
      ],
    },
  ]);
  assert.equal(result.title, 'Right');
  assert.equal(result.album, 'Album');
});

test('a failed linked album is recoverable by search and successful album caches expire', async () => {
  let now = 0,
    requests = 0;
  const api = setup({}, fetch, { Date: { now: () => now } });
  const yt = {
    music: {
      search: async () => ({ contents: [{ contents: [searchItem('MPRfound')] }] }),
      getAlbum: async (albumId) => {
        if (albumId === 'MPRbroken') throw Error('Unavailable');
        requests++;
        return realAlbum;
      },
    },
  };
  const metadata = { artist: 'Deafheaven', title: 'Incidental I', albumId: 'MPRbroken' };
  assert.ok(await api.findMusicAlbum(yt, realAlbum.contents[0].id, metadata));
  assert.ok(await api.findMusicAlbum(yt, realAlbum.contents[0].id, metadata));
  assert.equal(requests, 1);
  now = 600001;
  assert.ok(await api.findMusicAlbum(yt, realAlbum.contents[0].id, metadata));
  assert.equal(requests, 2);
});

test('cancellation during album lookup never fills the cache or becomes a successful match', async () => {
  const api = setup();
  const abort = new AbortController();
  let requests = 0;
  const yt = {
    music: {
      getAlbum: async () => {
        requests++;
        abort.abort();
        return realAlbum;
      },
    },
  };
  const metadata = { albumId: realAlbum.albumId };
  await assert.rejects(api.findMusicAlbum(yt, realAlbum.contents[0].id, metadata, abort.signal), /cancelled/);
  assert.ok(await api.findMusicAlbum(yt, realAlbum.contents[0].id, metadata));
  assert.equal(requests, 2);
});

test('artwork cache expires, retries failures and limits retained images', async () => {
  let now = 0,
    requests = 0;
  const api = setup({}, fetch, { Date: { now: () => now } });
  const image = (n) => [{ url: `https://i.ytimg.com/${n}.jpg` }];
  const fetchImage = async () => {
    requests++;
    return new Response(coverBytes);
  };
  assert.equal(await api.fetchArtwork(image(0), null, async () => new Response('fail', { status: 503 })), null);
  await api.fetchArtwork(image(0), null, fetchImage);
  await api.fetchArtwork(image(0), null, fetchImage);
  assert.equal(requests, 1);
  for (let n = 1; n <= 4; n++) await api.fetchArtwork(image(n), null, fetchImage);
  await api.fetchArtwork(image(0), null, fetchImage);
  assert.equal(requests, 6);
  now = 600001;
  await api.fetchArtwork(image(0), null, fetchImage);
  assert.equal(requests, 7);
});

test('a stalled large cover leaves time to fetch a smaller image from the same album', async () => {
  const api = setup({}, fetch, { setTimeout: (callback) => setTimeout(callback, 10) });
  const thumbs = [
    { url: 'https://yt3.googleusercontent.com/large', width: 544 },
    { url: 'https://yt3.googleusercontent.com/small', width: 226 },
  ];
  const requested = [];
  const cover = await api.fetchArtwork(thumbs, null, async (url, { signal }) => {
    requested.push(url);
    if (url === thumbs[0].url)
      return new Promise((resolve, reject) =>
        signal.addEventListener('abort', () => reject(Error('Timeout')), { once: true })
      );
    return new Response(coverBytes);
  });
  assert.equal(cover.kind, 13);
  assert.deepEqual(
    requested,
    thumbs.map((t) => t.url)
  );
});
