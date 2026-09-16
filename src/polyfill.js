/**
 * The gopeed js engine (goja) does not provide `structuredClone`, and meriyah — the javascript parser
 * youtubei.js uses to read the youtube player script — calls it while parsing, so install a fallback.
 */
export function installPolyfills() {
  const globalScope = typeof globalThis !== 'undefined' ? globalThis : new Function('return this')();
  if (typeof globalScope.structuredClone !== 'function') {
    globalScope.structuredClone = (value) => deepClone(value, new Map());
  }
}

function deepClone(value, seen) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value);
  }
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags);
  }
  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }
  if (ArrayBuffer.isView(value)) {
    if (typeof DataView !== 'undefined' && value instanceof DataView) {
      return new DataView(value.buffer.slice(0), value.byteOffset, value.byteLength);
    }
    return new value.constructor(value);
  }
  if (Array.isArray(value)) {
    const clone = [];
    seen.set(value, clone);
    for (let i = 0; i < value.length; i++) {
      clone[i] = deepClone(value[i], seen);
    }
    return clone;
  }
  if (value instanceof Map) {
    const clone = new Map();
    seen.set(value, clone);
    value.forEach((item, key) => clone.set(deepClone(key, seen), deepClone(item, seen)));
    return clone;
  }
  if (value instanceof Set) {
    const clone = new Set();
    seen.set(value, clone);
    value.forEach((item) => clone.add(deepClone(item, seen)));
    return clone;
  }
  const clone = {};
  seen.set(value, clone);
  for (const key of Object.keys(value)) {
    clone[key] = deepClone(value[key], seen);
  }
  return clone;
}
