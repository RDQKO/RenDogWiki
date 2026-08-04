// =============================================
// File: app/api/bootstrap/route.ts
// 전체 교체용 코드
//
// - 위키 초기 카테고리와 문서 메타데이터 제공
// - 문서 본문은 bootstrap에 포함하지 않음
// - DB 조회 결과는 Next.js Data Cache에서 공유
// - API 응답 자체는 no-store로 유지해 변경 직후 오래된 CDN 응답 방지
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
  documents: BootstrapDocument[];
  featured: null;
  degraded?: boolean;
  stale?: boolean;
};

function noStoreHeaders() {
  return {
    'Cache-Control':
      'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
  };
}

function emptyBootstrapPayload(
  extra?: Partial<BootstrapPayload>,
): BootstrapPayload {
  return {
    categories: [],
    documents: [],
    featured: null,
    ...extra,
  };
}

export async function GET(
  request: Request,
) {
  try {
    const { searchParams } =
      new URL(request.url);

    /*
     * 관리·검증 요청은 공유 캐시를 우회할 수 있습니다.
     * 일반 위키 사용자는 기존 10분 공유 캐시를 사용합니다.
     */
    const bypassCache =
      searchParams.get('fresh') === '1' ||
      searchParams.has('ts');

    const data =
      await cached<BootstrapPayload>(
        'bootstrap:v8',
        {
          ttlSec:
            bypassCache
              ? 0
              : 600,
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
                  id: row.id,
                  title: row.title,
                  path: row.path,
                  icon: row.icon,
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

    /*
     * DB 결과는 위 cached()에서 공유하지만 HTTP 응답은 캐시하지 않습니다.
     * revalidateTag()가 처리한 최신 값을 다음 요청에서 바로 받을 수 있습니다.
     */
    return NextResponse.json(
      data,
      {
        status: 200,
        headers:
          noStoreHeaders(),
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
