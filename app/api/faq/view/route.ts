// =============================================
// File: app/api/faq/view/route.ts
// 전체 신규 파일
//
// 일반 문서 조회수와 동일한 구조:
// - 방문자/FAQ별 10분 중복 방지
// - 누적 집계
// - 일간 집계
// - 유입 경로(list/search/home/other) 집계
// =============================================

import crypto from 'crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { sql } from '@/wiki/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VIEW_COOLDOWN_MINUTES = 10;
const COOKIE_NAME = 'rd_vid';

const SOURCE_VALUES = [
  'list',
  'search',
  'home',
  'other',
] as const;

type FaqViewSource =
  (typeof SOURCE_VALUES)[number];

function makeVisitorId() {
  return crypto.randomUUID();
}

function noStoreHeaders() {
  return {
    'Cache-Control':
      'no-store, no-cache, must-revalidate, max-age=0',
  };
}

function normalizeSource(
  raw: unknown
): FaqViewSource {
  const value = String(raw ?? '').trim();

  return SOURCE_VALUES.includes(
    value as FaqViewSource
  )
    ? (value as FaqViewSource)
    : 'other';
}

function isConnectTimeoutError(
  error: unknown
) {
  const candidate = error as {
    code?: unknown;
    errno?: unknown;
    message?: unknown;
  };

  return (
    candidate?.code === 'CONNECT_TIMEOUT' ||
    candidate?.errno === 'CONNECT_TIMEOUT' ||
    String(candidate?.message ?? '').includes(
      'CONNECT_TIMEOUT'
    )
  );
}

async function bumpTotal(
  faqId: number,
  source: FaqViewSource
) {
  switch (source) {
    case 'list':
      await sql`
        INSERT INTO faq_stats_total (
          faq_id,
          views,
          list_views,
          updated_at
        )
        VALUES (
          ${faqId},
          1,
          1,
          NOW()
        )
        ON CONFLICT (faq_id)
        DO UPDATE SET
          views =
            faq_stats_total.views + 1,
          list_views =
            faq_stats_total.list_views + 1,
          updated_at = NOW()
      `;
      return;

    case 'search':
      await sql`
        INSERT INTO faq_stats_total (
          faq_id,
          views,
          search_views,
          updated_at
        )
        VALUES (
          ${faqId},
          1,
          1,
          NOW()
        )
        ON CONFLICT (faq_id)
        DO UPDATE SET
          views =
            faq_stats_total.views + 1,
          search_views =
            faq_stats_total.search_views + 1,
          updated_at = NOW()
      `;
      return;

    case 'home':
      await sql`
        INSERT INTO faq_stats_total (
          faq_id,
          views,
          home_views,
          updated_at
        )
        VALUES (
          ${faqId},
          1,
          1,
          NOW()
        )
        ON CONFLICT (faq_id)
        DO UPDATE SET
          views =
            faq_stats_total.views + 1,
          home_views =
            faq_stats_total.home_views + 1,
          updated_at = NOW()
      `;
      return;

    case 'other':
    default:
      await sql`
        INSERT INTO faq_stats_total (
          faq_id,
          views,
          other_views,
          updated_at
        )
        VALUES (
          ${faqId},
          1,
          1,
          NOW()
        )
        ON CONFLICT (faq_id)
        DO UPDATE SET
          views =
            faq_stats_total.views + 1,
          other_views =
            faq_stats_total.other_views + 1,
          updated_at = NOW()
      `;
  }
}

async function bumpDaily(
  faqId: number,
  source: FaqViewSource
) {
  switch (source) {
    case 'list':
      await sql`
        INSERT INTO faq_stats_daily (
          day,
          faq_id,
          views,
          list_views,
          updated_at
        )
        VALUES (
          CURRENT_DATE,
          ${faqId},
          1,
          1,
          NOW()
        )
        ON CONFLICT (day, faq_id)
        DO UPDATE SET
          views =
            faq_stats_daily.views + 1,
          list_views =
            faq_stats_daily.list_views + 1,
          updated_at = NOW()
      `;
      return;

    case 'search':
      await sql`
        INSERT INTO faq_stats_daily (
          day,
          faq_id,
          views,
          search_views,
          updated_at
        )
        VALUES (
          CURRENT_DATE,
          ${faqId},
          1,
          1,
          NOW()
        )
        ON CONFLICT (day, faq_id)
        DO UPDATE SET
          views =
            faq_stats_daily.views + 1,
          search_views =
            faq_stats_daily.search_views + 1,
          updated_at = NOW()
      `;
      return;

    case 'home':
      await sql`
        INSERT INTO faq_stats_daily (
          day,
          faq_id,
          views,
          home_views,
          updated_at
        )
        VALUES (
          CURRENT_DATE,
          ${faqId},
          1,
          1,
          NOW()
        )
        ON CONFLICT (day, faq_id)
        DO UPDATE SET
          views =
            faq_stats_daily.views + 1,
          home_views =
            faq_stats_daily.home_views + 1,
          updated_at = NOW()
      `;
      return;

    case 'other':
    default:
      await sql`
        INSERT INTO faq_stats_daily (
          day,
          faq_id,
          views,
          other_views,
          updated_at
        )
        VALUES (
          CURRENT_DATE,
          ${faqId},
          1,
          1,
          NOW()
        )
        ON CONFLICT (day, faq_id)
        DO UPDATE SET
          views =
            faq_stats_daily.views + 1,
          other_views =
            faq_stats_daily.other_views + 1,
          updated_at = NOW()
      `;
  }
}

