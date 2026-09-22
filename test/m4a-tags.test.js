import test from 'node:test';
import assert from 'node:assert/strict';
import { tagM4aStream } from '../src/lib/m4a-tags.js';

const atom = (type, payload = Buffer.alloc(0)) => {
  const bytes = Buffer.alloc(payload.length + 8);
  bytes.writeUInt32BE(bytes.length, 0);
  bytes.write(type, 4, 4, 'latin1');
  payload.copy(bytes, 8);
  return bytes;
};
const input = (...boxes) => new Blob(boxes).stream();
const consume = (stream) => new Response(stream).arrayBuffer();
const tags = { title: 'Tagged title', artist: 'Artist' };

test('M4A writer handles chunk-split headers and leaves mdat payload unchanged', async () => {
  const media = Buffer.from('unchanged audio bytes');
  const bytes = Buffer.concat([atom('ftyp'), atom('moov'), atom('mdat', media)]);
  let offset = 0;
  const source = new ReadableStream({
    pull(c) {
      if (offset === bytes.length) c.close();
      else c.enqueue(bytes.subarray(offset, ++offset));
    },
  });
  const output = Buffer.from(await consume(tagM4aStream(source, tags)));
  assert.ok(output.includes(Buffer.from('Tagged title')));
  assert.ok(output.subarray(-media.length).equals(media));
});

test('M4A rejects missing/truncated/out-of-order/oversized control data', async () => {
  const oversized = atom('moov');
  oversized.writeUInt32BE(5 * 1024 * 1024, 0);
  for (const bytes of [
    Buffer.alloc(0),
    atom('mdat'),
    atom('moov'),
    oversized,
    Buffer.from([0, 0, 0]),
    Buffer.concat([atom('moov'), atom('moov')]),
    Buffer.concat([atom('moov'), Buffer.from([0, 0, 0, 99, 109, 100, 97, 116, 1])]),
  ]) {
    await assert.rejects(consume(tagM4aStream(input(bytes), tags)), /M4A/);
  }
});

test('M4A absolute sample offsets move with the enlarged metadata header', async () => {
  const offsets = Buffer.alloc(12);
  offsets.writeUInt32BE(1, 4);
  const makeMoov = () => atom('moov', atom('trak', atom('mdia', atom('minf', atom('stbl', atom('stco', offsets))))));
  const originalSize = makeMoov().length;
  offsets.writeUInt32BE(originalSize + 8, 8);
  const output = Buffer.from(await consume(tagM4aStream(input(makeMoov(), atom('mdat', Buffer.from('audio'))), tags)));
  const stco = output.indexOf('stco');
  assert.equal(output.readUInt32BE(stco + 12), output.indexOf('mdat') + 4);
});

test('M4A tagging is lazy, respects downstream cancellation and releases input', async () => {
  let pulls = 0,
    cancelled = 0;
  const source = new ReadableStream(
    {
      pull(c) {
        pulls++;
        c.enqueue(atom('free'));
      },
      cancel() {
        cancelled++;
      },
    },
    { highWaterMark: 0 }
  );
  const reader = tagM4aStream(source, tags).getReader();
  assert.equal(pulls, 0);
  await reader.read();
  assert.equal(pulls, 1);
  await reader.cancel();
  assert.equal(cancelled, 1);
  assert.equal(source.locked, false);
});

test('M4A forwards an upstream failure instead of completing a partial file', async () => {
  let pulls = 0;
  const source = new ReadableStream(
    {
      pull(c) {
        if (++pulls === 1) c.enqueue(atom('moov'));
        else c.error(Error('network broke'));
      },
    },
    { highWaterMark: 0 }
  );
  await assert.rejects(consume(tagM4aStream(source, tags)), /network broke/);
  assert.equal(source.locked, false);
});
