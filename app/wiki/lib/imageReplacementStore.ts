import 'server-only';

import { unstable_cache, revalidateTag } from 'next/cache';
import { runDbRead, sql, type SQL } from './db';
import type { AdditionalImageStyle, ImageAliases, ImageManifest } from './imageReplacements';

export const IMAGE_REPLACEMENTS_TAG = 'image:replacements:v1';

export async function readImageManifest(): Promise<ImageManifest> {
  const rows = await runDbRead('image:manifest', () => sql<{ s3_key: string; url: string; base_key: string; style: AdditionalImageStyle | null; variant_url: string | null }[]>`
    WITH sources AS (
      SELECT image_id, s3_key FROM image_versions
      UNION SELECT image_id, s3_key FROM image_variants
    )
    SELECT source.s3_key, image.url, image.s3_key AS base_key, variant.style, variant.url AS variant_url
    FROM sources source JOIN images image ON image.id = source.image_id
    LEFT JOIN image_variants variant ON variant.image_id = image.id
  `);
  const aliases: ImageAliases = {};
  const variants: ImageManifest['variants'] = {};
  for (const row of rows) {
    if (row.s3_key !== row.base_key) aliases[row.s3_key] = row.url;
    if (row.style && row.variant_url) (variants[row.base_key] ??= {})[row.style] = row.variant_url;
  }
  return { aliases, variants };
}

export async function readImageAliases(): Promise<ImageAliases> { return (await readImageManifest()).aliases; }

const cachedManifest = unstable_cache(readImageManifest, ['image-manifest-v2'], { tags: [IMAGE_REPLACEMENTS_TAG], revalidate: 60 });

export async function getImageManifest(): Promise<ImageManifest> {
  try { return await cachedManifest(); }
  catch (error) {
    // Allows a reviewed code deployment before the additive schema is installed.
    console.error('[image:aliases] registry unavailable', error);
    return { aliases: {}, variants: {} };
  }
}

export function invalidateImageAliases() {
  revalidateTag(IMAGE_REPLACEMENTS_TAG);
}

export type StoredImage = {
  id: number; name: string; folder_id: number; uploader: string | null;
  s3_key: string; url: string; mime_type: string | null; revision: number; updated_at: string | Date;
};

export class ImageReplacementError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function lockImage(tx: SQL, id: number): Promise<StoredImage> {
  const rows = await tx<StoredImage[]>`SELECT * FROM images WHERE id = ${id} FOR UPDATE`;
  if (!rows[0]) throw new ImageReplacementError(404, '이미지를 찾을 수 없습니다.');
  return rows[0];
}

export async function rememberImage(tx: SQL, image: StoredImage, by: string) {
  const shared = await tx`SELECT id FROM images WHERE s3_key = ${image.s3_key} AND id <> ${image.id} LIMIT 1`;
  if (shared.length) throw new ImageReplacementError(409, '같은 파일을 참조하는 다른 이미지가 있어 교체할 수 없습니다.');
  await tx`
    INSERT INTO image_versions (image_id, s3_key, url, mime_type, name, created_by)
    VALUES (${image.id}, ${image.s3_key}, ${image.url}, ${image.mime_type || 'image/png'}, ${image.name}, ${by})
    ON CONFLICT (s3_key) DO NOTHING
  `;
  const owners = await tx<{ image_id: number }[]>`SELECT image_id FROM image_versions WHERE s3_key = ${image.s3_key}`;
  if (owners[0]?.image_id !== image.id) throw new ImageReplacementError(409, '같은 파일을 참조하는 다른 이미지가 있어 교체할 수 없습니다.');
}

export async function selectImageFiles(ids: number[]) {
  try {
    return await sql<{ s3_key: string }[]>`
      SELECT s3_key FROM images WHERE id = ANY(${ids})
      UNION SELECT s3_key FROM image_versions WHERE image_id = ANY(${ids})
      UNION SELECT s3_key FROM image_variants WHERE image_id = ANY(${ids})
    `;
  } catch (error) {
    if ((error as { code?: string }).code !== '42P01') throw error;
    return await sql<{ s3_key: string }[]>`SELECT s3_key FROM images WHERE id = ANY(${ids})`;
  }
}