export async function POST(
  request: NextRequest
) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_json',
      },
      {
        status: 400,
        headers: noStoreHeaders(),
      }
    );
  }

  const payload =
    body && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : {};

  const faqId = Number(payload.faqId);
  const source =
    normalizeSource(payload.source);

  if (
    !Number.isInteger(faqId) ||
    faqId <= 0
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_faqId',
      },
      {
        status: 400,
        headers: noStoreHeaders(),
      }
    );
  }

  let visitorId =
    request.cookies.get(COOKIE_NAME)?.value;

  let shouldSetCookie = false;

  if (!visitorId) {
    visitorId = makeVisitorId();
    shouldSetCookie = true;
  }

  if (
    process.env.DISABLE_VIEW_TRACKING === '1'
  ) {
    const response = NextResponse.json(
      {
        ok: true,
        counted: false,
        skipped: 'disabled',
        source,
        cooldownMinutes:
          VIEW_COOLDOWN_MINUTES,
      },
      {
        headers: noStoreHeaders(),
      }
    );

    if (shouldSetCookie) {
      response.cookies.set(
        COOKIE_NAME,
        visitorId,
        {
          httpOnly: true,
          sameSite: 'lax',
          secure:
            process.env.NODE_ENV ===
            'production',
          path: '/',
          maxAge:
            60 * 60 * 24 * 365,
        }
      );
    }

    return response;
  }

  try {
    const recentRows = await sql<{
      last_viewed_at: string;
    }[]>`
      SELECT last_viewed_at
      FROM faq_view_recent
      WHERE
        faq_id = ${faqId}
        AND visitor_id = ${visitorId}
      LIMIT 1
    `;

    const now = Date.now();

    const lastViewedAt =
      recentRows[0]?.last_viewed_at
        ? new Date(
            recentRows[0].last_viewed_at
          ).getTime()
        : 0;

    const cooldownMs =
      VIEW_COOLDOWN_MINUTES *
      60 *
      1000;

    const withinCooldown =
      Boolean(lastViewedAt) &&
      now - lastViewedAt < cooldownMs;

    if (!withinCooldown) {
      await bumpTotal(faqId, source);
      await bumpDaily(faqId, source);
    }

    await sql`
      INSERT INTO faq_view_recent (
        faq_id,
        visitor_id,
        last_viewed_at
      )
      VALUES (
        ${faqId},
        ${visitorId},
        NOW()
      )
      ON CONFLICT (
        faq_id,
        visitor_id
      )
      DO UPDATE SET
        last_viewed_at = NOW()
    `;

    const response = NextResponse.json(
      {
        ok: true,
        counted: !withinCooldown,
        source,
        cooldownMinutes:
          VIEW_COOLDOWN_MINUTES,
      },
      {
        headers: noStoreHeaders(),
      }
    );

    if (shouldSetCookie) {
      response.cookies.set(
        COOKIE_NAME,
        visitorId,
        {
          httpOnly: true,
          sameSite: 'lax',
          secure:
            process.env.NODE_ENV ===
            'production',
          path: '/',
          maxAge:
            60 * 60 * 24 * 365,
        }
      );
    }

    return response;
  } catch (error) {
    if (isConnectTimeoutError(error)) {
      console.warn(
        '[faq/view] DB timeout, skipping tracking'
      );

      const response = NextResponse.json(
        {
          ok: true,
          counted: false,
          skipped: 'db_timeout',
          source,
          cooldownMinutes:
            VIEW_COOLDOWN_MINUTES,
        },
        {
          headers: noStoreHeaders(),
        }
      );

      if (shouldSetCookie) {
        response.cookies.set(
          COOKIE_NAME,
          visitorId,
          {
            httpOnly: true,
            sameSite: 'lax',
            secure:
              process.env.NODE_ENV ===
              'production',
            path: '/',
            maxAge:
              60 * 60 * 24 * 365,
          }
        );
      }

      return response;
    }

    console.error(
      '[faq/view] unexpected error:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error: 'server_error',
      },
      {
        status: 500,
        headers: noStoreHeaders(),
      }
    );
  }
}
