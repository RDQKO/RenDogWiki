// File: app/api/image/folder/delete/route.ts

/**
 * 이미지 폴더 일괄 삭제
 * - DELETE body -> { id: number }
 * - 동작 -> 루트 폴더 id 기준으로 모든 하위 폴더/이미지 수집 -> S3 삭제 -> DB(images -> image_folders) 삭제 -> 활동 로그
 * - 보안 -> writer/admin 필요(requireRole) + 기존 getAuthUser 확인 유지
 * - 주의 -> 트랜잭션/롤백 없음. S3 또는 DB 한쪽 실패 가능성은 기존 정책 유지
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql, withTx } from '@/wiki/lib/db';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { selectImageFiles, invalidateImageAliases } from '@/wiki/lib/imageReplacementStore';
import { getAuthUser } from '@/wiki/lib/auth';
import { logActivity, resolveFolderName } from '@/wiki/lib/activity';
import { requireRole, canDeleteUploaded } from '@/wiki/lib/requireRole';

export const runtime = 'nodejs';

// 하위 폴더 id를 재귀적으로 모두 모은다(자기 자신 포함)
async function getAllFolderIds(rootId: number): Promise<number[]> {
  const rows = (await sql`
    WITH RECURSIVE subfolders AS (
      SELECT id
      FROM image_folders
      WHERE id = ${rootId}

      UNION

      SELECT f.id
      FROM image_folders f
      INNER JOIN subfolders sf ON f.parent_id = sf.id
    )
    SELECT id
    FROM subfolders
  `) as unknown as Array<{ id: number }>;

  return rows.map((r) => r.id);
}

export async function DELETE(req: NextRequest) {
  const gate = await requireRole(['writer', 'admin']);

  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      {
        status: gate.status,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }

  try {
    // 1) 인증 + 입력 파싱
    const user = await getAuthUser();

    if (!user) {
      return NextResponse.json(
        { error: '로그인 필요' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = await req.json().catch(() => null);
    const id = Number(body?.id);

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { error: '필수값 누락' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 2) 삭제 전 루트 정보 확보(로그용). 없으면 404
    const rootInfoRows = (await sql`
      SELECT id, name, parent_id
      FROM image_folders
      WHERE id = ${id}
      LIMIT 1
    `) as unknown as Array<{
      id: number;
      name: string | null;
      parent_id: number | null;
    }>;

    if (!rootInfoRows.length) {
      return NextResponse.json(
        { error: 'not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const rootInfo = rootInfoRows[0];
    const rootName = rootInfo.name ?? String(id);
    const parentLabel = await resolveFolderName(rootInfo.parent_id ?? null);

    // 3) 모든 하위 폴더 id 수집
    const folderIds = await getAllFolderIds(id);
    const folderOwners = await sql`SELECT uploader FROM image_folders WHERE id = ANY(${folderIds})`;
    const imageOwners = await sql`SELECT uploader FROM images WHERE folder_id = ANY(${folderIds})`;
    if ([...folderOwners, ...imageOwners].some((row) => !canDeleteUploaded(gate.dbUser, row.uploader))) {
      return NextResponse.json({ error: '다른 사용자의 폴더나 이미지가 포함되어 있습니다.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }

    // 4) 해당 폴더들의 이미지 S3 key 수집
    const imgRows = (await sql`
      SELECT id, s3_key
      FROM images
      WHERE folder_id = ANY(${folderIds})
    `) as unknown as Array<{ id: number; s3_key: string | null }>;

    const files = await selectImageFiles(imgRows.map(row => row.id));
    const keys = files
      .map((r) => (r?.s3_key ? String(r.s3_key) : ''))
      .filter((k) => k.length > 0)
      .map((k) => ({ Key: k }));

    // 5) S3에서 이미지 삭제(1000개 단위 분할). 키가 있을 때만 버킷 검사
    if (keys.length > 0) {
      const bucket = process.env.S3_BUCKET_NAME;

      if (!bucket) {
        return NextResponse.json(
          { error: 'S3_BUCKET_NAME 누락' },
          { status: 500, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      // 자격증명은 환경/IAM에서 자동 탐색. region만 명시(필요 시)
      const s3 = new S3Client({ region: process.env.AWS_REGION });

      for (let i = 0; i < keys.length; i += 1000) {
        const slice = keys.slice(i, i + 1000);

        const deleted = await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: slice },
          })
        );

        if (deleted.Errors?.length) throw new Error('S3 deletion was incomplete; database references were preserved.');
      }
    }

    // 6) DB에서 images -> image_folders 순으로 삭제(참조 무결성 고려)
    await withTx(async (tx) => {
      await tx`DELETE FROM images WHERE folder_id = ANY(${folderIds})`;
      await tx`DELETE FROM image_folders WHERE id = ANY(${folderIds})`;
    });
    invalidateImageAliases();

    // 7) 활동 로그
    await logActivity({
      action: 'folder.delete',
      username: user.minecraft_name,
      targetType: 'folder',
      targetId: id,
      targetName: rootName,
      targetPath: parentLabel, // 루트면 '루트 폴더'
      meta: {
        deletedFolders: folderIds.length,
        deletedImages: keys.length,
      },
    });

    // 8) 성공 응답
    return NextResponse.json(
      {
        ok: true,
        deleted: {
          folders: folderIds.length,
          images: keys.length,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[image/folder/delete] unexpected error:', err);

    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
