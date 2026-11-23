import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { sql, withTx } from '@/wiki/lib/db';
import { requireRole, canDeleteUploaded } from '@/wiki/lib/requireRole';
import { logActivity } from '@/wiki/lib/activity';
import { prepareReplacement } from '@/wiki/lib/imageReplacementFile';
import { ImageReplacementError, invalidateImageAliases, lockImage, rememberImage, type StoredImage } from '@/wiki/lib/imageReplacementStore';
import { managedImageKey } from '@/wiki/lib/imageReplacements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'no-store' };
const s3 = new S3Client({ region: process.env.AWS_REGION });
type Actor = { role: 'writer' | 'admin' | 'guest'; minecraft_name?: string | null; username: string };

function integer(value: unknown, allowZero = false) {
  if (typeof value !== 'number' && typeof value !== 'string') throw new ImageReplacementError(400, '이미지 ID와 현재 버전이 필요합니다.');
  if (String(value).trim() === '') throw new ImageReplacementError(400, '이미지 ID와 현재 버전이 필요합니다.');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < (allowZero ? 0 : 1)) throw new ImageReplacementError(400, '올바른 이미지 ID와 현재 버전을 지정해 주세요.');
  return n;
}

function assertOwner(image: StoredImage, user: Actor, expected?: number) {
  if (!canDeleteUploaded(user, image.uploader)) throw new ImageReplacementError(403, '본인이 업로드한 이미지만 교체하거나 복원할 수 있습니다.');
  if (expected !== undefined && image.revision !== expected) throw new ImageReplacementError(409, '다른 곳에서 이미지가 변경되었습니다. 창을 다시 열어 최신 이미지를 확인해 주세요.');
  if (image.mime_type?.startsWith('video/') || /\.(mp4|webm|mov)(?:[?#]|$)/i.test(image.url)) throw new ImageReplacementError(400, '이미지만 교체할 수 있습니다.');
  if (!image.s3_key || managedImageKey(image.url) !== image.s3_key) throw new ImageReplacementError(400, '관리되는 이미지 파일의 경로를 확인해 주세요.');
}

function failure(error: unknown) {
  if (error instanceof ImageReplacementError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  console.error('[image/replace]', error);
  return NextResponse.json({ error: '이미지 변경을 완료하지 못했습니다. 최신 상태를 확인한 후 다시 시도해 주세요.' }, { status: 503, headers });
}

async function complete(image: StoredImage, user: Actor, action: 'image.replace' | 'image.restore') {
  try { invalidateImageAliases(); } catch (error) { console.error('[image/replace] cache invalidation failed', error); }
  await logActivity({ action, username: user.minecraft_name || user.username, targetType: 'image', targetId: image.id,
    targetName: image.name, meta: { revision: image.revision, s3_key: image.s3_key } });
  return NextResponse.json({ success: true, image }, { headers });
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(['writer', 'admin']);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers });
  try {
    const id = integer(req.nextUrl.searchParams.get('id'));
    const result = await withTx(async tx => {
      const image = await lockImage(tx, id);
      assertOwner(image, gate.dbUser);
      const versions = await tx`
        SELECT id, name, url, mime_type, created_at, s3_key
        FROM image_versions WHERE image_id = ${id} ORDER BY id DESC LIMIT 100
      `;
      return { image, versions };
    });
    return NextResponse.json(result, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(['writer', 'admin']);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers });
  let uploadedKey: string | undefined;
  let bucket: string | undefined;
  let id: number | undefined;
  try {
    const length = Number(req.headers.get('content-length') || 0);
    if (length > 4.2 * 1024 * 1024) throw new ImageReplacementError(413, '파일은 3.9MB 이하로 선택해 주세요.');
    const form = await req.formData().catch(() => { throw new ImageReplacementError(400, '올바른 이미지 파일 요청이 필요합니다.'); });
    id = integer(form.get('id'));
    const expected = integer(form.get('expectedRevision'), true);
    const files = form.getAll('file');
    const file = files[0];
    if (files.length !== 1 || !file || typeof file === 'string') throw new ImageReplacementError(400, '교체할 이미지 파일 하나를 선택해 주세요.');
    const oldRows = await sql<StoredImage[]>`SELECT * FROM images WHERE id = ${id}`;
    if (!oldRows[0]) throw new ImageReplacementError(404, '이미지를 찾을 수 없습니다.');
    assertOwner(oldRows[0], gate.dbUser, expected);
    bucket = process.env.S3_BUCKET_NAME;
    if (!bucket) throw new Error('S3_BUCKET_NAME is not configured');
    const next = await prepareReplacement(file, oldRows[0].folder_id, bucket);
    uploadedKey = next.key;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: next.key, Body: next.buffer, ContentType: next.mime,
      CacheControl: 'public, max-age=31536000, immutable', ContentDisposition: 'inline' }));
    const image = await withTx(async tx => {
      const old = await lockImage(tx, id!);
      assertOwner(old, gate.dbUser, expected);
      const actor = gate.dbUser.minecraft_name || gate.dbUser.username;
      await rememberImage(tx, old, actor);
      await rememberImage(tx, { ...old, s3_key: next.key, url: next.url, mime_type: next.mime, name: file.name }, actor);
      const rows = await tx<StoredImage[]>`
        UPDATE images SET s3_key = ${next.key}, url = ${next.url}, mime_type = ${next.mime},
          revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id!} RETURNING *
      `;
      return rows[0];
    });
    return await complete(image, gate.dbUser, 'image.replace');
  } catch (error) {
    if (uploadedKey && bucket && id) {
      try {
        // A lost COMMIT response is not proof of rollback. Locking waits for an
        // in-flight writer; never delete a file recorded in committed history.
        const state = await withTx(async tx => {
          const current = await tx<StoredImage[]>`SELECT * FROM images WHERE id = ${id!} FOR UPDATE`;
          const versions = await tx`SELECT id FROM image_versions WHERE s3_key = ${uploadedKey!}`;
          return { current: current[0], committed: versions.length > 0 };
        });
        if (state.committed && state.current) return await complete(state.current, gate.dbUser, 'image.replace');
        if (!state.committed) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: uploadedKey }));
      } catch (cleanupError) {
        // Preserve an uncertain object rather than deleting a possibly active file.
        console.error('[image/replace] outcome/cleanup requires verification', cleanupError);
      }
    }
    return failure(error);
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireRole(['writer', 'admin']);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers });
  try {
    const body = await req.json().catch(() => { throw new ImageReplacementError(400, '올바른 복원 요청이 필요합니다.'); });
    const id = integer(body.id);
    const versionId = integer(body.versionId);
    const expected = integer(body.expectedRevision, true);
    const image = await withTx(async tx => {
      const current = await lockImage(tx, id);
      assertOwner(current, gate.dbUser, expected);
      const versions = await tx<{ s3_key: string; url: string; mime_type: string }[]>`
        SELECT s3_key, url, mime_type FROM image_versions WHERE id = ${versionId} AND image_id = ${id}
      `;
      if (!versions[0]) throw new ImageReplacementError(404, '복원할 이미지를 찾을 수 없습니다.');
      const version = versions[0];
      await rememberImage(tx, current, gate.dbUser.minecraft_name || gate.dbUser.username);
      return (await tx<StoredImage[]>`
        UPDATE images SET s3_key = ${version.s3_key}, url = ${version.url}, mime_type = ${version.mime_type},
          revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} RETURNING *
      `)[0];
    });
    return await complete(image, gate.dbUser, 'image.restore');
  } catch (error) { return failure(error); }
}
