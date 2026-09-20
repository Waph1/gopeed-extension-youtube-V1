import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { selectAudioFormat, planChoices, resolution } from '../src/formats.js';
import { readSettings } from '../src/settings.js';
const scope = { MessageError: Error, Platform: { shim: {} }, URL };
vm.runInNewContext(
  readFileSync(new URL('../src/lib/sabr/common.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, ''),
  scope
);
const video = (h, codec = 'avc1') => ({ mimeType: `video/mp4; codecs="${codec}"`, width: (h * 16) / 9, height: h });
const audio = (itag, rate, mime = 'audio/mp4', extra = {}) => ({
  itag,
  bitrate: rate * 1000,
  mimeType: mime,
  ...extra,
});

test('video caps fall down before up and support portrait Shorts', () => {
  const formats = [video(2160), video(720), video(360)];
  assert.equal(scope.selectVideoFormat(formats, '1080p', {}, { fallbackToLower: true }).height, 720);
  assert.equal(scope.selectVideoFormat(formats, '144p', {}, { fallbackToLower: true }).height, 360);
  assert.equal(scope.selectVideoFormat(formats, 'highest').height, 2160);
  assert.equal(scope.selectVideoFormat(formats, 'lowest').height, 360);
  const portrait = { mimeType: 'video/mp4', width: 720, height: 1280 };
  assert.equal(resolution(portrait), 720);
  assert.equal(scope.selectVideoFormat([portrait], '720p').width, 720);
});

test('audio selects quality within container, avoids dubs and never falls back to video', () => {
  const formats = [
    audio(139, 48),
    audio(140, 129),
    audio(141, 256),
    audio(251, 160, 'audio/webm'),
    audio(999, 320, 'audio/mp4', { isDubbed: true }),
  ];
  assert.equal(selectAudioFormat(formats, 'highest').itag, 141);
  assert.equal(selectAudioFormat(formats, 'lowest').itag, 139);
  assert.equal(selectAudioFormat(formats, '128').itag, 140);
  assert.equal(selectAudioFormat(formats, 'highest', 'webm').itag, 251);
  assert.equal(selectAudioFormat(formats, 'highest', 'm4a', '140').itag, 140);
  assert.throws(() => selectAudioFormat([video(1080)], 'highest'), /No m4a audio/);
});

test('legacy medium setting migrates and per-download fragment overrides defaults', () => {
  assert.equal(readSettings('', { audioQuality: 'medium' }).audioQuality, '128');
  const s = readSettings('https://youtu.be/aqz-KE-bpKQ#gopeed:mode=audio&audio=128&container=webm', {
    askQuality: true,
  });
  assert.equal(s.downloadMode, 'audio');
  assert.equal(s.audioQuality, '128');
  assert.equal(s.askQuality, false);
  assert.equal(s.audioContainer, 'webm');
  assert.throws(() => readSettings('https://youtu.be/aqz-KE-bpKQ#gopeed:mode=bad', {}), /Invalid Gopeed/);
  assert.equal(readSettings('', { playlistLimit: -10 }).playlistLimit, 0);
});

test('choice planning returns available resolutions and audio formats, or explicit playlist caps', () => {
  const settings = readSettings('', { askQuality: true });
  const choices = planChoices(settings, [video(1080), video(1080, 'av01'), video(360), audio(140, 128)]);
  assert.equal(choices.length, 3);
  assert.deepEqual(
    choices.slice(0, 2).map((c) => c.videoQuality),
    ['1080p', '360p']
  );
  assert.equal(choices[2].audioItag, '140');
  assert.ok(planChoices(settings).some((c) => c.mode === 'audio'));
});

test('valid single video URL forms and misleading external URLs', () => {
  for (const url of [
    'https://youtube.com/watch?v=aqz-KE-bpKQ',
    'https://youtu.be/aqz-KE-bpKQ?t=3',
    'https://music.youtube.com/watch?v=aqz-KE-bpKQ',
    'https://m.youtube.com/shorts/aqz-KE-bpKQ',
    'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
  ]) {
    assert.equal(scope.extractVideoId(url), 'aqz-KE-bpKQ');
  }
  assert.throws(() => scope.extractVideoId('https://youtube.com.evil.test/watch?v=aqz-KE-bpKQ'));
});
