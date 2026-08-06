// app/api/documents/route.ts
// 전체 교체용 코드
//
// 공개 문서 본문은 문서 ID별 Next.js Data Cache에 24시간 저장합니다.
// 문서 저장/삭제 시 doc:{id} 태그를 즉시 무효화합니다.
// API 응답 자체는 no-store를 유지해 브라우저에 오래된 본문이 남지 않게 합니다.

import { NextRequest, NextResponse } from 'next/server';

import {
  isTransientDbError,
  runDbRead,
  sql,
} from '@/wiki/lib/db';
import {
  getCachedDocumentById,
  invalidateDocumentCache,
} from '@/wiki/lib/documentCache';
import {
  logActivity,
  resolveCategoryName,
} from '@wiki/lib/activity';
import {
  cached,
  cacheKey,
  invalidate,
} from '@wiki/lib/cache';
import { requireRole } from '@/app/wiki/lib/requireRole';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DELETE_PASSWORD = process.env.MANAGE_DELETE_PASSWORD ?? '1290';

const listTag = (path: string | number) => `doclist:${String(path)}`;

type DocumentRow = {
  id: number;
  title: string;
  path: string | number | null;
  icon?: string | null;
  tags?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  special?: string | null;
  is_featured?: boolean;
  order?: number | string | null;
  content?: unknown;
};

type DocumentIdRow = {
  id: number;
};

type CategoryDocumentRow = {
  document_id: number | null;
};

function toContentArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function splitTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String).map((tag) => tag.trim()).filter(Boolean);
  }

  if (raw === null || raw === undefined || raw === '') return [];

  return String(raw)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
  };
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
    },
  );
}

async function findDocumentIdByPathAndTitle(path: string, title: string) {
  const rows = (await runDbRead(
    'documents:getIdByPathTitle',
    async () => {
      return await sql`
        SELECT id
        FROM documents
        WHERE path = ${path}
          AND title = ${title}
        LIMIT 1
      `;
    },
    0,
  )) as unknown as DocumentIdRow[];

  return rows[0]?.id ?? null;
}

