import { invalidate } from '@/wiki/lib/cache';
// =============================================
// File: app/api/npcs/order/route.ts
// =============================================
/**
 * NPC 정렬 순서 일괄 업데이트
 * - PATCH body ->
 *   {
 *     village_id?: number,                    // 같은 마을만 제한(선택)
 *     npc_type?: string,                      // "normal" | "quest" 등(선택)
 *     orders: Array<{ id: number; order: number }> // 대상 id와 새 order
 *   }
 * - 동작 -> 입력 정제 -> 여러 UPDATE 순차 실행 -> 요약 로그 -> { success, updated } 반환
 * - 응답은 캐시 금지
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { getAuthUser } from '@/wiki/lib/auth';
import { logActivity, resolveVillageName } from '@wiki/lib/activity';
import { requireRole } from '@/wiki/lib/requireRole';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type OrderPair = { id: number; order: number };

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
    // 본문 파싱
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // 선택 필터
    const village_id =
      body.village_id !== undefined && body.village_id !== null
        ? Number(body.village_id)
        : undefined;
    const npc_type =
      typeof body.npc_type === 'string' ? String(body.npc_type).trim() : undefined;

    // orders 정제(숫자만, id 중복 제거)
    const rawOrders: unknown = body.orders;
    const seen = new Set<number>();
    const orders: OrderPair[] = Array.isArray(rawOrders)
      ? rawOrders
          .map((it: any) => ({
            id: Number(it?.id),
            order: Number(it?.order),
          }))
          .filter((p) => Number.isFinite(p.id) && Number.isFinite(p.order))
          .filter((p) => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          })
      : [];

    if (orders.length === 0) {
      return NextResponse.json(
        { error: 'orders required' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // UPDATE 순차 실행(간단/안전)
    let updated = 0;
    for (const { id, order } of orders) {
      const whereVillage = village_id !== undefined ? sql` AND village_id = ${village_id}` : sql``;
      const whereType = npc_type ? sql` AND npc_type = ${npc_type}` : sql``;

      const res = (await sql/*sql*/`
        UPDATE npc
        SET "order" = ${order}
        WHERE id = ${id}
        ${whereVillage}
        ${whereType}
        RETURNING id
      `) as unknown as Array<{ id: number }>;

      // 실제로 조건에 맞아 업데이트된 건만 카운트
      updated += res.length;
    }

    // 활동 로그(요약 1건) -> 경로에는 village 라벨(있으면)
    const me = await getAuthUser();
    const username = me?.minecraft_name ?? req.headers.get('x-wiki-username') ?? null;
    const villageLabel = village_id === undefined ? null : await resolveVillageName(village_id);

    invalidate('npc:list', 'village:list', 'search:index');
    await logActivity({
      action: 'npc.update',
      username,
      targetType: 'npc',
      targetId: null,
      targetName: null,
      targetPath: villageLabel,
      meta: { updated, orders, village_id, npc_type },
    });

    return NextResponse.json(
      { success: true, updated },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('/api/npcs/order PATCH error:', err);
    return NextResponse.json(
      { error: 'server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
