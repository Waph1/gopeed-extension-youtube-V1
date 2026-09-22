// Native media validation, separate from portable unit tests. Requires FFmpeg.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tagM4aStream } from '../src/lib/m4a-tags.js';

for (const flags of ['faststart', 'frag_keyframe+empty_moov', 'frag_keyframe+empty_moov+default_base_moof', 'dash']) {
  test(`native AAC tags, artwork, audio integrity and seeking (${flags})`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gopeed-music-tags-'));
    try {
      const original = join(dir, 'original.m4a'),
        tagged = join(dir, 'tagged.m4a'),
        image = join(dir, 'cover.png');
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=2',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        '-movflags',
        flags,
        '-frag_duration',
        '500000',
        original,
      ]);
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=16x16',
        '-frames:v',
        '1',
        '-threads',
        '1',
        image,
      ]);
      const metadata = {
        title: 'Città 🎵',
        artist: 'Éva; 李',
        album: 'Test album',
        albumArtist: 'Éva',
        date: '2024',
        trackNumber: 7,
        source: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
        cover: { bytes: new Uint8Array(readFileSync(image)), kind: 14 },
      };
      const output = await new Response(
        tagM4aStream(new Blob([readFileSync(original)]).stream(), metadata)
      ).arrayBuffer();
      writeFileSync(tagged, new Uint8Array(output));
      const probe = JSON.parse(
        execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', tagged])
      );
      for (const key of ['title', 'artist', 'album', 'date']) assert.equal(probe.format.tags[key], metadata[key]);
      assert.equal(probe.format.tags.album_artist, metadata.albumArtist);
      assert.equal(probe.format.tags.track, '7');
      assert.equal(probe.format.tags.comment, metadata.source);
      assert.equal(probe.streams.filter((stream) => stream.codec_type === 'audio').length, 1);
      assert.equal(probe.streams.find((stream) => stream.disposition.attached_pic)?.codec_name, 'png');
      for (const seek of [[], ['-ss', '1']]) {
        const decode = (path) =>
          execFileSync('ffmpeg', [
            '-v',
            'error',
            ...seek,
            '-i',
            path,
            '-map',
            '0:a:0',
            '-f',
            'hash',
            '-hash',
            'sha256',
            '-',
          ]).toString();
        assert.equal(decode(tagged), decode(original), 'decoded audio must be identical, including after seeking');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
