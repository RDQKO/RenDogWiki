import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

import { requireRole } from '@/app/wiki/lib/requireRole';
import {
  runDbRead,
  sql,
} from '@/wiki/lib/db';
import {
  replaceDocumentSearchSectionsBatch,
} from '@/wiki/lib/documentSearchIndex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SEARCH_CACHE_TAG = 'search:index';
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 50;

type SourceRow = {
  id: number;
  content: unknown;
};

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store',
  };
}

async function requireAdminResponse() {
  const gate = await requireRole(['admin']);

  if (!gate.ok) {
    return {
      gate: null,
      response: NextResponse.json(
        { error: gate.error },
        {
          status: gate.status,
          headers: noStoreHeaders(),
        },
      ),
    };
  }

  return {
    gate,
    response: null,
  };
}

/** 검색 인덱스 구축 현황 확인 */
export async function GET() {
  const auth = await requireAdminResponse();
  if (auth.response) return auth.response;

  try {
    const rows = (await runDbRead(
      'search:reindex:status',
      async () => {
        return await sql`
          SELECT
            (SELECT COUNT(*)::int FROM documents)
              AS document_count,
            (
              SELECT COUNT(DISTINCT document_id)::int
              FROM document_search_sections
            ) AS indexed_document_count,
            (
              SELECT COUNT(*)::int
              FROM document_search_sections
            ) AS section_count
        `;
      },
    )) as unknown as Array<{
      document_count: number;
      indexed_document_count: number;
      section_count: number;
    }>;

    const status = rows[0] ?? {
      document_count: 0,
      indexed_document_count: 0,
      section_count: 0,
    };

    return NextResponse.json(
      {
        documentCount: Number(status.document_count ?? 0),
        indexedDocumentCount: Number(
          status.indexed_document_count ?? 0,
        ),
        sectionCount: Number(status.section_count ?? 0),
        missingDocumentCount: Math.max(
          0,
          Number(status.document_count ?? 0) -
            Number(status.indexed_document_count ?? 0),
        ),
      },
      {
        headers: noStoreHeaders(),
      },
    );
  } catch (error) {
    console.error('[search reindex GET] error:', error);

    return NextResponse.json(
      {
        error: '검색 인덱스 상태를 확인하지 못했습니다.',
        details: String(error),
      },
      {
        status: 500,
        headers: noStoreHeaders(),
      },
    );
  }
}

/**
 * 기존 문서 검색 인덱스를 ID 순서대로 나눠 구축합니다.
 * body: { cursor?: number, limit?: number }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminResponse();
  if (auth.response) return auth.response;

  try {
    const body = await req
      .json()
      .catch(() => ({} as Record<string, unknown>));

    const rawCursor = Number(body.cursor ?? 0);
    const cursor = Number.isFinite(rawCursor)
      ? Math.max(0, Math.trunc(rawCursor))
      : 0;

    const rawLimit = Number(body.limit ?? DEFAULT_BATCH_SIZE);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(
          MAX_BATCH_SIZE,
          Math.max(1, Math.trunc(rawLimit)),
        )
      : DEFAULT_BATCH_SIZE;

    const rows = (await runDbRead(
      'search:reindex:batch',
      async () => {
        return await sql`
          SELECT
            d.id,
            dc.content
          FROM documents d
          LEFT JOIN document_contents dc
            ON dc.document_id = d.id
          WHERE d.id > ${cursor}
          ORDER BY d.id ASC
          LIMIT ${limit}
        `;
      },
      0,
    )) as unknown as SourceRow[];

    await replaceDocumentSearchSectionsBatch(
      rows.map((row) => ({
        documentId: Number(row.id),
        content: row.content,
      })),
    );

    const lastId = rows.length > 0
      ? Number(rows[rows.length - 1].id)
      : cursor;
    const done = rows.length < limit;

    revalidateTag(SEARCH_CACHE_TAG);

    return NextResponse.json(
      {
        processed: rows.length,
        previousCursor: cursor,
        nextCursor: lastId,
        done,
      },
      {
        headers: noStoreHeaders(),
      },
    );
  } catch (error) {
    console.error('[search reindex POST] error:', error);

    return NextResponse.json(
      {
        error: '검색 인덱스를 구축하지 못했습니다.',
        details: String(error),
      },
      {
        status: 500,
        headers: noStoreHeaders(),
      },
    );
  }
}
