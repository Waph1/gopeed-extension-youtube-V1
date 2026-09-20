import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/lib/playlist.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/^export /gm, '');
function setup(api = {}) {
  const scope = { URL, MessageError: Error, createLocalApiInnertube: async () => api };
  vm.runInNewContext(source, scope);
  return scope;
}
const albumId = 'OLAK5uy_m7WK0j-v1eLCguUDonKUjJs7Rjza-6lKg';

test('OLAK album links work on YouTube and Music; video+list obeys the setting', () => {
  const api = setup();
  for (const host of ['youtube.com', 'www.youtube.com', 'music.youtube.com', 'm.youtube.com']) {
    assert.equal(api.extractPlaylistId(`https://${host}/playlist?list=${albumId}`), albumId);
  }
  const watch = `https://www.youtube.com/watch?v=aqz-KE-bpKQ&list=${albumId}`;
  assert.equal(api.extractPlaylistId(watch), null);
  assert.equal(api.extractPlaylistId(watch, true), albumId);
  assert.equal(api.extractPlaylistId('https://evil.test/playlist?list=PLx'), null);
  assert.throws(() => api.extractPlaylistId('https://youtube.com/playlist?list=RDxyz'), /Mixes/);
});

test('album fallback reads Music entries, preserves duplicates and original numbering', async () => {
  let called = 0;
  const api = setup({
    getPlaylist: async () => {
      throw Error('not available on WEB');
    },
    music: {
      getPlaylist: async (id) => {
        called++;
        assert.equal(id, albumId);
        return {
          header: { title: 'Album' },
          items: [
            { id: 'aaaaaaaaaaa', title: 'Song', type: 'MusicResponsiveListItem' },
            { id: 'bbbbbbbbbbb', is_playable: false },
            { id: 'aaaaaaaaaaa', title: 'Song reprise' },
            { type: 'ContinuationItem' },
          ],
          has_continuation: true,
          getContinuation: async () => ({ items: [{ id: 'ccccccccccc', title: 'Finale' }], has_continuation: false }),
        };
      },
    },
  });
  const result = await api.resolvePlaylist(albumId);
  assert.equal(called, 1);
  assert.equal(result.title, 'Album');
  assert.deepEqual(
    Array.from(result.videos, (v) => v.index),
    [1, 3, 4]
  );
  assert.equal(result.videos[0].id, result.videos[1].id);
});

test('playlist limit avoids unnecessary continuations; failures are never silently truncated', async () => {
  let continued = 0;
  const api = setup({
    getPlaylist: async () => ({
      info: { title: 'List' },
      items: [{ id: 'aaaaaaaaaaa', title: 'Song' }],
      has_continuation: true,
      getContinuation: async () => {
        continued++;
        throw Error('network failure');
      },
    }),
  });
  assert.equal((await api.resolvePlaylist('PLx', 1)).videos.length, 1);
  assert.equal(continued, 0);
  await assert.rejects(api.resolvePlaylist('PLx'), /page 2.*network failure/);
  assert.equal(continued, 1);
});
