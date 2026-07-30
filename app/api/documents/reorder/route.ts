import { NextRequest, NextResponse } from 'next/server';
import { sql, withTx } from '@/wiki/lib/db';
import { invalidate } from '@/wiki/lib/cache';
import { requireRole } from '@/wiki/lib/requireRole';
import { logActivity, resolveCategoryName } from '@wiki/lib/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store' };
const docTag = (id: number) => `doc:${id}`;
const listTag = (path: string | number) => `doclist:${String(path)}`;

type ReorderItem = {
  id: number;
  order: number;
};

type MovePayload = {
  id: number;
  path: string;
};

function normalizeItems(value: unknown): ReorderItem[] | null | undefined {
  if (value === undefined || value === null) return undefined;
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
  const path = typeof record.path === 'string' ? record.path.trim() : '';
  if (!Number.isInteger(id) || id <= 0 || !/^\d+$/.test(path)) return null;
  return { id, path };
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
    const move = normalizeMove(body?.move);

    if (items === null || move === null || (!items && !move)) {
      return NextResponse.json(
        { error: '유효한 문서 정렬 또는 이동 정보가 필요합니다.' },
        { status: 400, headers: noStoreHeaders }
      );
    }

    const username = gate.dbUser.minecraft_name || gate.dbUser.username || 'unknown';

    if (move) {
      const documentRows = (await sql`
        SELECT id, title, path, "order"
        FROM documents
        WHERE id = ${move.id}
        LIMIT 1
      `) as unknown as Array<{
        id: number;
        title: string | null;
        path: string | number | null;
        order: number | null;
      }>;
      const document = documentRows[0];
      if (!document) {
        return NextResponse.json(
          { error: '이동할 문서를 찾을 수 없습니다.' },
          { status: 404, headers: noStoreHeaders }
        );
      }

      if (move.path !== '0') {
        const categoryRows = (await sql`
          SELECT id
          FROM categories
          WHERE id = ${Number(move.path)}
          LIMIT 1
        `) as unknown as Array<{ id: number }>;
        if (!categoryRows[0]) {
          return NextResponse.json(
            { error: '이동할 카테고리를 찾을 수 없습니다.' },
            { status: 404, headers: noStoreHeaders }
          );
        }
      }

      const oldPath = String(document.path ?? '0');
      const nextOrder = await withTx(async (tx) => {
        const nextOrderRows = (await tx`
          SELECT COALESCE(MAX("order"), -1) + 1 AS next_order
          FROM documents
          WHERE path = ${move.path}
        `) as unknown as Array<{ next_order: number | string | null }>;
        const calculatedOrder = Number(nextOrderRows[0]?.next_order ?? 0);

        await tx`
          UPDATE documents
          SET path = ${move.path}, "order" = ${calculatedOrder}, updated_at = NOW()
          WHERE id = ${move.id}
        `;
        return calculatedOrder;
      });

      invalidate(
        docTag(move.id),
        'doc:list',
        listTag(oldPath),
        listTag(move.path)
      );

      await logActivity({
        action: 'document.update',
        username,
        targetType: 'document',
        targetId: move.id,
        targetName: document.title ?? null,
        targetPath:
          move.path === '0' ? '루트 카테고리' : await resolveCategoryName(Number(move.path)),
        meta: {
          from_path: oldPath,
          to_path: move.path,
          order: nextOrder,
        },
      });

      return NextResponse.json(
        { message: 'document moved' },
        { headers: noStoreHeaders }
      );
    }

    const documentIds = items!.map((item) => item.id);
    const documentRows = (await sql`
      SELECT id, title, path
      FROM documents
      WHERE id = ANY(${documentIds})
    `) as unknown as Array<{
      id: number;
      title: string | null;
      path: string | number | null;
    }>;

    if (documentRows.length !== documentIds.length) {
      return NextResponse.json(
        { error: '정렬할 문서 일부를 찾을 수 없습니다.' },
        { status: 404, headers: noStoreHeaders }
      );
    }

    const paths = new Set(documentRows.map((document) => String(document.path ?? '0')));
    if (paths.size !== 1) {
      return NextResponse.json(
        { error: '같은 카테고리에 속한 문서끼리만 정렬할 수 있습니다.' },
        { status: 400, headers: noStoreHeaders }
      );
    }

    await withTx(async (tx) => {
      for (const item of items!) {
        await tx`
          UPDATE documents
          SET "order" = ${item.order}
          WHERE id = ${item.id}
        `;
      }
    });

    const path = Array.from(paths)[0];
    invalidate(
      'doc:list',
      listTag(path),
      ...documentIds.map((id) => docTag(id))
    );

    const firstDocument = documentRows.find((document) => document.id === items![0].id);
    const numericPath = /^\d+$/.test(path) ? Number(path) : null;
    await logActivity({
      action: 'document.update',
      username,
      targetType: 'document',
      targetId: firstDocument?.id ?? null,
      targetName: firstDocument?.title ?? null,
      targetPath:
        path === '0'
          ? '루트 카테고리'
          : numericPath === null
            ? path
            : await resolveCategoryName(numericPath),
      meta: { items },
    });

    return NextResponse.json(
      { message: 'documents reordered' },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    console.error('[documents reorder POST] unexpected error:', error);
    return NextResponse.json(
      { error: '문서 순서 변경 중 오류가 발생했습니다.' },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
