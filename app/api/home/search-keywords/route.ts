// =============================================
// File: app/api/home/search-keywords/route.ts
// 전체 교체용 코드
//
// - 인기 검색어 day/week/total 지원
// - 결과를 5분간 인스턴스 간 공유 캐시
// - 브라우저 응답은 no-store로 유지
// =============================================

import {
  NextResponse,
} from 'next/server';

import {
  runDbRead,
  sql,
} from '@/wiki/lib/db';

import {
  cached,
  cacheKey,
} from '@/wiki/lib/cache';

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
  value: string | null,
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

function noStoreHeaders() {
  return {
    'Cache-Control':
      'no-store, no-cache, must-revalidate, max-age=0',
  };
}

async function readRanking(
  range: RankingRange,
  limit: number,
) {
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
      0,
    ) as unknown as KeywordRow[];

  return rows
    .map((row) => {
      const keyword =
        String(
          row.keyword ?? '',
        ).trim();

      const searches =
        Number(
          row.searches ?? 0,
        );

      if (
        !keyword ||
        !Number.isFinite(
          searches,
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
        item,
      ): item is {
        keyword: string;
        searches: number;
      } => item !== null,
    );
}

export async function GET(
  request: Request,
) {
  const { searchParams } =
    new URL(request.url);

  const range =
    normalizeRange(
      searchParams.get('range'),
    );

  if (!range) {
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_range',
      },
      {
        status: 400,
        headers:
          noStoreHeaders(),
      },
    );
  }

  const requestedLimit =
    Number(
      searchParams.get('limit') ??
        6,
    );

  const limit =
    Number.isFinite(
      requestedLimit,
    )
      ? Math.min(
          Math.max(
            Math.trunc(
              requestedLimit,
            ),
            1,
          ),
          10,
        )
      : 6;

  try {
    const items =
      await cached(
        cacheKey(
          'home',
          'search-keywords',
          'v2',
          range,
          limit,
        ),
        {
          ttlSec: 300,
          tags: [
            'home:search-keywords',
          ],
        },
        async () =>
          await readRanking(
            range,
            limit,
          ),
      );

    return NextResponse.json(
      {
        ok: true,
        range,
        items,
      },
      {
        headers:
          noStoreHeaders(),
      },
    );
  } catch (error) {
    console.error(
      '[api/home/search-keywords] 인기 검색어 조회 실패:',
      error,
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
        headers:
          noStoreHeaders(),
      },
    );
  }
}
