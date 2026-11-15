// =============================================
// File: app/api/villages/route.ts   ← GET만 캐시 추가
// =============================================
/**
 * 마을 전체 조회/추가
 * - GET  -> name 없으면 전체 목록(order, name 순), name 있으면 단일 조회
 * - POST -> 새 마을 추가 (필수: name, icon)
 * - 목록 조회는 읽기 비중이 높아 120초 메모리 캐시 적용
 * - 쓰기/단건 생성 응답은 no-store 유지
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { getAuthUser } from '@/wiki/lib/auth';
import { logActivity } from '@wiki/lib/activity';
import { cached, invalidate } from '@/wiki/lib/cache'; // ✅ 캐시 유틸
import { requireRole } from '@/wiki/lib/requireRole';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function strOr<T extends string | null>(v: unknown, fallback: T): T {
  if (typeof v === 'string') return (v as string).trim() as T;
  return fallback;
}
function intOr<T extends number>(v: unknown, fallback: T): T {
  const n = Number(v);
  return (Number.isFinite(n) ? Math.trunc(n) : fallback) as T;
}

/** [마을 목록/단일 조회] GET */
export async function GET(req: NextRequest) {
  try {
    const nameParam = req.nextUrl.searchParams.get('name');
    const name = nameParam ? nameParam.trim() : '';

    if (!name) {
      // ✅ 전체 목록 120초 캐시
      const data = await cached('villages:all', { ttlSec: 120, tags: ['village:list'] }, async () => {
        const rows = await sql/*sql*/`
          SELECT id, name, icon, "order", head_icon
          FROM village
          ORDER BY "order", name
        `;
        return rows;
      });
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    }

    // ✅ 단일 조회도 쿼리별 캐시
    const data = await cached(`village:by-name:${name}`, { ttlSec: 120, tags: ['village:list'] }, async () => {
      const rows = await sql/*sql*/`
        SELECT id, name, icon, "order", head_icon
        FROM village
        WHERE name = ${name}
        LIMIT 1
      `;
      return Array.isArray(rows) && rows.length ? rows[0] : null;
    });

    if (!data) {
      return NextResponse.json(null, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[villages GET] unexpected error:', err);
    return NextResponse.json(
      { error: 'server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

/** [마을 추가] POST */
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
    const body = await req.json().catch(() => ({} as any));
    const name = strOr(body?.name, '');
    const icon = strOr(body?.icon, '');
    const order = intOr(body?.order, 0);
    const head_icon = body?.head_icon === undefined ? null : strOr(body?.head_icon, null);

    if (!name || !icon) {
      return NextResponse.json(
        { error: 'name, icon 필수' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const dup = await sql/*sql*/`SELECT 1 FROM village WHERE name = ${name} LIMIT 1`;
    if (Array.isArray(dup) && dup.length > 0) {
      return NextResponse.json(
        { error: '이미 존재하는 이름입니다.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // uploader/username
    const me = await getAuthUser();
    const uploader = me?.minecraft_name ?? req.headers.get('x-wiki-username') ?? 'admin';
    const username = uploader;

    const rows = await sql/*sql*/`
      INSERT INTO village (name, icon, "order", head_icon, uploader)
      VALUES (${name}, ${icon}, ${order}, ${head_icon}, ${uploader})
      RETURNING id, name, icon, "order", head_icon
    `;

    invalidate('npc:list', 'village:list', 'search:index');
    await logActivity({
      action: 'village.create',
      username,
      targetType: 'village',
      targetId: rows[0].id,
      targetName: rows[0].name,
      targetPath: null,
      meta: { order: rows[0].order, head_icon: rows[0].head_icon ?? null },
    });

    // ⚠️ 별도 무효화 API가 없다면 TTL 만료(120s)로 일관성 확보
    invalidate('villages:all', `village:by-name:${name}`, 'bootstrap:v1');
    return NextResponse.json(rows[0], { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[villages POST] unexpected error:', err);
    return NextResponse.json(
      { error: 'server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
