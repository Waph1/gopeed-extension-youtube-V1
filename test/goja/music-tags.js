// A pull adapter, not a replacement for Gopeed's stream implementation. This
// exercises the actual writer and binary operations in the pinned Goja engine.
/* global tagM4aStream */
globalThis.tagTestFinished = false;
globalThis.tagTestFailure = '';
globalThis.ReadableStream = class {
  constructor(source) {
    this.source = source;
  }
};

(async () => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  // Independent byte fixtures: four-character atom names, big-endian lengths.
  const atom = (codes, payload = []) => {
    const bytes = new Uint8Array(8 + payload.length);
    new DataView(bytes.buffer).setUint32(0, bytes.length);
    bytes.set(codes, 4);
    bytes.set(payload, 8);
    return bytes;
  };
  const offsets = new Uint8Array(12);
  new DataView(offsets.buffer).setUint32(4, 1);
  const makeMoov = () => atom([109, 111, 111, 118], atom([115, 116, 99, 111], offsets));
  new DataView(offsets.buffer).setUint32(8, makeMoov().length + 8);
  const media = new Uint8Array([3, 1, 4, 1, 5, 9]);
  const moov = makeMoov();
  const mdat = atom([109, 100, 97, 116], media);
  const input = new Uint8Array(moov.length + mdat.length);
  input.set(moov);
  input.set(mdat, moov.length);
  let position = 0,
    released = false;
  const source = {
    getReader: () => ({
      async read() {
        if (position === input.length) return { done: true };
        // Split every header across reads, as can happen over the network.
        return { done: false, value: input.subarray(position, ++position) };
      },
      async cancel() {},
      releaseLock() {
        released = true;
      },
    }),
  };
  const output = [];
  let closed = false;
  const controller = {
    enqueue(bytes) {
      for (const byte of bytes) output.push(byte);
    },
    close() {
      closed = true;
    },
    error(error) {
      throw error;
    },
  };
  const tagged = tagM4aStream(source, { title: 'Città 🎵', artist: 'Éva; 李', trackNumber: 7 });
  for (let pulls = 0; !closed && pulls < 1000; pulls++) await tagged.source.pull(controller);
  assert(closed && released, 'Tagging must finish and release the audio reader');
  const bytes = new Uint8Array(output);
  const find = (pattern) => {
    for (let i = 0; i <= bytes.length - pattern.length; i++) {
      if (pattern.every((value, offset) => bytes[i + offset] === value)) return i;
    }
    return -1;
  };
  const title = find([169, 110, 97, 109]); // ©nam is four bytes, not UTF-8.
  assert(title >= 0, 'Missing four-byte title atom');
  const titleText = [67, 105, 116, 116, 195, 160, 32, 240, 159, 142, 181];
  assert(find(titleText) === title + 20, 'Title text must retain its UTF-8 encoding');
  assert(find([169, 65, 82, 84]) >= 0, 'Missing artist atom');
  assert(find([195, 137, 118, 97, 59, 32, 230, 157, 142]) >= 0, 'Artist text must retain UTF-8');
  assert(find([116, 114, 107, 110]) >= 0, 'Missing track number atom');
  const stco = find([115, 116, 99, 111]);
  const mediaStart = find([109, 100, 97, 116]) + 4;
  assert(new DataView(bytes.buffer).getUint32(stco + 12) === mediaStart, 'Sample offsets must be relocated');
  assert(
    media.every((value, offset) => bytes[mediaStart + offset] === value),
    'Audio bytes must be unchanged'
  );
  globalThis.tagTestFinished = true;
})().catch((error) => {
  globalThis.tagTestFailure = error.stack || String(error);
});
