// =============================================
// File: app/api/documents/route.ts
// (전체 코드)
// - 문서 상세/리스트/전체 조회
// - 상세 조회는 TTL 캐시
// - 모든 읽기 경로에 runDbRead 적용
// - DB timeout 시 가능한 범위에서 degraded 응답
// - 상세 조회 transient 에러는 503(JSON)로 반환
//   -> 프론트에서 자동 재시도 판정 가능
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { sql, runDbRead, isTransientDbError } from '@/wiki/lib/db';
import { logActivity, resolveCategoryName } from '@wiki/lib/activity';
import { cached, cacheKey, invalidate } from '@wiki/lib/cache';
import { requireRole } from '@/app/wiki/lib/requireRole';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const docTag = (id: number) => `doc:${id}`;
const listTag = (p: string | number) => `doclist:${String(p)}`;

function toContentArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

function noStoreHeaders() {
  return { 'Cache-Control': 'no-store' };
}

function transientDocUnavailable() {
  return NextResponse.json(
    {
      error: 'Document DB temporarily unavailable',
      transient: true,
    },
    {
      status: 503,
      headers: noStoreHeaders(),
    }
  );
}

async function getDocByIdCached(id: number) {
  return cached(
    cacheKey('doc', id),
    { ttlSec: 3600, tags: [docTag(id)] },
    async () => {
      const rows = await runDbRead(
        'documents:getDocById',
        async () => {
          return await sql`
            SELECT
              d.id,
              d.title,
              d.path,
              d.icon,
              d.tags,
              d.created_at,
              d.updated_at,
              d.special,
              d."order",
              dc.content
            FROM documents d
            LEFT JOIN document_contents dc
              ON dc.document_id = d.id
            WHERE d.id = ${id}
            LIMIT 1
          `;
        },
        0
      );

      const row = rows[0];
      if (!row) return null;

      return {
        id: row.id,
        title: row.title,
        path: row.path,
        icon: row.icon,
        tags: row.tags ? String(row.tags).split(',') : [],
        created_at: row.created_at,
        updated_at: row.updated_at,
        special: row.special ?? null,
        order: Number(row.order ?? 0),
        content: toContentArray(row.content ?? []),
      };
    }
  );
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  if (sp.get('list') === '1') {
    try {
      const pathParam = (sp.get('path') ?? '0').trim();
      const pathNorm = pathParam === '' ? '0' : pathParam;

      const data = await cached(
        cacheKey('doclist', pathNorm),
        { ttlSec: 600, tags: ['doc:list', listTag(pathNorm)] },
        async () => {
          let mainDocId: number | null = null;

          try {
            if (/^\d+$/.test(pathNorm)) {
              const r = await runDbRead('documents:list:mainDocById', async () => {
                return await sql`
                  SELECT document_id
                  FROM categories
                  WHERE id = ${Number(pathNorm)}
                  LIMIT 1
                `;
              });
              mainDocId = r?.[0]?.document_id ?? null;
            } else {
              const r = await runDbRead('documents:list:mainDocByName', async () => {
                return await sql`
                  SELECT document_id
                  FROM categories
                  WHERE name = ${pathNorm}
                  LIMIT 1
                `;
              });
              mainDocId = r?.[0]?.document_id ?? null;
            }
          } catch {}

          const rows = (await runDbRead('documents:list:rows', async () => {
            return await sql`
              SELECT
                id, title, path, icon, tags, created_at, updated_at,
                is_featured, special, "order"
              FROM documents
              WHERE path = ${pathNorm}
                AND (${mainDocId}::int IS NULL OR id <> ${mainDocId})
              ORDER BY "order" ASC, updated_at DESC, id DESC
            `;
          })) as any[];

          const items = rows.map((r) => ({
            id: r.id,
            title: r.title,
            path: r.path,
            icon: r.icon,
            tags: r.tags ? String(r.tags).split(',') : [],
            created_at: r.created_at,
            updated_at: r.updated_at,
            special: r.special ?? null,
            is_featured: Boolean(r.is_featured),
            order: Number(r.order ?? 0),
            is_main: mainDocId != null && Number(mainDocId) === Number(r.id),
          }));

          return { items, main_document_id: mainDocId };
        }
      );

      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    } catch (e) {
      console.error('문서 경로�?목록 ?�패:', e);

      if (isTransientDbError(e)) {
        return NextResponse.json(
          { items: [], main_document_id: null, degraded: true },
          { status: 200, headers: noStoreHeaders() }
        );
      }

      return NextResponse.json(
        { error: 'Server error' },
        { status: 500, headers: noStoreHeaders() }
      );
    }
  }

  const all = sp.get('all');
  const pathRaw = sp.get('path');
  const titleRaw = sp.get('title');
  const idRaw = sp.get('id');

  if (idRaw) {
    try {
      const id = Number(idRaw);
      if (!Number.isFinite(id) || id <= 0) {
        return NextResponse.json(
          { error: 'Invalid id' },
          { status: 400, headers: noStoreHeaders() }
        );
      }

      const data = await getDocByIdCached(id);
      if (!data) {
        return new NextResponse(null, {
          status: 204,
          headers: noStoreHeaders(),
        });
      }

      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    } catch (e) {
      console.error('[documents GET by id] error:', e);

      if (isTransientDbError(e)) {
        return transientDocUnavailable();
      }

      return NextResponse.json(
        { error: 'Server error' },
        { status: 500, headers: noStoreHeaders() }
      );
    }
  }

  if (all === '1') {
    try {
      const result = await cached(
        'doc:all',
        { ttlSec: 600, tags: ['doc:list'] },
        async () => {
          const rows = await runDbRead('documents:all', async () => {
            return await sql`
              SELECT
                id, title, path, icon, tags, created_at, updated_at,
                is_featured, special, "order"
              FROM documents
            `;
          });

          return (rows as any[]).map((r: any) => ({
            ...r,
            tags: r.tags ? String(r.tags).split(',') : [],
            is_featured: Boolean(r.is_featured),
            special: r.special ?? null,
            order: Number(r.order ?? 0),
          }));
        }
      );

      return NextResponse.json(result, {
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    } catch (e) {
      console.error('[documents GET all] error:', e);

      if (isTransientDbError(e)) {
        return NextResponse.json([], { status: 200, headers: noStoreHeaders() });
      }

      return NextResponse.json(
        { error: 'Server error' },
        { status: 500, headers: noStoreHeaders() }
      );
    }
  }

  const path = (pathRaw ?? '').trim();
  if (!path) {
    return NextResponse.json(
      { error: 'Missing path' },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  try {
    const title = (titleRaw ?? '').trim();

    if (title) {
      const row = (
        await runDbRead(
          'documents:getDocByPathTitle',
          async () => {
            return await sql`
              SELECT
                d.id,
                d.title,
                d.path,
                d.icon,
                d.tags,
                d.created_at,
                d.updated_at,
                d.special,
                d."order",
                dc.content
              FROM documents d
              LEFT JOIN document_contents dc
                ON dc.document_id = d.id
              WHERE d.path = ${path} AND d.title = ${title}
              LIMIT 1
            `;
          },
          0
        )
      )[0];

      if (!row) {
        return new NextResponse(null, {
          status: 204,
          headers: noStoreHeaders(),
        });
      }

      return NextResponse.json(
        {
          id: row.id,
          title: row.title,
          path: row.path,
          icon: row.icon,
          tags: row.tags ? String(row.tags).split(',') : [],
          created_at: row.created_at,
          updated_at: row.updated_at,
          special: row.special ?? null,
          order: Number(row.order ?? 0),
          content: toContentArray(row.content ?? []),
        },
        {
          headers: {
          'Cache-Control': 'no-store',
        },
        }
      );
    }

    const row = (
      await runDbRead(
        'documents:getIdByPath',
        async () => {
          return await sql`
            SELECT id
            FROM documents
            WHERE path = ${path}
            LIMIT 1
          `;
        },
        0
      )
    )[0];

    if (!row?.id) {
      return new NextResponse(null, {
        status: 204,
        headers: noStoreHeaders(),
      });
    }

    const data = await getDocByIdCached(Number(row.id));
    if (!data) {
      return new NextResponse(null, {
        status: 204,
        headers: noStoreHeaders(),
      });
    }

    return NextResponse.json(data, {
      headers: {
          'Cache-Control': 'no-store',
        },
    });
  } catch (e) {
    console.error('[documents GET by path/title] error:', e);

    if (isTransientDbError(e)) {
      return transientDocUnavailable();
    }

    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireRole(['writer', 'admin']);
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.error }), {
      status: gate.status,
      headers: { 'content-type': 'application/json' },
    });
  }

  const sp = req.nextUrl.searchParams;
  const idRaw = sp.get('id');
  if (!idRaw) {
    return NextResponse.json(
      { error: 'Missing id' },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  try {
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { error: 'Invalid id' },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const before = await sql`
      SELECT id, title, path, tags
      FROM documents
      WHERE id = ${id}
      LIMIT 1
    `;
    const doc = before[0];
    if (!doc) {
      return NextResponse.json(
        { error: 'not found' },
        { status: 404, headers: noStoreHeaders() }
      );
    }

    await sql`DELETE FROM document_contents WHERE document_id = ${id}`;
    await sql`DELETE FROM documents WHERE id = ${id}`;

    invalidate(docTag(id), 'doc:list', listTag(doc?.path));

    const username = gate.dbUser.minecraft_name || gate.dbUser.username || 'unknown';

    let targetPathLabel: string | null = null;
    const p = doc?.path;
    if (p === 0 || p === '0') targetPathLabel = '루트 카테고리';
    else if (p == null) targetPathLabel = '루트 카테고리';
    else if (/^\d+$/.test(String(p))) targetPathLabel = await resolveCategoryName(Number(p));
    else targetPathLabel = String(p);

    await logActivity({
      action: 'document.delete',
      username,
      targetType: 'document',
      targetId: id,
      targetName: doc?.title ?? null,
      targetPath: targetPathLabel,
      meta: { tags: doc?.tags ?? null },
    });

    return NextResponse.json({ message: 'deleted' }, { headers: noStoreHeaders() });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}
