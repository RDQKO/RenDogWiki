import 'server-only';

import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { ImageReplacementError } from './imageReplacementStore';

export const REPLACEMENT_MAX_BYTES = Math.floor(3.9 * 1024 * 1024);
const mimeByFormat: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', heif: 'image/heif', tiff: 'image/tiff' };

export async function prepareReplacement(file: File, folderId: number, bucket: string) {
  if (!file.size || file.size > REPLACEMENT_MAX_BYTES) throw new ImageReplacementError(400, '이미지는 3.9MB 이하의 파일 하나를 선택해 주세요.');
  let buffer: Buffer = Buffer.from(await file.arrayBuffer());
  let metadata;
  try {
    const decoder = sharp(buffer, { animated: true, limitInputPixels: 40_000_000 });
    metadata = await decoder.metadata();
    // Decode the pixels as well: a valid header alone can hide a truncated file.
    await decoder.stats();
  }
  catch { throw new ImageReplacementError(400, '읽을 수 있는 이미지 파일을 선택해 주세요.'); }
  const format = metadata.format || '';
  if (!mimeByFormat[format] && format !== 'svg') throw new ImageReplacementError(400, '지원하지 않는 이미지 형식입니다. PNG, JPG, WebP, GIF 등을 사용해 주세요.');
  let ext = format === 'jpeg' ? 'jpg' : format;
  let mime = mimeByFormat[format];
  const convertForBrowser = !['png', 'jpeg', 'webp', 'gif', 'avif'].includes(format);
  // SVG is rasterized rather than storing active document content on the CDN.
  if (convertForBrowser || (!(metadata.pages && metadata.pages > 1) && buffer.length >= 40 * 1024)) {
    const converted = await sharp(buffer, { limitInputPixels: 40_000_000 }).rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer();
    if (convertForBrowser || converted.length < buffer.length) { buffer = converted; ext = 'webp'; mime = 'image/webp'; }
  }
  const key = `images/${folderId}/${Date.now()}_${randomUUID()}.${ext}`;
  const publicBase = process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/, '') ||
    (process.env.AWS_REGION && process.env.AWS_REGION !== 'us-east-1'
      ? `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com` : `https://${bucket}.s3.amazonaws.com`);
  const url = `${publicBase}/${key.split('/').map(encodeURIComponent).join('/')}`;
  return { buffer, key, url, mime };
}
