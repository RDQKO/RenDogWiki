// =============================================
// 실제 적용 경로:
// app/api/home/search-keywords/route.ts
//
// 전체 신규 파일
//
// 인기 검색어:
// - range=day
// - range=week (기본값, 오늘 포함 최근 7일)
// - range=total
// =============================================

import {
  NextResponse,
} from 'next/server';

import {
  runDbRead,
  sql,
} from '@/wiki/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RankingRange =
  | 'day'
  | 'week'
  | 'total';

type KeywordRow = {
  keyword: string;
  searches:
    | number
    | string
    | bigint;
};

function normalizeRange(
  value: string | null
): RankingRange | null {
  const range =
    String(value ?? 'week')
      .toLowerCase();

  if (
    range === 'day' ||
    range === 'week' ||
    range === 'total'
  ) {
    return range;
  }

  return null;
}

export async function GET(
  request: Request
) {
  const { searchParams } =
    new URL(request.url);

  const range =
    normalizeRange(
      searchParams.get('range')
    );

  if (!range) {
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_range',
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  const requestedLimit = Number(
    searchParams.get('limit') ?? 6
  );

  const limit = Number.isFinite(
    requestedLimit
  )
    ? Math.min(
        Math.max(
          Math.trunc(
            requestedLimit
          ),
          1
        ),
        10
      )
    : 6;

  try {
    const rows =
      await runDbRead(
        `api:home:search-keywords:${range}`,
        async () => {
          if (range === 'total') {
            return await sql`
              SELECT
                keyword,
                searches
              FROM
                search_keyword_stats_total
              WHERE searches > 0
              ORDER BY
                searches DESC,
                updated_at DESC,
                keyword_key ASC
              LIMIT ${limit}
            `;
          }

          if (range === 'day') {
            return await sql`
              SELECT
                keyword,
                searches
              FROM
                search_keyword_stats_daily
              WHERE
                day = CURRENT_DATE
                AND searches > 0
              ORDER BY
                searches DESC,
                updated_at DESC,
                keyword_key ASC
              LIMIT ${limit}
            `;
          }

          return await sql`
            WITH weekly AS (
              SELECT
                keyword_key,
                SUM(searches)::bigint
                  AS searches
              FROM
                search_keyword_stats_daily
              WHERE
                day >= (
                  CURRENT_DATE -
                  INTERVAL '6 days'
                )
              GROUP BY keyword_key
            )
            SELECT
              total.keyword,
              weekly.searches
            FROM weekly
            JOIN
              search_keyword_stats_total
                total
              ON
                total.keyword_key =
                  weekly.keyword_key
            WHERE weekly.searches > 0
            ORDER BY
              weekly.searches DESC,
              total.updated_at DESC,
              total.keyword_key ASC
            LIMIT ${limit}
          `;
        },
        0
      ) as unknown as KeywordRow[];

    const items = rows
      .map((row) => {
        const keyword =
          String(
            row.keyword ?? ''
          ).trim();
        const searches =
          Number(
            row.searches ?? 0
          );

        if (
          !keyword ||
          !Number.isFinite(
            searches
          ) ||
          searches <= 0
        ) {
          return null;
        }

        return {
          keyword,
          searches,
        };
      })
      .filter(
        (
          item
        ): item is {
          keyword: string;
          searches: number;
        } => item !== null
      );

    return NextResponse.json(
      {
        ok: true,
        range,
        items,
      },
      {
        headers: {
          /*
           * 집계 테스트 직후 바로 확인할 수 있도록
           * 현재는 빈 결과도 캐시하지 않는다.
           */
          'Cache-Control':
            'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error(
      '[api/home/search-keywords] 인기 검색어 조회 실패:',
      error
    );

    return NextResponse.json(
      {
        ok: true,
        range,
        items: [],
        degraded: true,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}
