/* global findMusicAlbum, extractMusicMetadata */
/* eslint-disable no-unused-vars -- read by the Goja host */
var albumTestFinished = false;
var albumTestFailure = '';
(async function () {
  const trackId = 'aaaaaaaaaaa';
  let searches = 0;
  let loads = 0;
  const yt = {
    music: {
      search: async () => {
        searches++;
        return {
          contents: [
            {
              contents: [
                {
                  id: 'bbbbbbbbbbb',
                  title: 'Città',
                  artists: [{ name: 'Éva' }],
                  album: { id: 'MPRalbum' },
                },
              ],
            },
          ],
        };
      },
      getAlbum: async () => {
        loads++;
        return {
          header: {
            title: 'Album',
            year: '2025',
            author: { name: 'Éva' },
            thumbnail: { contents: [{ url: 'https://yt3.googleusercontent.com/cover', width: 544, height: 544 }] },
          },
          contents: [{ id: trackId, title: 'Città', index: '3' }],
        };
      },
    },
  };
  const metadata = { artist: 'Éva', title: 'Città' };
  const album = await findMusicAlbum(yt, trackId, metadata);
  if (!album || album.header.title !== 'Album') throw Error('Album not matched');
  const tags = extractMusicMetadata(
    trackId,
    {},
    [{ video_id: trackId, title: 'Città', artists: [{ name: 'Éva' }] }],
    album
  );
  if (tags.trackNumber !== 3 || tags.thumbnails[0].width !== 544 || tags.artist !== 'Éva')
    throw Error('Incorrect album tags');
  await findMusicAlbum(yt, trackId, metadata);
  if (searches !== 1 || loads !== 1) throw Error('Cache not reused');
  if (await findMusicAlbum(yt, 'ccccccccccc', metadata)) throw Error('Unrelated recording matched');
  albumTestFinished = true;
})().catch(function (error) {
  albumTestFailure = String(error.stack || error);
});
