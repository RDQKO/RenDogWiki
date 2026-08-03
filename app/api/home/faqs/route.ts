// =============================================
// 실제 적용 경로:
// app/api/home/faqs/route.ts
//
// 전체 교체용 코드
//
// 수정 내용:
// - FAQ 순위 응답에 질문 본문과 태그를 함께 포함
// - Home 순위 클릭 시 별도 상세 조회 없이 모달 표시 가능
// - day / week / total 지원 유지
// - 주간 데이터가 없으면 누적 통계를 임시 대체 표시
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
  content: string | null;
  tags: unknown;
  uploader: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  views: number | string | bigint;
};

type RankingSource =
  | 'day'
  | 'week'
  | 'total'
  | 'total-fallback';

function normalizeRange(
  raw: string | null,
): RankingRange | null {
  const value = String(
    raw ?? 'week',
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

function normalizeTags(
  value: unknown,
): string[] {
  if (Array.isArray(value)) {
    return value
      .map((tag) =>
        String(tag).trim(),
      )
      .filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  const source = value.trim();

  if (!source) {
    return [];
  }

  if (
    source.startsWith('{') &&
    source.endsWith('}')
  ) {
    const inner =
      source.slice(1, -1);

    if (!inner) {
      return [];
    }

    const output: string[] = [];
    let current = '';
    let quoted = false;

    for (
      let index = 0;
      index < inner.length;
      index += 1
    ) {
      const character = inner[index];

      if (
        character === '"' &&
        inner[index - 1] !== '\\'
      ) {
        quoted = !quoted;
        continue;
      }

      if (
        character === ',' &&
        !quoted
      ) {
        output.push(
          current
            .replace(/\\"/g, '"')
            .trim(),
        );
        current = '';
        continue;
      }

      current += character;
    }

    output.push(
      current
        .replace(/\\"/g, '"')
        .trim(),
    );

    return output.filter(Boolean);
  }

  return source
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeDate(
  value: Date | string | null,
): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const text = String(value).trim();

  return text || undefined;
}

function normalizeRows(
  rows: FaqRankRow[],
) {
  return rows
    .map((row) => {
      const id = Number(row.id);
      const title = String(
        row.title ?? '',
      ).trim();
      const views = Number(
        row.views ?? 0,
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
        content: String(
          row.content ?? '',
        ),
        tags: normalizeTags(
          row.tags,
        ),
        uploader: String(
          row.uploader ?? '',
        ),
        created_at: normalizeDate(
          row.created_at,
        ),
        updated_at: normalizeDate(
          row.updated_at,
        ),
        views,
      };
    })
    .filter(
      (
        item,
      ): item is {
        id: number;
        title: string;
        content: string;
        tags: string[];
        uploader: string;
        created_at: string | undefined;
        updated_at: string | undefined;
        views: number;
      } => item !== null,
    );
}


async function readTotalRanking(
  limit: number,
) {
  return (await sql`
    SELECT
      faq.id,
      faq.title,
      faq.content,
      faq.tags,
      faq.uploader,
      faq.created_at,
      faq.updated_at,
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
  limit: number,
) {
  return (await sql`
    SELECT
      faq.id,
      faq.title,
      faq.content,
      faq.tags,
      faq.uploader,
      faq.created_at,
      faq.updated_at,
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
  limit: number,
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
      faq.content,
      faq.tags,
      faq.uploader,
      faq.created_at,
      faq.updated_at,
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
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const requestedLimit = Number(
    searchParams.get('limit') ?? 4,
  );

  const limit = Number.isFinite(
    requestedLimit,
  )
    ? Math.min(
        Math.max(
          Math.trunc(requestedLimit),
          1,
        ),
        10,
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
                limit,
              ),
          };
        }

        if (range === 'day') {
          return {
            source:
              'day' as RankingSource,
            rows:
              await readDayRanking(
                limit,
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
         */
        return {
          source:
            'total-fallback' as RankingSource,
          rows:
            await readTotalRanking(
              limit,
            ),
        };
      },
      1,
    );

    return NextResponse.json(
      {
        ok: true,
        range,
        source: result.source,
        items:
          normalizeRows(
            result.rows,
          ),
      },
      {
        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate, max-age=0',
        },
      },
    );
  } catch (error) {
    console.error(
      '[api/home/faqs] FAQ 순위 조회 실패:',
      error,
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
      },
    );
  }
}
