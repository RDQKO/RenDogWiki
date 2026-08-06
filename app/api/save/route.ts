// app/api/save/route.ts
// 전체 교체용 코드
//
// 문서 저장 직후 로컬 캐시와 Next.js 공유 Data Cache를 즉시 무효화합니다.

import { NextRequest, NextResponse } from 'next/server';

import { requireRole } from '@/app/wiki/lib/requireRole';
import { getAuthUser } from '@/wiki/lib/auth';
import { sql } from '@/wiki/lib/db';
import {
  invalidateDocumentCache,
} from '@/wiki/lib/documentCache';
import {
  replaceDocumentSearchSections,
} from '@/wiki/lib/documentSearchIndex';
import {
  logActivity,
  resolveCategoryName,
} from '@wiki/lib/activity';
import { invalidate } from '@wiki/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const listTag = (path: string | number) => `doclist:${String(path)}`;
const SEARCH_CACHE_TAG = 'search:index';

function normalizeContent(value: unknown): unknown {
  if (value == null) return [];

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) ?? [];
    } catch {
      return [];
    }
  }

  return value;
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
          .filter(Boolean),
      ),
    );
  }

  if (typeof value === 'string') {
    return Array.from(
      new Set(
        value
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    );
  }

  return [];
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(['writer', 'admin']);

  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      {
        status: gate.status,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  const getColInfo = async (table: string, column: string) => {
    const rows = (await sql`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE
        table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
      LIMIT 1
    `) as unknown as Array<{
      data_type?: string;
      udt_name?: string;
    }>;

    const row = rows[0] ?? {};

    return {
      isArray:
        row.data_type === 'ARRAY' ||
        (row.udt_name ?? '').startsWith('_'),
      isJsonOrJsonb:
        row.data_type === 'json' ||
        row.data_type === 'jsonb' ||
        row.udt_name === 'json' ||
        row.udt_name === 'jsonb',
      isJsonb:
        row.data_type === 'jsonb' ||
        row.udt_name === 'jsonb',
    };
  };

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const idRaw = body?.id;
    const idNum: number | null =
      idRaw === null || idRaw === undefined ? null : Number(idRaw);

    const titleRaw = typeof body?.title === 'string' ? body.title : '';
    const title = titleRaw.trim();

    const hasPath = Object.prototype.hasOwnProperty.call(body, 'path');
    const pathVal = body?.path;

    // path=0은 유효한 루트 경로입니다.
    const pathMissing =
      !hasPath ||
      pathVal === null ||
      pathVal === undefined ||
      String(pathVal) === '';

    if (pathMissing || !title) {
      return NextResponse.json(
        { error: 'path와 title은 필수입니다.' },
        {
          status: 400,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    const icon = typeof body?.icon === 'string' ? body.icon : '';
    const contentNorm = normalizeContent(body?.content);
    const contentJson = JSON.stringify(contentNorm);
    const tagsArr = normalizeTags(body?.tags);
    const tagsCsv = tagsArr.join(',');

    const user = getAuthUser();
    const uploader = (
      user?.minecraft_name ??
      req.headers.get('x-wiki-username') ??
      'system'
    ).toString();

    const tagsCol = await getColInfo('documents', 'tags');
    const contentCol = await getColInfo('document_contents', 'content');

    let documentId: number;
    let created = false;

    // 신규 문서 생성
    if (!Number.isFinite(idNum as number)) {
      const duplicate = await sql`
        SELECT id
        FROM documents
        WHERE path = ${pathVal}
          AND title = ${title}
        LIMIT 1
      `;

      if (Array.isArray(duplicate) && duplicate.length > 0) {
        return NextResponse.json(
          { error: '같은 카테고리(경로)에 동일한 제목의 문서가 존재합니다.' },
          {
            status: 409,
            headers: { 'Cache-Control': 'no-store' },
          },
        );
      }

      const maxRow = await sql`
        SELECT COALESCE(MAX("order"), -1) + 1 AS next
        FROM documents
        WHERE path = ${pathVal}
      `;
      const nextOrder = Number(maxRow[0]?.next ?? 0);

      const inserted = tagsCol.isArray
        ? await sql`
            INSERT INTO documents (
              title,
              path,
              icon,
              tags,
              "order",
              uploader
            )
            VALUES (
              ${title},
              ${pathVal},
              ${icon},
              ${tagsArr as unknown as string[]}::text[],
              ${nextOrder},
              ${uploader}
            )
            RETURNING id
          `
        : await sql`
            INSERT INTO documents (
              title,
              path,
              icon,
              tags,
              "order",
              uploader
            )
            VALUES (
              ${title},
              ${pathVal},
              ${icon},
              ${tagsCsv},
              ${nextOrder},
              ${uploader}
            )
            RETURNING id
          `;

      documentId = Number(inserted[0].id);

      if (contentCol.isJsonOrJsonb) {
        await sql`
          INSERT INTO document_contents (document_id, content)
          VALUES (
            ${documentId},
            ${contentJson}${contentCol.isJsonb ? sql`::jsonb` : sql`::json`}
          )
        `;
      } else {
        await sql`
          INSERT INTO document_contents (document_id, content)
          VALUES (${documentId}, ${contentJson})
        `;
      }

      created = true;
    } else {
      // 기존 문서 수정
      documentId = Number(idNum);

      const previousRows = await sql`
        SELECT path
        FROM documents
        WHERE id = ${documentId}
        LIMIT 1
      `;
      const oldPath = previousRows[0]?.path;

      const conflict = await sql`
        SELECT 1
        FROM documents
        WHERE
          path = ${pathVal}
          AND title = ${title}
          AND id <> ${documentId}
        LIMIT 1
      `;

      if (Array.isArray(conflict) && conflict.length > 0) {
        return NextResponse.json(
          { error: '같은 카테고리(경로)에 동일한 제목의 문서가 존재합니다.' },
          {
            status: 409,
            headers: { 'Cache-Control': 'no-store' },
          },
        );
      }

      if (tagsCol.isArray) {
        await sql`
          UPDATE documents
          SET
            title = ${title},
            path = ${pathVal},
            icon = ${icon},
            tags = ${tagsArr as unknown as string[]}::text[],
            updated_at = NOW()
          WHERE id = ${documentId}
        `;
      } else {
        await sql`
          UPDATE documents
          SET
            title = ${title},
            path = ${pathVal},
            icon = ${icon},
            tags = ${tagsCsv},
            updated_at = NOW()
          WHERE id = ${documentId}
        `;
      }

      const contentExists = await sql`
        SELECT 1
        FROM document_contents
        WHERE document_id = ${documentId}
        LIMIT 1
      `;

      if (Array.isArray(contentExists) && contentExists.length > 0) {
        if (contentCol.isJsonOrJsonb) {
          await sql`
            UPDATE document_contents
            SET content = ${contentJson}${
              contentCol.isJsonb ? sql`::jsonb` : sql`::json`
            }
            WHERE document_id = ${documentId}
          `;
        } else {
          await sql`
            UPDATE document_contents
            SET content = ${contentJson}
            WHERE document_id = ${documentId}
          `;
        }
      } else if (contentCol.isJsonOrJsonb) {
        await sql`
          INSERT INTO document_contents (document_id, content)
          VALUES (
            ${documentId},
            ${contentJson}${contentCol.isJsonb ? sql`::jsonb` : sql`::json`}
          )
        `;
      } else {
        await sql`
          INSERT INTO document_contents (document_id, content)
          VALUES (${documentId}, ${contentJson})
        `;
      }

      // 경로가 바뀌었다면 이전 경로의 목록 캐시도 무효화합니다.
      if (
        oldPath !== undefined &&
        oldPath !== null &&
        String(oldPath) !== String(pathVal)
      ) {
        invalidate(listTag(oldPath));
      }
    }

    // 본문 저장 후 최근 수정 순서가 즉시 반영되게 갱신합니다.
    await sql`
      UPDATE documents
      SET updated_at = NOW()
      WHERE id = ${documentId}
    `;

    // 검색 인덱스는 파생 데이터이므로 저장 성공을 방해하지 않습니다.
    // 실패한 문서는 /api/search/reindex로 다시 구축할 수 있습니다.
    let searchIndexUpdated = true;
    try {
      await replaceDocumentSearchSections(
        documentId,
        contentNorm,
      );
    } catch (searchIndexError) {
      searchIndexUpdated = false;
      console.error(
        '[문서 저장 API] 검색 인덱스 갱신 실패:',
        searchIndexError,
      );
    }

    // DB 변경이 완료된 즉시 캐시부터 비웁니다.
    // 이후 활동 로그가 실패해도 오래된 본문이 계속 노출되지 않습니다.
    invalidateDocumentCache(documentId);
    invalidate(
      SEARCH_CACHE_TAG,
      'doc:list',
      listTag(pathVal as string | number),
    );

    const categoryLabel = await resolveCategoryName(
      Number.isFinite(Number(pathVal)) ? Number(pathVal) : null,
    );

    await logActivity({
      action: created ? 'document.create' : 'document.update',
      username: uploader,
      targetType: 'document',
      targetId: documentId,
      targetName: title,
      targetPath: categoryLabel,
      meta: {
        tags: tagsArr,
        icon,
        created,
      },
    });

    return NextResponse.json(
      {
        success: true,
        id: documentId,
        searchIndexUpdated,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[문서 저장 API] 서버 내부 에러:', error);

    return NextResponse.json(
      {
        error: '서버 내부 에러',
        details: String(error),
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
