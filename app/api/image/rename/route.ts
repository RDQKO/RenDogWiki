// =============================================
// File: app/api/image/rename/route.ts
// =============================================
/**
 * 이미지 이름(파일명) 수정
 * - PATCH body -> { id, name }
 * - 흐름 -> 입력 검증 -> 기존 메타 조회(로그용) -> 이름 업데이트 -> 활동 로그 -> { success: true }
 * - 응답은 실시간 성격이라 캐시 금지
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { logActivity, resolveFolderName } from '@/wiki/lib/activity';
import { getAuthUser } from '@/wiki/lib/auth';
import { requireRole } from '@/wiki/lib/requireRole';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest) {
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
    // 1) 입력 파싱/검증
    const body = await req.json().catch(() => null);
    const idNum = Number(body?.id);
    const rawName = typeof body?.name === 'string' ? body.name : '';
    const name = rawName.trim();

    if (!Number.isFinite(idNum) || idNum <= 0 || !name) {
      return NextResponse.json(
        { error: 'id와 name이 필요합니다.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 2) 기존 이미지 메타 조회(없으면 404)
    const oldRows = (await sql`
      SELECT id, name, folder_id
      FROM images
      WHERE id = ${idNum}
      LIMIT 1
    `) as unknown as Array<{ id: number; name: string | null; folder_id: number | null }>;

    if (!oldRows.length) {
      return NextResponse.json(
        { error: 'not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const old = oldRows[0];

    // 3) 이름 업데이트
    await sql`UPDATE images SET name = ${name} WHERE id = ${idNum}`;

    // 4) 활동 로그(폴더 라벨은 사람이 읽는 이름으로)
    const user = await getAuthUser();
    const username =
      user?.minecraft_name ?? req.headers.get('x-wiki-username') ?? null;
    const folderLabel = await resolveFolderName(old?.folder_id ?? null);

    await logActivity({
      action: 'image.rename',
      username,
      targetType: 'image',
      targetId: idNum,
      targetName: name,
      targetPath: folderLabel, // 폴더명이면 라벨, 루트면 '루트 폴더'
      meta: { from: old.name ?? null, to: name },
    });

    // 5) 성공 응답
    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[image/rename PATCH] unexpected error:', err);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
