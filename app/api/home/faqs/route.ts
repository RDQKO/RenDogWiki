// =============================================
// 실제 적용 경로:
// app/api/home/faqs/route.ts
//
// 전체 교체용 코드
//
// 수정 내용:
// - FAQ 순위의 5분 애플리케이션/CDN 캐시 제거
// - day / week / total 지원 유지
// - 주간 데이터가 아직 없으면 누적 통계를 임시 대체 표시
// - FAQ 통계 조회 실패가 Home 전체에 영향을 주지 않음
// =============================================

import { NextResponse } from 'next/server';

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

type FaqRankRow = {
  id: number | string;
  title: string;
  views: number | string | bigint;
};

type RankingSource =
  | 'day'
  | 'week'
  | 'total'
  | 'total-fallback';

function normalizeRange(
  raw: string | null
): RankingRange | null {
  const value = String(
    raw ?? 'week'
  ).toLowerCase();

  if (
    value === 'day' ||
    value === 'week' ||
    value === 'total'
  ) {
    return value;
  }

  return null;
}

function normalizeRows(
  rows: FaqRankRow[]
) {
  return rows
    .map((row) => {
      const id = Number(row.id);
      const title = String(
        row.title ?? ''
      ).trim();
      const views = Number(
        row.views ?? 0
      );

      if (
        !Number.isInteger(id) ||
        id <= 0 ||
        !title ||
        !Number.isFinite(views) ||
        views <= 0
      ) {
        return null;
      }

      return {
        id,
        title,
        views,
      };
    })
    .filter(
      (
        item
      ): item is {
        id: number;
        title: string;
        views: number;
      } => item !== null
    );
}

async function readTotalRanking(
  limit: number
) {
  return (await sql`
    SELECT
      faq.id,
      faq.title,
      stats.views
    FROM faq_stats_total stats
    JOIN faq_questions faq
      ON faq.id = stats.faq_id
    WHERE stats.views > 0
    ORDER BY
      stats.views DESC,
      faq.updated_at DESC
        NULLS LAST,
      faq.id DESC
    LIMIT ${limit}
  `) as unknown as FaqRankRow[];
}

async function readDayRanking(
  limit: number
) {
  return (await sql`
    SELECT
      faq.id,
      faq.title,
      stats.views
    FROM faq_stats_daily stats
    JOIN faq_questions faq
      ON faq.id = stats.faq_id
    WHERE
      stats.day = CURRENT_DATE
      AND stats.views > 0
    ORDER BY
      stats.views DESC,
      faq.updated_at DESC
        NULLS LAST,
      faq.id DESC
    LIMIT ${limit}
  `) as unknown as FaqRankRow[];
}

async function readWeekRanking(
  limit: number
) {
  return (await sql`
    WITH weekly_views AS (
      SELECT
        faq_id,
        SUM(views)::bigint
          AS views
      FROM faq_stats_daily
      WHERE
        day >= (
          CURRENT_DATE -
          INTERVAL '6 days'
        )
      GROUP BY faq_id
    )
    SELECT
      faq.id,
      faq.title,
      weekly_views.views
    FROM weekly_views
    JOIN faq_questions faq
      ON faq.id =
        weekly_views.faq_id
    WHERE weekly_views.views > 0
    ORDER BY
      weekly_views.views DESC,
      faq.updated_at DESC
        NULLS LAST,
      faq.id DESC
    LIMIT ${limit}
  `) as unknown as FaqRankRow[];
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
    searchParams.get('limit') ?? 4
  );

  const limit = Number.isFinite(
    requestedLimit
  )
    ? Math.min(
        Math.max(
          Math.trunc(requestedLimit),
          1
        ),
        10
      )
    : 4;

  try {
    const result = await runDbRead(
      `api:home:faq-ranking:${range}`,
      async () => {
        if (range === 'total') {
          return {
            source:
              'total' as RankingSource,
            rows:
              await readTotalRanking(
                limit
              ),
          };
        }

        if (range === 'day') {
          return {
            source:
              'day' as RankingSource,
            rows:
              await readDayRanking(
                limit
              ),
          };
        }

        const weeklyRows =
          await readWeekRanking(limit);

        if (weeklyRows.length > 0) {
          return {
            source:
              'week' as RankingSource,
            rows: weeklyRows,
          };
        }

        /*
         * 기능 적용 직후에는 누적 통계만 있고
         * faq_stats_daily가 비어 있을 수 있다.
         *
         * 이때 Home이 빈 목록으로 보이지 않도록
         * 누적 순위를 임시 대체 표시한다.
         * 일간 데이터가 생기면 자동으로 주간 순위로 전환된다.
         */
        return {
          source:
            'total-fallback' as RankingSource,
          rows:
            await readTotalRanking(
              limit
            ),
        };
      },
      0
    );

    return NextResponse.json(
      {
        ok: true,
        range,
        source: result.source,
        items:
          normalizeRows(
            result.rows
          ),
      },
      {
        headers: {
          /*
           * 빈 결과가 5분 동안 고정되던 문제를 막는다.
           * HomePage의 fetch도 cache: no-store를 사용한다.
           */
          'Cache-Control':
            'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error(
      '[api/home/faqs] FAQ 순위 조회 실패:',
      error
    );

    return NextResponse.json(
      {
        ok: true,
        range,
        source: range,
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