async function findDocumentIdByPath(path: string) {
  const rows = (await runDbRead(
    'documents:getIdByPath',
    async () => {
      return await sql`
        SELECT id
        FROM documents
        WHERE path = ${path}
        LIMIT 1
      `;
    },
    0,
  )) as unknown as DocumentIdRow[];

  return rows[0]?.id ?? null;
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  // 관리 페이지는 ?ts=...를 사용하므로 문서 메타데이터 공유 캐시를 우회합니다.
  // 일반 사용자 요청은 기존 공유 캐시를 계속 사용합니다.
  const bypassMetadataCache =
    searchParams.has('ts') ||
    searchParams.get('fresh') === '1';

  // 문서 목록에는 본문이 없으므로 기존 목록 캐시를 유지합니다.
  if (searchParams.get('list') === '1') {
    try {
      const pathParam = (searchParams.get('path') ?? '0').trim();
      const pathNorm = pathParam === '' ? '0' : pathParam;

      const data = await cached(
        cacheKey('doclist', 'v2', pathNorm),
        {
          ttlSec: bypassMetadataCache ? 0 : 600,
          tags: ['doc:list', listTag(pathNorm)],
        },
        async () => {
          let mainDocumentId: number | null = null;

          try {
            if (/^\d+$/.test(pathNorm)) {
              const categoryRows = (await runDbRead(
                'documents:list:mainDocById',
                async () => {
                  return await sql`
                    SELECT document_id
                    FROM categories
                    WHERE id = ${Number(pathNorm)}
                    LIMIT 1
                  `;
                },
              )) as unknown as CategoryDocumentRow[];

              mainDocumentId = categoryRows[0]?.document_id ?? null;
            } else {
              const categoryRows = (await runDbRead(
                'documents:list:mainDocByName',
                async () => {
                  return await sql`
                    SELECT document_id
                    FROM categories
                    WHERE name = ${pathNorm}
                    LIMIT 1
                  `;
                },
              )) as unknown as CategoryDocumentRow[];

              mainDocumentId = categoryRows[0]?.document_id ?? null;
            }
          } catch {
            mainDocumentId = null;
          }

          const rows = (await runDbRead(
            'documents:list:rows',
            async () => {
              return await sql`
                SELECT
                  id,
                  title,
                  path,
                  icon,
                  tags,
                  created_at,
                  updated_at,
                  is_featured,
                  special,
                  "order"
                FROM documents
                WHERE
                  path = ${pathNorm}
                  AND (
                    ${mainDocumentId}::int IS NULL
                    OR id <> ${mainDocumentId}
                  )
                ORDER BY
                  "order" ASC,
                  updated_at DESC,
                  id DESC
              `;
            },
          )) as unknown as DocumentRow[];

          return {
            items: rows.map((row) => ({
              id: row.id,
              title: row.title,
              path: row.path,
              icon: row.icon,
              tags: splitTags(row.tags),
              created_at: row.created_at,
              updated_at: row.updated_at,
              special: row.special ?? null,
              is_featured: Boolean(row.is_featured),
              order: Number(row.order ?? 0),
              is_main:
                mainDocumentId !== null &&
                Number(mainDocumentId) === Number(row.id),
            })),
            main_document_id: mainDocumentId,
          };
        },
      );

      return NextResponse.json(data, {
        headers: noStoreHeaders(),
      });
    } catch (error) {
      console.error('[documents GET list] error:', error);

      if (isTransientDbError(error)) {
        return NextResponse.json(
          {
            items: [],
            main_document_id: null,
            degraded: true,
          },
          {
            status: 200,
            headers: noStoreHeaders(),
          },
        );
      }

      return NextResponse.json(
        { error: 'Server error' },
        { status: 500, headers: noStoreHeaders() },
      );
    }
  }

  const all = searchParams.get('all');
  const pathRaw = searchParams.get('path');
  const titleRaw = searchParams.get('title');
  const idRaw = searchParams.get('id');

  // ID가 있다면 항상 ID 기반 공유 캐시를 사용합니다.
  if (idRaw) {
    try {
      const id = Number(idRaw);

      if (!Number.isFinite(id) || id <= 0) {
        return NextResponse.json(
          { error: 'Invalid id' },
          { status: 400, headers: noStoreHeaders() },
        );
      }

      const data = await getCachedDocumentById(id);

      if (!data) {
        return new NextResponse(null, {
          status: 204,
          headers: noStoreHeaders(),
        });
      }

      return NextResponse.json(data, {
        headers: noStoreHeaders(),
      });
    } catch (error) {
      console.error('[documents GET by id] error:', error);

      if (isTransientDbError(error)) return transientDocUnavailable();

      return NextResponse.json(
        { error: 'Server error' },
        { status: 500, headers: noStoreHeaders() },
      );
    }
  }

  // 전체 문서 메타데이터에는 본문이 없으므로 기존 캐시를 유지합니다.
  if (all === '1') {
    try {
      const result = await cached(
        'doc:all:v2',
        {
          ttlSec: bypassMetadataCache ? 0 : 600,
          tags: ['doc:list'],
        },
        async () => {
          const rows = (await runDbRead(
            'documents:all',
            async () => {
              return await sql`
                SELECT
                  id,
                  title,
                  path,
                  icon,
                  tags,
                  created_at,
                  updated_at,
                  is_featured,
                  special,
                  "order"
                FROM documents
              `;
            },
          )) as unknown as DocumentRow[];

          return rows.map((row) => ({
            ...row,
            tags: splitTags(row.tags),
            is_featured: Boolean(row.is_featured),
            special: row.special ?? null,
            order: Number(row.order ?? 0),
          }));
        },
      );

      return NextResponse.json(result, {
        headers: noStoreHeaders(),
      });
    } catch (error) {
      console.error('[documents GET all] error:', error);

      if (isTransientDbError(error)) {
        return NextResponse.json([], {
          status: 200,
          headers: noStoreHeaders(),
        });
      }

      return NextResponse.json(
        { error: 'Server error' },
        { status: 500, headers: noStoreHeaders() },
      );
    }
  }

  const path = (pathRaw ?? '').trim();

  if (!path) {
    return NextResponse.json(
      { error: 'Missing path' },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  try {
    const title = (titleRaw ?? '').trim();

    // 오래된 path + title 링크는 ID만 찾고 같은 ID 캐시를 재사용합니다.
    const documentId = title
      ? await findDocumentIdByPathAndTitle(path, title)
      : await findDocumentIdByPath(path);

    if (!documentId) {
      return new NextResponse(null, {
        status: 204,
        headers: noStoreHeaders(),
      });
    }

    const data = await getCachedDocumentById(Number(documentId));

    if (!data) {
      return new NextResponse(null, {
        status: 204,
        headers: noStoreHeaders(),
      });
    }

    return NextResponse.json(data, {
      headers: noStoreHeaders(),
    });
  } catch (error) {
    console.error('[documents GET by path/title] error:', error);

    if (isTransientDbError(error)) return transientDocUnavailable();

    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireRole(['admin']);

  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: gate.status, headers: noStoreHeaders() },
    );
  }

  if (req.headers.get('x-rd-delete-password') !== DELETE_PASSWORD) {
    return NextResponse.json(
      { error: '삭제 비밀번호가 올바르지 않습니다.' },
      { status: 403, headers: noStoreHeaders() },
    );
  }

  const idRaw = req.nextUrl.searchParams.get('id');

  if (!idRaw) {
    return NextResponse.json(
      { error: 'Missing id' },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  try {
    const id = Number(idRaw);

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { error: 'Invalid id' },
        { status: 400, headers: noStoreHeaders() },
      );
    }

    const beforeRows = (await sql`
      SELECT id, title, path, tags
      FROM documents
      WHERE id = ${id}
      LIMIT 1
    `) as unknown as DocumentRow[];

    const document = beforeRows[0];

    if (!document) {
      return NextResponse.json(
        { error: 'not found' },
        { status: 404, headers: noStoreHeaders() },
      );
    }

    await sql`
      DELETE FROM document_contents
      WHERE document_id = ${id}
    `;

    await sql`
      DELETE FROM documents
      WHERE id = ${id}
    `;

    // 삭제가 끝난 직후 문서 본문, 목록, 검색 결과 캐시를 모두 무효화합니다.
    invalidateDocumentCache(id);
    invalidate(
      'doc:list',
      listTag(document.path ?? '0'),
      'search:index',
    );

    const username =
      gate.dbUser.minecraft_name ||
      gate.dbUser.username ||
      'unknown';

    let targetPathLabel: string | null = null;
    const documentPath = document.path;

    if (
      documentPath === 0 ||
      documentPath === '0' ||
      documentPath == null
    ) {
      targetPathLabel = '루트 카테고리';
    } else if (/^\d+$/.test(String(documentPath))) {
      targetPathLabel = await resolveCategoryName(Number(documentPath));
    } else {
      targetPathLabel = String(documentPath);
    }

    await logActivity({
      action: 'document.delete',
      username,
      targetType: 'document',
      targetId: id,
      targetName: document.title ?? null,
      targetPath: targetPathLabel,
      meta: {
        tags: document.tags ?? null,
      },
    });

    return NextResponse.json(
      { message: 'deleted' },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    console.error('[documents DELETE] error:', error);

    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: noStoreHeaders() },
    );
  }
}
