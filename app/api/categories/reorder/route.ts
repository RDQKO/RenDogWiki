import { NextRequest, NextResponse } from 'next/server';
import { sql, withTx } from '@/wiki/lib/db';
import { invalidate } from '@/wiki/lib/cache';
import { requireRole } from '@/wiki/lib/requireRole';
import { logActivity, resolveCategoryName } from '@wiki/lib/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

type ReorderItem = {
  id: number;
  order: number;
};

type MovePayload = {
  id: number;
  parent_id: number | null;
};

function normalizeItems(value: unknown): ReorderItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const seen = new Set<number>();
  const items: ReorderItem[] = [];
  for (const raw of value) {
    const id = Number(raw?.id);
    const order = Number(raw?.order);
    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      !Number.isInteger(order) ||
      order < 0 ||
      seen.has(id)
    ) {
      return null;
    }
    seen.add(id);
    items.push({ id, order });
  }
  return items;
}

function normalizeMove(value: unknown): MovePayload | null | undefined {
  if (value === undefined || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const id = Number(record.id);
  const rawParentId = record.parent_id;
  const parentId = rawParentId === null ? null : Number(rawParentId);

  if (!Number.isInteger(id) || id <= 0) return null;
  if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0)) return null;
  if (parentId === id) return null;
  return { id, parent_id: parentId };
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(['writer', 'admin']);
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status, headers: noStoreHeaders }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    const items = normalizeItems(body?.items);
    const moved = normalizeMove(body?.moved);

    if (!items) {
      return NextResponse.json(
        { error: '유효한 카테고리 정렬 정보가 필요합니다.' },
        { status: 400, headers: noStoreHeaders }
      );
    }
    if (moved === null) {
      return NextResponse.json(
        { error: '유효한 카테고리 이동 정보가 필요합니다.' },
        { status: 400, headers: noStoreHeaders }
      );
    }

    if (moved) {
      const movingRows = (await sql`
        SELECT id, name, parent_id
        FROM categories
        WHERE id = ${moved.id}
        LIMIT 1
      `) as unknown as Array<{
        id: number;
        name: string | null;
        parent_id: number | null;
      }>;
      if (!movingRows[0]) {
        return NextResponse.json(
          { error: '이동할 카테고리를 찾을 수 없습니다.' },
          { status: 404, headers: noStoreHeaders }
        );
      }

      if (moved.parent_id !== null) {
        const targetRows = (await sql`
          SELECT id
          FROM categories
          WHERE id = ${moved.parent_id}
          LIMIT 1
        `) as unknown as Array<{ id: number }>;
        if (!targetRows[0]) {
          return NextResponse.json(
            { error: '이동할 상위 카테고리를 찾을 수 없습니다.' },
            { status: 404, headers: noStoreHeaders }
          );
        }

        const descendantRows = (await sql`
          WITH RECURSIVE descendants AS (
            SELECT id FROM categories WHERE parent_id = ${moved.id}
            UNION ALL
            SELECT c.id
            FROM categories c
            INNER JOIN descendants d ON c.parent_id = d.id
          )
          SELECT id
          FROM descendants
          WHERE id = ${moved.parent_id}
          LIMIT 1
        `) as unknown as Array<{ id: number }>;
        if (descendantRows.length > 0) {
          return NextResponse.json(
            { error: '하위 카테고리 안으로 이동할 수 없습니다.' },
            { status: 400, headers: noStoreHeaders }
          );
        }
      }

    }

    await withTx(async (tx) => {
      if (moved) {
        await tx`
          UPDATE categories
          SET parent_id = ${moved.parent_id}
          WHERE id = ${moved.id}
        `;
      }

      for (const item of items) {
        await tx`
          UPDATE categories
          SET "order" = ${item.order}
          WHERE id = ${item.id}
        `;
      }
    });

    invalidate(
      'category:list',
      'category:tree',
      ...items.map((item) => `category:${item.id}`),
      ...(moved ? [`category:${moved.id}`] : [])
    );

    const firstId = moved?.id ?? items[0].id;
    const categoryRows = (await sql`
      SELECT name, parent_id
      FROM categories
      WHERE id = ${firstId}
      LIMIT 1
    `) as unknown as Array<{ name: string | null; parent_id: number | null }>;
    const category = categoryRows[0];
    const parentLabel = await resolveCategoryName(category?.parent_id ?? null);
    const username = gate.dbUser.minecraft_name || gate.dbUser.username || 'unknown';

    await logActivity({
      action: 'category.reorder',
      username,
      targetType: 'category',
      targetId: firstId,
      targetName: category?.name ?? null,
      targetPath: parentLabel,
      meta: {
        items,
        ...(moved ? { moved } : {}),
      },
    });

    return NextResponse.json(
      { message: moved ? 'category moved' : 'category reordered' },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    console.error('[categories reorder POST] unexpected error:', error);
    return NextResponse.json(
      { error: '카테고리 순서 변경 중 오류가 발생했습니다.' },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
