// =============================================
// File: app/api/image/folder/move/route.ts
// =============================================
/**
 * 이미지 폴더 이동
 * - PATCH body -> { id, new_parent_id }  (루트는 null 가능)
 * - 이동 규칙
 *   - 대상 폴더가 존재해야 함
 *   - new_parent_id가 존재해야 함(루트 null은 허용)
 *   - 자기 자신 혹은 자신의 하위로는 이동 불가(순환 방지)
 * - 로그: folder.move
 *   - targetName -> 폴더 이름
 *   - targetPath -> new_parent_id 숫자(활동 로그에서 라벨 치환)
 *   - meta -> { from_parent_id, to_parent_id, from_parent_name, to_parent_name }
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { getAuthUser } from '@/wiki/lib/auth';
import { logActivity, resolveFolderName } from '@/wiki/lib/activity';
import { requireRole } from '@/wiki/lib/requireRole';

export const runtime = 'nodejs';

function toNullableParent(v: unknown): number | null {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null; // 0/NaN -> null
}

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
    const body = await req.json().catch(() => null);
    const idNum = Number(body?.id);
    const toParent = toNullableParent(body?.new_parent_id);

    // 기본 검증
    if (!Number.isFinite(idNum) || idNum <= 0 || body?.new_parent_id === undefined) {
      return NextResponse.json(
        { error: 'id와 new_parent_id가 필요합니다.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 이동 대상 폴더 조회
    const rows = (await sql`
      SELECT id, name, parent_id
      FROM image_folders
      WHERE id = ${idNum}
      LIMIT 1
    `) as unknown as Array<{ id: number; name: string; parent_id: number | null }>;
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: 'not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 자기 자신을 부모로 지정 금지
    if (toParent === idNum) {
      return NextResponse.json(
        { error: '자기 자신 아래로는 이동할 수 없습니다.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 목적지 폴더 존재 여부(루트는 null 허용)
    if (toParent !== null) {
      const dest = (await sql`
        SELECT 1 FROM image_folders WHERE id = ${toParent} LIMIT 1
      `) as unknown as Array<{ '?column?': 1 }>;
      if (!dest.length) {
        return NextResponse.json(
          { error: '대상 부모 폴더를 찾을 수 없습니다.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }

    // 순환(자기 하위로 이동) 방지 -> 자신 포함 모든 하위 id 수집 후 검사
    if (toParent !== null) {
      const descRows = (await sql`
        WITH RECURSIVE subfolders AS (
          SELECT id FROM image_folders WHERE id = ${idNum}
          UNION
          SELECT f.id FROM image_folders f
          INNER JOIN subfolders sf ON f.parent_id = sf.id
        )
        SELECT id FROM subfolders
      `) as unknown as Array<{ id: number }>;
      const descendants = new Set(descRows.map((r) => r.id));
      if (descendants.has(toParent)) {
        return NextResponse.json(
          { error: '하위 폴더로는 이동할 수 없습니다.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }

    // 변경 전/후 정보
    const from_parent_id: number | null = row.parent_id ?? null;
    const to_parent_id: number | null = toParent;

    // no-op(부모 동일)인 경우 성공만 반환
    if ((from_parent_id ?? null) === (to_parent_id ?? null)) {
      return NextResponse.json(
        { success: true },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 업데이트
    await sql`UPDATE image_folders SET parent_id = ${to_parent_id} WHERE id = ${idNum}`;

    // 라벨 해석
    const from_parent_name = await resolveFolderName(from_parent_id);
    const to_parent_name = await resolveFolderName(to_parent_id);

    // 활동 로그
    const user = await getAuthUser();
    const username = user?.minecraft_name ?? req.headers.get('x-wiki-username') ?? null;
    await logActivity({
      action: 'folder.move',
      username,
      targetType: 'folder',
      targetId: idNum,
      targetName: row.name,
      targetPath: to_parent_id == null ? null : String(to_parent_id),
      meta: { from_parent_id, to_parent_id, from_parent_name, to_parent_name },
    });

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[image/folder/move PATCH] unexpected error:', err);
    return NextResponse.json(
      { error: 'server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
