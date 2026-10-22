/**
 * Which path to ask the Partner API for, given the path the browser sent to the proxy.
 *
 * Django's REST list and detail endpoints end in a slash, so the proxy adds one. Endpoints that serve
 * files do not: appending a slash to a tile PNG or a Zarr chunk makes them 404.
 */

/** Whole families of paths that are files, whatever their last segment looks like. */
const FILE_ENDPOINT_PREFIXES = ['partner_api/v1/hazard_zarr/'];

/** A last segment with an extension (a tile `12.png`, a `.zarray`, a chunk `0.1.2`). */
function looksLikeFilePath(path: string): boolean {
  return /\.[a-zA-Z0-9]+$/.test(path);
}

function ensureTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}

export function partnerTargetPath(rawPath: string): string {
  if (!rawPath.startsWith('partner_api/')) return rawPath;
  if (FILE_ENDPOINT_PREFIXES.some(prefix => rawPath.startsWith(prefix))) return rawPath;
  return looksLikeFilePath(rawPath) ? rawPath : ensureTrailingSlash(rawPath);
}
