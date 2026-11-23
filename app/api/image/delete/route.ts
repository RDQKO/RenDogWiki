// File: app/api/image/delete/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { logActivity } from '@wiki/lib/activity';
import { requireRole, canDeleteUploaded } from '@/wiki/lib/requireRole';
import { selectImageFiles, invalidateImageAliases } from '@/wiki/lib/imageReplacementStore';

export const runtime = 'nodejs';

function normalizeIds(input: any): number[] {
  if (!Array.isArray(input)) return [];

  const normalized = input
    .map((v) => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') return Number(v);
      if (v && typeof v === 'object' && 'id' in v) return Number(v.id);
      return NaN;
    })
    .filter((n) => Number.isFinite(n) && n > 0);

  return Array.from(new Set(normalized));
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
    const body = await req.json().catch(() => null);
    const ids = normalizeIds(body?.ids);

    if (ids.length === 0) {
      return NextResponse.json(
        { error: '유효한 ids가 없습니다.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const username = gate.dbUser.minecraft_name || gate.dbUser.username;

    // S3 key 조회
    const rows = await sql<{ s3_key: string | null; uploader: string | null }[]>`
      SELECT s3_key, uploader
      FROM images
      WHERE id = ANY(${ids})
    `;

    if (rows.some((row) => !canDeleteUploaded(gate.dbUser, row.uploader))) {
      return NextResponse.json({ error: '본인이 업로드한 이미지만 삭제할 수 있습니다.' }, { status: 403 });
    }

    const files = await selectImageFiles(ids);
    const keys = files
      .map((r) => (r?.s3_key ? String(r.s3_key) : ''))
      .filter((k) => k.length > 0)
      .map((k) => ({ Key: k }));

    // S3 삭제
    if (keys.length > 0) {
      const bucket = process.env.S3_BUCKET_NAME;

      if (!bucket) {
        return NextResponse.json(
          { error: 'S3_BUCKET_NAME 누락' },
          { status: 500, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const s3 = new S3Client({ region: process.env.AWS_REGION });

      for (let i = 0; i < keys.length; i += 1000) {
        const deleted = await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: keys.slice(i, i + 1000) },
          })
        );
        if (deleted.Errors?.length) throw new Error('S3 deletion was incomplete; database references were preserved.');
      }
    }

    // DB 삭제
    await sql`
      DELETE FROM images
      WHERE id = ANY(${ids})
    `;
    invalidateImageAliases();

    // 로그
    await logActivity({
      action: 'image.delete',
      username,
      targetType: 'image',
      targetId: null,
      targetName: null,
      targetPath: null,
      meta: {
        ids,
        count: ids.length,
        s3KeysCount: keys.length,
      },
    });

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[image/delete] unexpected error:', err);

    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
