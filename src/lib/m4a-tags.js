// Stream-copy MP4 tagging. Only bounded control boxes are buffered; mdat audio
// passes through unchanged. Absolute sample/fragment indexes are relocated.
const MAX_BOX = 4 * 1024 * 1024;
const encoder = new TextEncoder();
const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'moof', 'traf', 'mfra']);

function join(parts) {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
function view(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
function uint32(value) {
  const bytes = new Uint8Array(4);
  view(bytes).setUint32(0, value);
  return bytes;
}
function read64(data, offset) {
  const value = data.getUint32(offset) * 4294967296 + data.getUint32(offset + 4);
  if (!Number.isSafeInteger(value)) throw new Error('M4A offset exceeds safe integer range');
  return value;
}
function writeOffset(data, offset, width, value) {
  if (!Number.isSafeInteger(value) || value < 0 || (width === 4 && value > 0xffffffff))
    throw new Error('M4A offset exceeds supported range');
  if (width === 8) data.setUint32(offset, Math.floor(value / 4294967296));
  data.setUint32(offset + width - 4, value % 4294967296);
}
function box(type, ...payload) {
  const content = join(payload);
  // Goja rejects primitive strings in Uint8Array.from. MP4 atom names use
  // single-byte character codes (including the copyright sign), not UTF-8.
  const name = new Uint8Array(4);
  for (let i = 0; i < name.length; i++) name[i] = type.charCodeAt(i);
  return join([uint32(content.length + 8), name, content]);
}
function boxHeader(bytes) {
  const data = view(bytes);
  const shortSize = data.getUint32(0);
  return {
    size: shortSize === 1 ? read64(data, 8) : shortSize,
    header: shortSize === 1 ? 16 : 8,
    type: String.fromCharCode(...bytes.subarray(4, 8)),
  };
}
function children(bytes, start) {
  const result = [];
  for (let offset = start; offset < bytes.length; ) {
    if (bytes.length - offset < 8) throw new Error('Truncated M4A box');
    const part = bytes.subarray(offset);
    const header = boxHeader(part);
    const size = header.size || part.length;
    if (size < header.header || size > part.length) throw new Error('Invalid M4A box size');
    result.push({ ...header, bytes: part.subarray(0, size) });
    offset += size;
  }
  return result;
}
function dataTag(name, payload, kind = 1) {
  return box(name, box('data', uint32(kind), uint32(0), payload));
}
function metadataBox(metadata) {
  const tags = [];
  for (const [key, atom] of [
    ['title', '\u00a9nam'],
    ['artist', '\u00a9ART'],
    ['album', '\u00a9alb'],
    ['albumArtist', 'aART'],
    ['date', '\u00a9day'],
    ['source', '\u00a9cmt'],
  ]) {
    if (metadata[key]) tags.push(dataTag(atom, encoder.encode(String(metadata[key]).slice(0, 4096))));
  }
  if (Number.isInteger(metadata.trackNumber) && metadata.trackNumber > 0 && metadata.trackNumber <= 65535) {
    const track = new Uint8Array(8);
    view(track).setUint16(2, metadata.trackNumber);
    tags.push(dataTag('trkn', track, 0));
  }
  if (metadata.cover) {
    if (
      !(metadata.cover.bytes instanceof Uint8Array) ||
      metadata.cover.bytes.length > 2 * 1024 * 1024 ||
      ![13, 14].includes(metadata.cover.kind)
    )
      throw new Error('Unsupported M4A artwork');
    tags.push(dataTag('covr', metadata.cover.bytes, metadata.cover.kind));
  }
  if (!metadata.title) throw new Error('Music metadata requires a title');
  const handler = box('hdlr', uint32(0), uint32(0), encoder.encode('mdirappl'), new Uint8Array(9));
  return box('meta', uint32(0), handler, box('ilst', ...tags));
}
function addMetadata(bytes, metadata) {
  const retained = [],
    userData = [];
  for (const child of children(bytes, boxHeader(bytes).header)) {
    if (child.type === 'udta') {
      userData.push(
        ...children(child.bytes, child.header)
          .filter((item) => item.type !== 'meta')
          .map((item) => item.bytes)
      );
    } else retained.push(child.bytes);
  }
  return box('moov', ...retained, box('udta', ...userData, metadataBox(metadata)));
}
function relocate(bytes, originalEnd, delta, depth = 0) {
  if (depth > 12) throw new Error('M4A box nesting exceeds safety limit');
  const { type, header } = boxHeader(bytes);
  const data = view(bytes);
  const patch = (offset, width) => {
    const value = width === 8 ? read64(data, offset) : data.getUint32(offset);
    if (value >= originalEnd) writeOffset(data, offset, width, value + delta);
  };
  if (type === 'stco' || type === 'co64') {
    const width = type === 'co64' ? 8 : 4;
    const count = data.getUint32(header + 4);
    if (header + 8 + count * width !== bytes.length) throw new Error('Invalid M4A sample offsets');
    for (let i = 0; i < count; i++) patch(header + 8 + i * width, width);
  } else if (type === 'tfhd') {
    if (data.getUint32(header) & 1) patch(header + 8, 8);
  } else if (type === 'tfra') {
    const version = bytes[header];
    if (version > 1) throw new Error('Unsupported M4A fragment index version');
    const width = version === 1 ? 8 : 4;
    const lengths = data.getUint32(header + 8);
    const suffix = ((lengths >> 4) & 3) + ((lengths >> 2) & 3) + (lengths & 3) + 3;
    const count = data.getUint32(header + 12);
    if (header + 16 + count * (2 * width + suffix) !== bytes.length) throw new Error('Invalid M4A fragment index');
    for (let i = 0; i < count; i++) patch(header + 16 + i * (2 * width + suffix) + width, width);
  } else if (type === 'saio') {
    throw new Error('Encrypted/auxiliary M4A offsets are not supported');
  } else if (containers.has(type)) {
    for (const child of children(bytes, header)) relocate(child.bytes, originalEnd, delta, depth + 1);
  }
}

export function tagM4aStream(source, metadata) {
  const reader = source.getReader();
  let pending = new Uint8Array(0),
    position = 0,
    remaining = 0;
  let seenMoov = false,
    seenAudio = false,
    originalEnd = 0,
    delta = 0,
    stopped = false;
  async function part(maximum) {
    while (!pending.length) {
      const next = await reader.read();
      if (stopped || next.done) return null;
      if (!(next.value instanceof Uint8Array)) throw new Error('Invalid M4A stream chunk');
      pending = next.value;
    }
    const output = pending.subarray(0, maximum);
    pending = pending.subarray(output.length);
    position += output.length;
    return output;
  }
  async function exact(size, allowEnd = false) {
    const result = new Uint8Array(size);
    for (let offset = 0; offset < size; ) {
      const chunk = await part(size - offset);
      if (!chunk) {
        if (allowEnd && offset === 0) return null;
        throw new Error('Truncated M4A audio stream');
      }
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
  async function stop(reason) {
    if (stopped) return;
    stopped = true;
    await reader.cancel(reason).catch(() => {});
    reader.releaseLock();
  }
  function finish(controller) {
    if (!seenMoov || !seenAudio) throw new Error('M4A audio or metadata header is missing');
    stopped = true;
    reader.releaseLock();
    controller.close();
  }
  return new ReadableStream(
    {
      async pull(controller) {
        try {
          if (remaining > 0) {
            const chunk = await part(remaining);
            if (stopped) return;
            if (!chunk) {
              if (remaining !== Infinity) throw new Error('Truncated M4A audio stream');
              finish(controller);
              return;
            }
            remaining -= chunk.length;
            controller.enqueue(chunk);
            return;
          }
          let headerBytes = await exact(8, true);
          if (stopped) return;
          if (!headerBytes) {
            finish(controller);
            return;
          }
          if (view(headerBytes).getUint32(0) === 1) headerBytes = join([headerBytes, await exact(8)]);
          const { size, header, type } = boxHeader(headerBytes);
          if (size !== 0 && size < header) throw new Error('Invalid M4A box size');
          if (type === 'moov' || type === 'moof' || type === 'mfra') {
            if (!size || size > MAX_BOX) throw new Error('M4A control box exceeds 4 MiB safety limit');
            let bytes = join([headerBytes, await exact(size - header)]);
            if (stopped) return;
            if (type === 'moov') {
              if (seenMoov) throw new Error('Multiple M4A initialization headers are not supported');
              originalEnd = position;
              bytes = addMetadata(bytes, metadata);
              delta = bytes.length - size;
              seenMoov = true;
            } else if (!seenMoov) throw new Error('M4A metadata header must precede audio fragments');
            relocate(bytes, originalEnd, delta);
            controller.enqueue(bytes);
          } else {
            if (['mdat', 'sidx'].includes(type) && !seenMoov)
              throw new Error('M4A metadata header must precede audio/index data');
            if (!size && type !== 'mdat') throw new Error('Unsupported open-ended M4A box');
            if (type === 'mdat') seenAudio = true;
            remaining = size ? size - header : Infinity;
            controller.enqueue(headerBytes);
          }
        } catch (error) {
          if (!stopped) controller.error(error);
          await stop(error);
        }
      },
      cancel: stop,
    },
    { highWaterMark: 0 }
  );
}
