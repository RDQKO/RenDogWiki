/** Public, read-only aliases. Only managed object paths participate in replacement. */
export type ImageAliases = Record<string, string>;

const cdnBase = process.env.NEXT_PUBLIC_CDN_BASE || 'https://d1y7k8qotewoph.cloudfront.net';
const managedHosts = new Set([
  new URL(cdnBase).hostname,
  'd1y7k8qotewoph.cloudfront.net',
  'rendog-wiki-images.s3.amazonaws.com',
  'rdwiki.s3.ap-southeast-2.amazonaws.com',
  'rdwiki.s3.ap-northeast-2.amazonaws.com',
]);

export function managedImageKey(src: string): string | null {
  try {
    const url = new URL(src);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || !managedHosts.has(url.hostname)) return null;
    const key = decodeURIComponent(url.pathname.slice(1));
    if (!key.startsWith('images/') || key.split('/').some(part => !part || part === '.' || part === '..') || /[\\\u0000-\u001f]/.test(key)) return null;
    return key;
  } catch {
    return null;
  }
}

export function resolveImageReplacement(src: string | undefined, aliases: ImageAliases): string | undefined {
  if (!src) return src;
  const key = managedImageKey(src);
  if (!key || !Object.prototype.hasOwnProperty.call(aliases, key)) return src;
  const target = aliases[key];
  // The manifest always maps historical keys directly to the current file.
  // Drop historical ?v values instead of reusing their stale cache identity.
  return managedImageKey(target) ? target : src;
}
