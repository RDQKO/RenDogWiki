// =============================================
// File: app/api/bootstrap/route.ts
// 전체 코드
//
// - 위키 초기 카테고리와 문서 메타데이터 제공
// - 문서 본문은 bootstrap에 포함하지 않음
// - 기본 문서도 일반 문서 상세 API를 통해 최신 본문을 읽음
// - 카테고리/문서 목록 메타데이터 캐시는 기존대로 유지
// =============================================

import {
  NextResponse,
} from 'next/server';

import {
  sql,
  runDbRead,
  isTransientDbError,
} from '@/wiki/lib/db';
import {
  cached,
} from '@/wiki/lib/cache';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

export const revalidate =
  0;

type BootstrapDocument = {
  id: number;
  title: string;
  path: string | number;
  icon?: string | null;
  is_featured?: boolean;
  special?: string | null;
  order: number;
  updated_at?: string | null;
};

type BootstrapPayload = {
  categories: any[];
  documents:
    BootstrapDocument[];
  featured: null;
  degraded?: boolean;
  stale?: boolean;
};

function noStoreHeaders() {
  return {
    'Cache-Control':
      'no-store, no-cache, must-revalidate, max-age=0',
  };
}

function emptyBootstrapPayload(
  extra?:
    Partial<BootstrapPayload>,
): BootstrapPayload {
  return {
    categories: [],
    documents: [],
    featured: null,
    ...extra,
  };
}

export async function GET() {
  try {
    /*
     * 본문을 제외한 구조 데이터만 캐시한다.
     * featured가 null이면 WikiPageInner의 기존 자동 오픈 로직이
     * 기본 문서를 /api/documents?id=...에서 새로 읽는다.
     */
    const data =
      await cached<BootstrapPayload>(
        'bootstrap:v7',
        {
          ttlSec: 600,
          tags: [
            'category:list',
            'category:tree',
            'doc:list',
          ],
        },
        async () => {
          const categories =
            await runDbRead(
              'bootstrap:categories',
              async () => {
                return await sql`
                  SELECT
                    id,
                    name,
                    parent_id,
                    "order",
                    document_id,
                    icon,
                    mode_tags
                  FROM categories
                  ORDER BY
                    parent_id,
                    "order"
                `;
              },
              0,
            );

          const docs =
            await runDbRead(
              'bootstrap:documents',
              async () => {
                return await sql`
                  SELECT
                    id,
                    title,
                    path,
                    icon,
                    is_featured,
                    special,
                    "order",
                    updated_at
                  FROM documents
                `;
              },
              0,
            );

          return {
            categories,
            documents:
              (docs ?? []).map(
                (row: any) => ({
                  id:
                    row.id,
                  title:
                    row.title,
                  path:
                    row.path,
                  icon:
                    row.icon,
                  is_featured:
                    Boolean(
                      row.is_featured,
                    ),
                  special:
                    row.special ??
                    null,
                  order:
                    Number(
                      row.order ??
                      0,
                    ),
                  updated_at:
                    row.updated_at,
                }),
              ),
            featured: null,
          };
        },
      );

    return NextResponse.json(
      data,
      {
        status: 200,
        headers: {
          'Cache-Control':
            'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
        },
      },
    );
  } catch (error) {
    console.error(
      '[bootstrap] error',
      error,
    );

    if (
      isTransientDbError(
        error,
      )
    ) {
      return NextResponse.json(
        emptyBootstrapPayload({
          degraded: true,
        }),
        {
          status: 200,
          headers:
            noStoreHeaders(),
        },
      );
    }

    return NextResponse.json(
      {
        error:
          'Server error',
      },
      {
        status: 500,
        headers:
          noStoreHeaders(),
      },
    );
  }
}
