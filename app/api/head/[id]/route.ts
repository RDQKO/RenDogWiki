import { invalidate } from '@/wiki/lib/cache';
import { requireRole, canDeleteUploaded } from '@/wiki/lib/requireRole';
// =============================================
// File: app/api/head/[id]/route.ts
// =============================================
/**
 * Head Finder 단건 수정/삭제
 * - PATCH -> body에 온 필드만 부분 업데이트 (village_id/order/location_x,y,z/pictures)
 * - DELETE -> 단일 레코드 삭제
 * - 활동 로그는 사람이 읽기 쉬운 값으로 남김
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { logActivity } from '@wiki/lib/activity';
import { getAuthUser } from '@/wiki/lib/auth';

export const runtime = 'nodejs';

type HeadRow = {
  id: number;
  village_id: number;
  order: number;
  location_x: number;
  location_y: number;
  location_z: number;
  pictures: unknown;         // DB가 json/text/array 모두 될 수 있음
  uploader?: string | null;  // NOT NULL 컬럼이지만 타입상 옵션으로 둠
};

// 문자열/JSON/배열 입력을 안전한 배열로 정규화
function parsePictures(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (v == null) return [];
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

// 숫자 또는 null로 정규화 (없으면 기존값 유지용에서 사용)
function toNumOr<T extends number | null>(v: unknown, fallback: T): number | T {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export async function PATCH(
  req: NextRequest,
  { params: pendingParams }: { params: Promise<{ id: string }> }
) {
  const params = await pendingParams;
  const gate = await requireRole(['writer', 'admin']);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { error: 'Invalid id' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = await req.json().catch(() => ({} as any));

    const me = await getAuthUser();
    const username =
      me?.minecraft_name ?? req.headers.get('x-wiki-username') ?? null;

    // 현재 행 조회
    const rows = (await sql`
      SELECT *
      FROM head_finder
      WHERE id = ${id}
    `) as unknown as HeadRow[];

    if (!rows.length) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    const cur = rows[0];

    // 기존 pictures 파싱
    const curPictures = parsePictures(cur.pictures);

    // body에 온 필드만 덮어쓰기 -> 나머지는 현재값 유지
    const merged = {
      village_id: toNumOr(body?.village_id, cur.village_id),
      order: toNumOr(body?.order, cur.order),
      location_x: toNumOr(body?.location_x, cur.location_x),
      location_y: toNumOr(body?.location_y, cur.location_y),
      location_z: toNumOr(body?.location_z, cur.location_z),
      pictures:
        body?.pictures === undefined
          ? curPictures
          : parsePictures(body?.pictures),
    };

    // 변경된 필드만 추출(로그용)
    const changed: Record<
      string,
      { from: number | string[]; to: number | string[] }
    > = {};
    (['village_id', 'order', 'location_x', 'location_y', 'location_z'] as const)
      .forEach((k) => {
        if ((cur as any)[k] !== (merged as any)[k]) {
          changed[k] = { from: (cur as any)[k], to: (merged as any)[k] };
        }
      });
    if (JSON.stringify(curPictures) !== JSON.stringify(merged.pictures)) {
      changed.pictures = { from: curPictures, to: merged.pictures };
    }

    // 업데이트 수행 -> pictures는 jsonb 컬럼이므로 JS 배열 그대로 넣기
    await sql`
      UPDATE head_finder SET
        village_id = ${merged.village_id},
        "order"    = ${merged.order},
        location_x = ${merged.location_x},
        location_y = ${merged.location_y},
        location_z = ${merged.location_z},
        pictures   = ${merged.pictures}
      WHERE id = ${id}
    `;

    // 갱신된 데이터 재조회 -> pictures는 배열로 반환
    const updatedRows = (await sql`
      SELECT id, village_id, "order", location_x, location_y, location_z, pictures, uploader
      FROM head_finder
      WHERE id = ${id}
    `) as unknown as HeadRow[];

    const updated = updatedRows[0];
    (updated as any).pictures = parsePictures(updated.pictures);

    // 활동 로그
    invalidate('npc:list', 'village:list', 'search:index');
    await logActivity({
      action: 'head.update',
      username,
      targetType: 'head',
      targetId: id,
      targetName: `${merged.order}번 머리`,
      targetPath: String(merged.village_id),
      meta: { changed },
    });

    return NextResponse.json(updated, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[head PATCH] unexpected error:', err);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params: pendingParams }: { params: Promise<{ id: string }> }
) {
  const params = await pendingParams;
  const gate = await requireRole(['writer', 'admin']);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { error: 'Invalid id' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const me = await getAuthUser();
    const username =
      me?.minecraft_name ?? req.headers.get('x-wiki-username') ?? null;

    // 삭제 전 메타 조회(로그용)
    const rows = (await sql`
      SELECT id, village_id, "order"
      FROM head_finder
      WHERE id = ${id}
      LIMIT 1
    `) as unknown as Array<Pick<HeadRow, 'id' | 'village_id' | 'order' | 'uploader'>>;

    if (!rows.length) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const row = rows[0];

    const village = await sql`SELECT uploader FROM village WHERE id = ${row.village_id} LIMIT 1`;
    if (!canDeleteUploaded(gate.dbUser, row.uploader, village[0]?.uploader)) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }

    // 삭제
    await sql`DELETE FROM head_finder WHERE id = ${id}`;

    // 활동 로그
    invalidate('npc:list', 'village:list', 'search:index');
    await logActivity({
      action: 'head.delete',
      username,
      targetType: 'head',
      targetId: id,
      targetName: `${row.order}번 머리`,
      targetPath: String(row.village_id),
      meta: null,
    });

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[head DELETE] unexpected error:', err);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
