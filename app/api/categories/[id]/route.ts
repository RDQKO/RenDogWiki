import { invalidateDocumentCache } from '@/wiki/lib/documentCache';
import { deleteDocumentsUsing } from '@/wiki/lib/documentMutation';
/**
 * 카테고리 단건 수정/삭제/기존 단건 정렬 API
 * - PUT: 카테고리 정보 수정
 * - DELETE: 관리자 + 삭제 비밀번호 확인 후 하위 카테고리/문서 재귀 삭제
 * - POST: 기존 단건 order 갱신 호환 API
 */
import { sql, withTx } from '@/wiki/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { logActivity, resolveCategoryName } from '@wiki/lib/activity';
import { getAuthUser } from '@/wiki/lib/auth';
import { invalidate } from '@/wiki/lib/cache';
import { requireRole } from '@/wiki/lib/requireRole';

export const runtime = 'nodejs';

const noStoreHeaders = { 'Cache-Control': 'no-store' };
class CategoryError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const DELETE_PASSWORD = process.env.MANAGE_DELETE_PASSWORD;

function toNullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : null;
}

function toIntOrDefault(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : fallback;
}

function hasValidDeletePassword(req: NextRequest): boolean {
  return req.headers.get('x-rd-delete-password') === DELETE_PASSWORD;
}

export async function PUT(req: NextRequest, { params: pendingParams }: { params: Promise<{ id: string }> }
) {
  const params = await pendingParams;
  const gate = await requireRole(['writer', 'admin']);
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status, headers: noStoreHeaders }
    );
  }

  try {
    const idNum = Number(params.id);
    if (!Number.isFinite(idNum)) {
      return NextResponse.json(
        { error: 'invalid category id' },
        { status: 400, headers: noStoreHeaders }
      );
    }

    const prevRows = (await sql`
      SELECT document_id
      FROM categories
      WHERE id = ${idNum}
      LIMIT 1
    `) as unknown as Array<{ document_id: number | null }>;
    const prevDocumentId = prevRows?.[0]?.document_id ?? null;

    const body = await req.json().catch(() => null);
    const rawName = typeof body?.name === 'string' ? body.name : '';
    const name = rawName.trim();
    const icon = typeof body?.icon === 'string' && body.icon !== '' ? body.icon : null;
    const modeTags: string[] = Array.isArray(body?.mode_tags)
      ? Array.from(
          new Set(
            body.mode_tags
              .map((tag: unknown) => (typeof tag === 'string' ? tag.trim() : ''))
              .filter(Boolean)
          )
        )
      : [];

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400, headers: noStoreHeaders }
      );
    }

    const parentIdFixed = toNullableInt(body?.parent_id);
    const orderFixed = toIntOrDefault(body?.order, 0);
    const documentIdFixed = toNullableInt(body?.document_id);

    if (parentIdFixed !== null && parentIdFixed === idNum) {
      return NextResponse.json(
        { error: 'parent_id cannot be the same as id' },
        { status: 400, headers: noStoreHeaders }
      );
    }

    await withTx(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(191919, 1)`;
      const current = await tx`SELECT id FROM categories WHERE id = ${idNum} FOR UPDATE`;
      if (!current.length) throw new CategoryError(404, '카테고리를 찾을 수 없습니다.');
      if (parentIdFixed !== null) {
        const parent = await tx`SELECT id FROM categories WHERE id = ${parentIdFixed}`;
        if (!parent.length) throw new CategoryError(400, '상위 카테고리를 찾을 수 없습니다.');
        const descendants = await tx`
          WITH RECURSIVE descendants AS (
            SELECT id FROM categories WHERE id = ${idNum}
            UNION
            SELECT child.id FROM categories child JOIN descendants ON child.parent_id = descendants.id
          ) SELECT id FROM descendants WHERE id = ${parentIdFixed}
        `;
        if (descendants.length) throw new CategoryError(400, '하위 카테고리 안으로 이동할 수 없습니다.');
      }
      if (documentIdFixed !== null) {
        const document = await tx`SELECT id FROM documents WHERE id = ${documentIdFixed}`;
        if (!document.length) throw new CategoryError(400, '대표 문서를 찾을 수 없습니다.');
      }
      await tx`
        UPDATE categories SET name = ${name}, parent_id = ${parentIdFixed}, "order" = ${orderFixed},
          document_id = ${documentIdFixed}, icon = ${icon}, mode_tags = ${modeTags}::text[]
        WHERE id = ${idNum}
      `;
      // Changing a category's representative document is not a content edit.
      await tx`UPDATE documents SET is_featured = (id = ${documentIdFixed}::int) IS TRUE WHERE path = ${String(idNum)}`;
    });

    const docTag = (id: number) => `doc:${id}`;
    const listTag = (path: string | number) => `doclist:${String(path)}`;
    invalidate(
      'category:list',
      'category:tree',
      'category:modes',
      `category:${idNum}`,
      'doc:list',
      listTag(String(idNum)),
      ...(prevDocumentId ? [docTag(prevDocumentId)] : []),
      ...(documentIdFixed ? [docTag(documentIdFixed)] : [])
    );

    const user = await getAuthUser();
    const username = user?.minecraft_name ?? req.headers.get('x-wiki-username') ?? null;
    const parentLabel = await resolveCategoryName(parentIdFixed);
    await logActivity({
      action: 'category.update',
      username,
      targetType: 'category',
      targetId: idNum,
      targetName: name,
      targetPath: parentLabel,
      meta: {
        parent_id: parentIdFixed,
        order: orderFixed,
        document_id: documentIdFixed,
        icon,
        mode_tags: modeTags,
      },
    });

    return NextResponse.json({ message: 'updated' }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof CategoryError) return NextResponse.json({ error: error.message }, { status: error.status, headers: noStoreHeaders });
    console.error('[categories:id PUT] unexpected error:', error);
    return NextResponse.json(
      { error: '카테고리 업데이트 중 오류가 발생했습니다.' },
      { status: 500, headers: noStoreHeaders }
    );
  }
}

export async function DELETE(req: NextRequest, { params: pendingParams }: { params: Promise<{ id: string }> }
) {
  const params = await pendingParams;
  const gate = await requireRole(['admin']);
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status, headers: noStoreHeaders }
    );
  }

  if (!DELETE_PASSWORD) {
    return NextResponse.json({ error: '관리자 삭제 비밀번호 설정이 필요합니다.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  if (!hasValidDeletePassword(req)) {
    return NextResponse.json(
      { error: '삭제 비밀번호가 올바르지 않습니다.' },
      { status: 403, headers: noStoreHeaders }
    );
  }

  try {
    const idNum = Number(params.id);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      return NextResponse.json(
        { error: 'invalid category id' },
        { status: 400, headers: noStoreHeaders }
      );
    }

    const { categoryIds, documentIds, rootName, parentId } = await withTx(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(191919, 1)`;
    const subCategoryRows = (await tx`
      WITH RECURSIVE subcategories AS (
        SELECT id FROM categories WHERE id = ${idNum}
        UNION
        SELECT c.id
        FROM categories c
        INNER JOIN subcategories sc ON c.parent_id = sc.id
      )
      SELECT id FROM subcategories
    `) as unknown as Array<{ id: number }>;
    const categoryIds = (subCategoryRows || []).map((row) => Number(row.id));

    if (!categoryIds.length) throw new CategoryError(404, '카테고리를 찾을 수 없습니다.');

    const rootRows = (await tx`
      SELECT id, name, parent_id
      FROM categories
      WHERE id = ${idNum}
      LIMIT 1
    `) as unknown as Array<{
      id: number;
      name: string | null;
      parent_id: number | null;
    }>;
    const rootName = rootRows[0]?.name ?? null;

    const documentRows = (await tx`
      SELECT id, path
      FROM documents
      WHERE path = ANY(${categoryIds.map(String)})
    `) as unknown as Array<{ id: number; path: string | number | null }>;
    const documentIds = (documentRows || []).map((row) => Number(row.id));

    await deleteDocumentsUsing(tx, documentIds);
    await tx`DELETE FROM categories WHERE id = ANY(${categoryIds})`;
    return { categoryIds, documentIds, rootName, parentId: rootRows[0]?.parent_id ?? null };
    });
    const parentLabel = await resolveCategoryName(parentId);
    documentIds.forEach(invalidateDocumentCache);

    const invalidationTags = [
      'category:list',
      'category:tree',
      'category:modes',
      'doc:list',
      'search:index',
      ...categoryIds.map((id) => `category:${id}`),
      ...categoryIds.map((id) => `doclist:${id}`),
      ...documentIds.map((id) => `doc:${id}`),
    ];
    invalidate(...invalidationTags);

    const user = await getAuthUser();
    const username = user?.minecraft_name ?? req.headers.get('x-wiki-username') ?? null;
    await logActivity({
      action: 'category.delete',
      username,
      targetType: 'category',
      targetId: idNum,
      targetName: rootName,
      targetPath: parentLabel,
      meta: {
        deleted_category_ids: categoryIds,
        deleted_document_ids: documentIds,
      },
    });

    return NextResponse.json({ message: 'deleted' }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof CategoryError) return NextResponse.json({ error: error.message }, { status: error.status, headers: noStoreHeaders });
    console.error('[categories:id DELETE] unexpected error:', error);
    return NextResponse.json(
      { error: '카테고리 삭제 중 오류가 발생했습니다.' },
      { status: 500, headers: noStoreHeaders }
    );
  }
}

