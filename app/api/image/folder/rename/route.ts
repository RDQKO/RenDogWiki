// =============================================
// File: app/api/image/folder/rename/route.ts
// =============================================
/**
 * 이미지 폴더 이름 변경
 * - PATCH body -> { id, name }
 * - 동작 -> 대상 폴더 조회 -> 같은 parent 내 중복 이름 검사 -> 이름 업데이트 -> 활동 로그
 * - 로그: folder.rename
 *   - targetName -> 새 이름
 *   - targetPath -> parent_id 숫자(활동 로그에서 라벨로 치환됨)
 *   - meta -> { from_name, to_name }
 * - 응답은 실시간 성격 -> 캐시 금지
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { getAuthUser } from '@/wiki/lib/auth';
import { logActivity } from '@/wiki/lib/activity';
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
    // 1) 입력 파싱 -> id는 양의 정수, name은 공백 제거 후 1자 이상
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

    // 2) 대상 폴더 조회
    const rows = (await sql`
      SELECT id, name, parent_id
      FROM image_folders
      WHERE id = ${idNum}
      LIMIT 1
    `) as unknown as Array<{ id: number; name: string; parent_id: number | null }>;
    if (!rows.length) {
      return NextResponse.json(
        { error: 'not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    const before = rows[0];

    // 3) 같은 parent 내 중복 이름 금지 -> 자기 자신은 제외
    const dup = (await sql`
      SELECT 1
      FROM image_folders
      WHERE parent_id IS NOT DISTINCT FROM ${before.parent_id}
        AND name = ${name}
        AND id <> ${idNum}
      LIMIT 1
    `) as unknown as Array<{ '?column?': 1 }>;
    if (dup.length > 0) {
      return NextResponse.json(
        { error: '중복 폴더명' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 4) 이름 업데이트
    await sql`UPDATE image_folders SET name = ${name} WHERE id = ${idNum}`;

    // 5) 활동 로그 -> 사용자명은 로그인 정보 우선, 없으면 헤더
    const user = await getAuthUser();
    const username = user?.minecraft_name ?? req.headers.get('x-wiki-username') ?? null;

    await logActivity({
      action: 'folder.rename',
      username,
      targetType: 'folder',
      targetId: idNum,
      targetName: name,
      // 숫자 경로를 넣어두면 /activity/logs 단계에서 라벨로 치환됨
      targetPath: before.parent_id == null ? null : String(before.parent_id),
      meta: { from_name: before.name, to_name: name },
    });

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[image/folder/rename PATCH] unexpected error:', err);
    return NextResponse.json(
      { error: 'server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
