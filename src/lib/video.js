import { createLocalApiInnertube, extractVideoId } from './sabr/common.js';
import { buildSabrFormat } from 'googlevideo/utils';

export async function resolveVideo(input) {
  const id = extractVideoId(input);
  const yt = await createLocalApiInnertube({ withPlayer: false });
  const info = await yt.getBasicInfo(id);
  const title = info.basic_info?.title;
  // The unverified WEB player often reports UNPLAYABLE before PoToken minting.
  // Metadata is enough here; enforce actual playability when opening SABR.
  if (info.basic_info?.is_live || info.basic_info?.is_upcoming)
    throw new MessageError('Live and upcoming videos are not supported.');
  if (!title) throw new MessageError('Unable to read YouTube video information.');
  const formats = (info.streaming_data?.adaptive_formats || [])
    .filter((f) => !f.is_type_otf && !f.drm_families?.length)
    .map(buildSabrFormat);
  return { id, title, formats };
}
