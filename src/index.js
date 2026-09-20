import { readSettings } from './settings.js';
import { planChoices } from './formats.js';
import { syncWebViewCookies } from './lib/cookies.js';
import './polyfills.js';
import { getBrowserProfile } from './lib/browser.js';
import { resolveVideo } from './lib/video.js';
import { extractPlaylistId, resolvePlaylist } from './lib/playlist.js';
import { prepareSabrStreams } from './lib/sabr/index.js';

function messageError(error) {
  return error instanceof MessageError ? error : new MessageError(`YouTube: ${error?.message || String(error)}`);
}

function userFacing(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      throw messageError(error);
    }
  };
}

function sanitizeFileName(value) {
  let name = String(value || 'youtube')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim();
  let safe = '',
    bytes = 0;
  for (const char of name) {
    const code = char.codePointAt(0);
    bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
    if (bytes > 140) break;
    safe += char;
  }
  safe = safe.replace(/[. ]+$/, '') || 'youtube';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = '_' + safe;
  return safe;
}

function checkCancelled(signal) {
  if (signal?.aborted) throw new MessageError('YouTube download cancelled.');
}

async function executePoTokenExpression(expression, signal) {
  const { overrideUserAgent } = await getBrowserProfile();
  const options = {
    headless: true,
    title: 'gopeed-youtube-sabr',
    ...(overrideUserAgent ? { userAgent: overrideUserAgent } : {}),
    width: 1280,
    height: 800,
  };
  checkCancelled(signal);
  const page = await gopeed.runtime.webview.open(options);
  let closing;
  const close = () => (closing ||= page.close());
  const onAbort = () => {
    void close().catch(() => {});
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    checkCancelled(signal);
    await page.goto('https://www.youtube.com/robots.txt', { timeoutMs: 30000 });
    await syncWebViewCookies(page);
    return await page.execute(expression);
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await close();
  }
}

// gopeed.host only exists on Gopeed v2.0.0-beta and later.
function requireHostVersion() {
  if (!gopeed.host?.env?.version) {
    throw new MessageError(
      'This extension requires Gopeed v2.0.0-beta.3 or later. Please upgrade Gopeed and try again.'
    );
  }
}

function requireRuntime(mode = 'muxed') {
  if (
    (mode === 'muxed' &&
      (typeof gopeed.runtime?.ffmpeg?.merge !== 'function' ||
        gopeed.runtime.ffmpeg.supportsInputFactory !== true ||
        gopeed.runtime.ffmpeg.supportsProducerProgress !== true)) ||
    typeof gopeed.runtime?.blob?.createObjectURL !== 'function'
  ) {
    throw new MessageError('Please upgrade Gopeed to a build with disk-backed media merging support.');
  }
  if (typeof gopeed.runtime?.webview?.isAvailable !== 'function' || !gopeed.runtime.webview.isAvailable()) {
    throw new MessageError('YouTube SABR downloads require an available Gopeed WebView runtime.');
  }
}

async function prepareSession(labels, signal) {
  const { input, quality, mode, audioQuality, audioContainer, audioItag } = labels;
  checkCancelled(signal);
  const prepared = await prepareSabrStreams({
    input,
    quality,
    preferWebM: false,
    preferH264: true,
    fallbackToBest: false,
    mode,
    audioQuality,
    audioContainer,
    audioItag,
    withPlayer: false,
  });
  checkCancelled(signal);
  const verification = await executePoTokenExpression(prepared.poTokenExpression, signal);
  checkCancelled(signal);
  return await prepared.prepareSession(verification);
}

async function createMergedURL(labels) {
  return await gopeed.runtime.blob.createObjectURL(
    () => {
      let producer;
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        producer?.abort();
      };
      const output = gopeed.runtime.ffmpeg.merge({
        inputs: userFacing(async ({ signal }) => {
          // Inputs download to temporary chunks while FFmpeg waits for capacity.
          const session = await prepareSession(labels, signal);
          if (signal.aborted) throw new Error('Download cancelled');
          producer = await session.openStreams();
          if (signal.aborted || stopped) {
            producer.abort();
            throw new Error('Download cancelled');
          }
          signal.addEventListener('abort', stop, { once: true });
          return { video: producer.videoStream, audio: producer.audioStream };
        }),
      });
      return output;
    },
    { contentType: 'video/mp4', range: false }
  );
}

async function refreshMergedURL(task) {
  const req = task.meta.req;
  requireRuntime(req.labels.mode);
  const previous = req.url;
  const next = req.labels.mode === 'muxed' ? await createMergedURL(req.labels) : await createTrackURL(req.labels);
  try {
    await task.setUrl(next);
  } catch (error) {
    await gopeed.runtime.blob.revokeObjectURL(next);
    throw error;
  }
  try {
    if (previous !== req.labels.input) await gopeed.runtime.blob.revokeObjectURL(previous);
  } catch (_) {
    /* A registration from a previous Gopeed process has expired. */
  }
}

