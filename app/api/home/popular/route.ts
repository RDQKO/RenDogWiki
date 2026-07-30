// =============================================
// File: app/api/home/popular/route.ts
// 전체 신규 파일
//
// Home 인기 문서 전용 API.
// 이 API가 느리거나 실패해도 Home 페이지 렌더링에는 영향을 주지 않는다.
// =============================================

import { NextResponse } from 'next/server';

import {
  runDbRead,
  sql,
} from '@/wiki/lib/db';
import { cached } from '@/wiki/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const LEGACY_HOME_DOCUMENT_ID = 73;
const POPULAR_DOCUMENT_LIMIT = 5;
const POPULAR_CANDIDATE_LIMIT = 50;
const HOME_MODE = 'RPG';

type PopularRow = {
  id: number | string;
  title: string;
  path: number | string | null;
  views: number | string | bigint;
};

function createDocumentHref(
  id: number,
  path: number | string | null,
  title: string
) {
  const searchParams =
    new URLSearchParams({
      id: String(id),
      path: String(path ?? 0),
      title,
      mode: HOME_MODE,
    });

  return `/wiki?${searchParams.toString()}`;
}

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store',
  };
}

export async function GET() {
  try {
    const items = await cached(
      'home:popular-documents:week:v5',
      {
        ttlSec: 300,
        tags: ['doc:list'],
      },
      async () => {
        const rows = (await runDbRead(
          'api:home:popular:week',
          async () => {
            return await sql`
              WITH ranked_views AS (
                SELECT
                  document_id,
                  SUM(views)::bigint AS views
                FROM document_stats_daily
                WHERE
                  day >= (
                    CURRENT_DATE -
                    INTERVAL '6 days'
                  )
                GROUP BY document_id
                ORDER BY views DESC
                LIMIT ${POPULAR_CANDIDATE_LIMIT}
              )
              SELECT
                document.id,
                document.title,
                document.path,
                ranked_views.views
              FROM ranked_views
              JOIN documents document
                ON document.id =
                  ranked_views.document_id
              WHERE
                document.id <>
                  ${LEGACY_HOME_DOCUMENT_ID}
                AND document.is_featured
                  IS NOT TRUE
              ORDER BY
                ranked_views.views DESC,
                document.updated_at DESC
                  NULLS LAST,
                document.id DESC
              LIMIT ${POPULAR_DOCUMENT_LIMIT}
            `;
          },

          /*
           * 부가 기능이므로 DB 연결 실패 시 재시도하지 않는다.
           */
          0
        )) as unknown as PopularRow[];

        return rows
          .map((row) => {
            const id = Number(row.id);
            const views = Number(row.views);
            const title = String(
              row.title ?? ''
            ).trim();

            if (
              !Number.isInteger(id) ||
              id <= 0 ||
              !Number.isFinite(views) ||
              views <= 0 ||
              !title
            ) {
              return null;
            }

            return {
              id,
              title,
              category: '문서',
              href:
                createDocumentHref(
                  id,
                  row.path,
                  title
                ),
              views,
            };
          })
          .filter(
            (
              item
            ): item is {
              id: number;
              title: string;
              category: string;
              href: string;
              views: number;
            } => item !== null
          );
      }
    );

    return NextResponse.json(
      {
        items,
      },
      {
        headers: {
          'Cache-Control':
            'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    console.error(
      '[api/home/popular] 인기 문서 조회 실패:',
      error
    );

    /*
     * 인기 문서는 부가 기능이므로 500 대신 빈 목록을 반환한다.
     */
    return NextResponse.json(
      {
        items: [],
        degraded: true,
      },
      {
        status: 200,
        headers: noStoreHeaders(),
      }
    );
  }
}
