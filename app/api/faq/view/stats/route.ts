// =============================================
// File: app/api/faq/view/stats/route.ts
// 전체 신규 파일
//
// FAQ 조회 통계:
// - range=total
// - range=day
// - range=week (오늘 포함 최근 7일)
// =============================================

import { NextResponse } from 'next/server';

import { sql } from '@/wiki/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type StatsRow = {
  faq_id: number;
  views: bigint;
  list_views: bigint;
  search_views: bigint;
  home_views: bigint;
  other_views: bigint;
};

function toItem(row: StatsRow) {
  return {
    faqId: Number(row.faq_id),
    views: Number(row.views ?? 0),
    listViews:
      Number(row.list_views ?? 0),
    searchViews:
      Number(row.search_views ?? 0),
    homeViews:
      Number(row.home_views ?? 0),
    otherViews:
      Number(row.other_views ?? 0),
  };
}

export async function GET(
  request: Request
) {
  const { searchParams } =
    new URL(request.url);

  const range = (
    searchParams.get('range') ||
    'week'
  ).toLowerCase();

  if (
    !['total', 'day', 'week'].includes(
      range
    )
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_range',
      },
      {
        status: 400,
      }
    );
  }

  if (range === 'total') {
    const rows = await sql<StatsRow[]>`
      SELECT
        faq_id,
        views,
        list_views,
        search_views,
        home_views,
        other_views
      FROM faq_stats_total
    `;

    return NextResponse.json({
      ok: true,
      range,
      items: rows.map(toItem),
    });
  }

  if (range === 'day') {
    const rows = await sql<StatsRow[]>`
      SELECT
        faq_id,
        views,
        list_views,
        search_views,
        home_views,
        other_views
      FROM faq_stats_daily
      WHERE day = CURRENT_DATE
    `;

    return NextResponse.json({
      ok: true,
      range,
      items: rows.map(toItem),
    });
  }

  const rows = await sql<StatsRow[]>`
    SELECT
      faq_id,
      SUM(views)::bigint
        AS views,
      SUM(list_views)::bigint
        AS list_views,
      SUM(search_views)::bigint
        AS search_views,
      SUM(home_views)::bigint
        AS home_views,
      SUM(other_views)::bigint
        AS other_views
    FROM faq_stats_daily
    WHERE
      day >= (
        CURRENT_DATE -
        INTERVAL '6 days'
      )
    GROUP BY faq_id
  `;

  return NextResponse.json({
    ok: true,
    range,
    items: rows.map(toItem),
  });
}