// A lazy single-track stream provides cancellation even while verification is pending.
async function createTrackURL(labels) {
  const audio = labels.mode === 'audio';
  return await gopeed.runtime.blob.createObjectURL(
    () => {
      const lifetime = new AbortController();
      let reader,
        producer,
        stopped = false;
      const stop = async (reason) => {
        if (stopped) return;
        stopped = true;
        lifetime.abort();
        producer?.abort();
        if (reader) {
          await reader.cancel(reason).catch(() => {});
          reader.releaseLock();
        }
      };
      return new ReadableStream(
        {
          async pull(controller) {
            try {
              if (!reader) {
                const session = await prepareSession(labels, lifetime.signal);
                checkCancelled(lifetime.signal);
                producer = await (audio ? session.openAudioStream() : session.openVideoStream());
                if (stopped) {
                  producer.abort();
                  return;
                }
                reader = producer.stream.getReader();
              }
              const chunk = await reader.read();
              if (stopped) return;
              if (chunk.done) {
                controller.close();
                await stop();
              } else controller.enqueue(chunk.value);
            } catch (error) {
              if (!stopped) controller.error(messageError(error));
              await stop(error);
            }
          },
          cancel: stop,
        },
        { highWaterMark: 0 }
      );
    },
    { contentType: audio ? (labels.audioContainer === 'webm' ? 'audio/webm' : 'audio/mp4') : 'video/mp4', range: false }
  );
}

function makeFile(input, title, choice, path = '') {
  const { mode, videoQuality = 'highest', audioQuality = 'highest', audioContainer = 'm4a', audioItag = '' } = choice;
  const audioLabel = /^\d+$/.test(audioQuality) ? `${audioQuality}kbps` : audioQuality;
  const qualityLabel = /^\d+p$/.test(videoQuality) ? `max-${videoQuality}` : videoQuality;
  const suffix =
    mode === 'audio'
      ? `audio-${audioLabel}${audioItag ? `-itag${audioItag}` : ''}.${audioContainer}`
      : mode === 'video'
      ? `video-only-${qualityLabel}.mp4`
      : `video+audio-${qualityLabel}-${audioLabel}.mp4`;
  const labels = {
    [gopeed.info.identity]: '1',
    input,
    quality: videoQuality,
    mode,
    audioQuality,
    audioContainer: mode === 'muxed' ? 'm4a' : audioContainer,
    audioItag,
    type: 'youtube-sabr',
  };
  return { name: `${sanitizeFileName(title)}.${suffix}`, path, req: { url: input, rawUrl: input, labels } };
}

gopeed.events.onResolve(
  userFacing(async (ctx) => {
    requireHostVersion();
    const settings = readSettings(ctx.req.url);
    requireRuntime(settings.askQuality ? 'muxed' : settings.downloadMode);
    const playlistId = extractPlaylistId(ctx.req.url, settings.playlistFromVideoUrl);
    if (playlistId) {
      const playlist = await resolvePlaylist(playlistId, settings.playlistLimit);
      const choices = planChoices(settings);
      const width = String(playlist.videos[playlist.videos.length - 1].index).length;
      ctx.res = {
        name: sanitizeFileName(playlist.title),
        range: false,
        files: playlist.videos.flatMap((video) =>
          choices.map((choice) =>
            makeFile(
              `https://www.youtube.com/watch?v=${video.id}`,
              `${String(video.index).padStart(width, '0')}. ${video.title}`,
              choice
            )
          )
        ),
      };
      return;
    }
    const video = await resolveVideo(ctx.req.url);
    // A WEB response may omit format descriptors until PoToken verification.
    // In that case offer explicitly labelled maximum-quality presets.
    const choices = planChoices(settings, video.formats?.length ? video.formats : null);
    const input = `https://www.youtube.com/watch?v=${video.id}`;
    ctx.res = { range: false, files: choices.map((choice) => makeFile(input, video.title, choice)) };
  })
);

gopeed.events.onStart(
  userFacing(async (ctx) => {
    if (ctx.task.meta.req.labels.type !== 'youtube-sabr') return;
    await refreshMergedURL(ctx.task);
  })
);

gopeed.events.onError(
  userFacing(async (ctx) => {
    const req = ctx.task.meta.req;
    if (req.labels.type !== 'youtube-sabr' || req.labels.retried === '1') return;
    await req.putLabel('retried', '1');
    await ctx.task.continue();
  })
);
