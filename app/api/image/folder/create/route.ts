// =============================================
// File: app/api/image/folder/create/route.ts
// =============================================
/**
 * 이미지 폴더 생성
 * - POST body -> { name: string, parent_id: number | null }
 * - 같은 parent 내 동일 이름 중복 불가 -> 409
 * - 생성자 표기는 로그인 유저의 minecraft_name 사용
 * - 응답은 실시간 성격 -> 캐시 금지
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { getAuthUser } from '@/wiki/lib/auth';
import { logActivity, resolveFolderName } from '@/wiki/lib/activity';
import { requireRole } from '@/wiki/lib/requireRole';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
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
    // 1) 인증
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json(
        { error: '로그인 필요' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 2) 입력 파싱 -> name은 공백 제거, parent_id는 null 또는 정수
    const body = await req.json().catch(() => null);
    const hasParentId = body && Object.prototype.hasOwnProperty.call(body, 'parent_id');
    const rawName = typeof body?.name === 'string' ? body.name : '';
    const name = rawName.trim();

    const normParentId = (() => {
      const v = body?.parent_id;
      if (v === null || v === '' || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null; // 0/NaN -> null 취급
    })();

    // 3) 필수값 검사(name, parent_id 필드 존재)
    if (!name || !hasParentId) {
      return NextResponse.json(
        { error: '필수값 누락' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 4) 같은 parent 내 중복 이름 검사
    const exists = (await sql`
      SELECT id
      FROM image_folders
      WHERE parent_id IS NOT DISTINCT FROM ${normParentId}
        AND name = ${name}
      LIMIT 1
    `) as unknown as Array<{ id: number }>;

    if (exists.length > 0) {
      return NextResponse.json(
        { error: '중복 폴더명' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 5) 생성
    const inserted = (await sql`
      INSERT INTO image_folders (name, parent_id, uploader)
      VALUES (${name}, ${normParentId}, ${user.minecraft_name})
      RETURNING id
    `) as unknown as Array<{ id: number | string }>;

    const folderId = Number(inserted[0].id);
    const parentLabel = await resolveFolderName(normParentId);

    // 6) 활동 로그
    await logActivity({
      action: 'folder.create',
      username: user.minecraft_name,
      targetType: 'folder',
      targetId: folderId,          // 숫자로 기록
      targetName: name,
      targetPath: parentLabel,
      meta: null,
    });

    // 7) 성공 응답
    return NextResponse.json(
      {
        ok: true,
        folder: {
          id: folderId,
          name,
          parent_id: normParentId,
          uploader: user.minecraft_name,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e: any) {
    // unique 제약이 있다면 여기서 409로 떨어질 수도 있음
    if (e?.code === '23505') {
      return NextResponse.json(
        { error: '중복 폴더명' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    console.error('[image/folder/create] error:', e);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
