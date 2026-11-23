// =============================================
// File: app/api/image/move/route.ts
// =============================================
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
// ⚠️ 이 프로젝트의 getAuthUser는 인자 없는 시그니처라고 가정합니다.
import { getAuthUser } from '@/wiki/lib/auth';
import { requireRole, canDeleteUploaded } from '@/wiki/lib/requireRole';

type Role = 'guest' | 'writer' | 'admin';

// AuthUser에 role 속성이 없을 수 있으므로 호환 타입 정의
type AuthLike = {
  role?: Role;
  is_admin?: boolean;
  is_writer?: boolean;
  minecraft_name?: string | null;
};

export async function PATCH(_req: NextRequest) {
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

  const user = (await getAuthUser()) as AuthLike | null;
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  let body: any;
  try {
    // NextRequest는 핸들러 인자로 이미 전달되므로 다시 읽기
    // (_req.json() 사용)
    body = await _req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const ids: number[] = Array.isArray(body?.ids)
    ? body.ids.map((n: any) => Number(n)).filter(Number.isFinite)
    : [];

  const newFolderId: number | null =
    body?.new_folder_id === null || body?.new_folder_id === undefined
      ? null
      : Number(body.new_folder_id);

  if (!ids.length) {
    return NextResponse.json({ error: '이동할 이미지가 없습니다.' }, { status: 400 });
  }

  try {
    const rows = await sql/*sql*/`
      SELECT id, uploader
      FROM images
      WHERE id = ANY(${ids})
    `;
    if (rows.length !== ids.length) {
      return NextResponse.json({ error: '일부 이미지가 존재하지 않습니다.' }, { status: 404 });
    }
    if (rows.some(row => !canDeleteUploaded(gate.dbUser, row.uploader))) {
      return NextResponse.json({ error: '본인이 업로드한 이미지만 이동할 수 있습니다.' }, { status: 403 });
    }

    if (newFolderId !== null) {
      const folder = await sql/*sql*/`
        SELECT id FROM image_folders WHERE id = ${newFolderId} LIMIT 1
      `;
      if (!folder.length) {
        return NextResponse.json({ error: '대상 폴더가 존재하지 않습니다.' }, { status: 404 });
      }
    }

    await sql/*sql*/`
      UPDATE images
      SET folder_id = ${newFolderId}
      WHERE id = ANY(${ids})
    `;

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