export async function POST(req: NextRequest, { params: pendingParams }: { params: Promise<{ id: string }> }
) {
  const params = await pendingParams;
  const gate = await requireRole(['writer', 'admin']);
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status, headers: noStoreHeaders }
    );
  }

  try {
    const idNum = Number(params.id);
    if (!Number.isFinite(idNum)) {
      return NextResponse.json(
        { error: 'invalid category id' },
        { status: 400, headers: noStoreHeaders }
      );
    }

    const body = await req.json().catch(() => null);
    const order = toIntOrDefault(body?.order, 0);
    await sql`UPDATE categories SET "order" = ${order} WHERE id = ${idNum}`;
    invalidate('category:list', 'category:tree');

    const categoryRows = (await sql`
      SELECT name, parent_id
      FROM categories
      WHERE id = ${idNum}
      LIMIT 1
    `) as unknown as Array<{ name: string | null; parent_id: number | null }>;
    const categoryName = categoryRows[0]?.name ?? null;
    const parentLabel = await resolveCategoryName(categoryRows[0]?.parent_id ?? null);

    const user = await getAuthUser();
    const username = user?.minecraft_name ?? req.headers.get('x-wiki-username') ?? null;
    await logActivity({
      action: 'category.reorder',
      username,
      targetType: 'category',
      targetId: idNum,
      targetName: categoryName,
      targetPath: parentLabel,
      meta: { order },
    });

    return NextResponse.json({ message: 'order updated' }, { headers: noStoreHeaders });
  } catch (error) {
    console.error('[categories:id POST] unexpected error:', error);
    return NextResponse.json(
      { error: '카테고리 순서 변경 중 오류가 발생했습니다.' },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
