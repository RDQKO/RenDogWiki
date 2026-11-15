import { invalidate } from '@/wiki/lib/cache';
// =============================================
// File: app/api/head/route.ts
// =============================================
/**
 * Head Finder 목록 조회/신규 등록
 * - GET  -> /api/head?village_id=xxx  마을별 목록 반환
 * - POST -> /api/head                  새 레코드 등록
 * - pictures는 문자열/JSON/배열이 올 수 있어도 배열로 정규화해서 다룸
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { logActivity, resolveVillageName } from '@wiki/lib/activity';
import { requireRole } from '@/app/wiki/lib/requireRole';

export const runtime = 'nodejs';

type HeadRow = {
  id: number;
  village_id: number;
  order: number;
  location_x: number;
  location_y: number;
  location_z: number;
  pictures: unknown;          // DB에 json/text/array일 수 있음
  uploader?: string | null;
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

// [GET] ?village_id=xxx
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const villageIdParam = searchParams.get('village_id');
    const village_id = villageIdParam != null ? Number(villageIdParam) : NaN;

    // village_id 없거나 숫자 아님 -> 빈 배열 반환
    if (!villageIdParam || !Number.isFinite(village_id)) {
      return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } });
    }

    // ❌ 캐시 없이 항상 최신 값 조회
    const rows = (await sql/*sql*/`
      SELECT id, village_id, "order", location_x, location_y, location_z, pictures, uploader
      FROM head_finder
      WHERE village_id = ${village_id}
      ORDER BY "order"
    `) as unknown as HeadRow[];

    const normalized = rows.map((r) => ({
      ...r,
      pictures: parsePictures(r.pictures),
    }));

    return NextResponse.json(normalized, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[head GET] unexpected error:', err);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

// [POST] 새 머리 추가
export async function POST(req: Request) {
  const gate = await requireRole(['writer', 'admin']);
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.error }), {
      status: gate.status,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    // ✅ uploader/username은 서버에서 확인한 계정 기반으로만
    const username = gate.dbUser.minecraft_name || gate.dbUser.username || 'unknown';

    // 🔹 DB NOT NULL 대응: uploader는 항상 문자열
    const uploader = username;

    // 필수값 존재 여부만 확인(기존 규칙 유지)
    const required = [
      'village_id',
      'order',
      'location_x',
      'location_y',
      'location_z',
      'pictures',
    ] as const;

    for (const key of required) {
      if (body[key] === undefined || body[key] === null) {
        return NextResponse.json(
          { error: `${key} 필수` },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }

    // 숫자 필드 정규화
    const village_id = Number(body.village_id);
    const order = Number(body.order);
    const location_x = Number(body.location_x);
    const location_y = Number(body.location_y);
    const location_z = Number(body.location_z);

    // pictures는 어떤 형태가 와도 배열로 정규화
    const pictures = parsePictures(body.pictures);

    // ✅ 1단계: 같은 마을 + 같은 order 중복 여부 사전 체크
    const dup = await sql/*sql*/`
      SELECT 1
      FROM head_finder
      WHERE village_id = ${village_id}
        AND "order"    = ${order}
      LIMIT 1
    `;
    if (Array.isArray(dup) && dup.length > 0) {
      return NextResponse.json(
        {
          error:
            '같은 마을에 이미 존재하는 머리 번호입니다. 다른 번호(order)로 입력해 주세요.',
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // ✅ 2단계: 실제 INSERT
    const inserted = (await sql/*sql*/`
      INSERT INTO head_finder
        (village_id, "order", location_x, location_y, location_z, pictures, uploader)
      VALUES (
        ${village_id},
        ${order},
        ${location_x},
        ${location_y},
        ${location_z},
        ${pictures},   -- jsonb 컬럼: JS 배열 그대로
        ${uploader}
      )
      RETURNING id, village_id, "order", location_x, location_y, location_z, pictures, uploader
    `) as unknown as HeadRow[];

    const row = inserted[0];
    const normalized = {
      ...row,
      pictures: parsePictures(row.pictures),
    };

    // 활동 로그 -> 경로에는 village 이름 사용
    const villageLabel = await resolveVillageName(normalized.village_id);

    invalidate('npc:list', 'village:list', 'search:index');
    await logActivity({
      action: 'head.create',
      username,
      targetType: 'head',
      targetId: normalized.id,
      targetName: `${normalized.order}번 머리`,
      targetPath: villageLabel,
      meta: {
        location: {
          x: normalized.location_x,
          y: normalized.location_y,
          z: normalized.location_z,
        },
        picturesCount: Array.isArray(normalized.pictures)
          ? normalized.pictures.length
          : 0,
      },
    });

    return NextResponse.json(normalized, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    console.error('[head POST] unexpected error:', err);

    // 🔁 혹시 레이스 컨디션으로 유니크 제약에 또 걸리면 여기서도 한 번 더 처리
    if (
      err?.code === '23505' &&
      ((err as any).constraint === 'unique_village_order' ||
        (err as any).constraint_name === 'unique_village_order')
    ) {
      return NextResponse.json(
        {
          error:
            '같은 마을에 이미 존재하는 머리 번호입니다. 다른 번호(order)로 입력해 주세요.',
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
