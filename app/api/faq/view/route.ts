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

import { recordView } from '@/wiki/lib/recordView';

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
    const recorded = await recordView('faq', faqId, visitorId, source);
    if (!recorded.exists) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404, headers: noStoreHeaders() });
    }
    const withinCooldown = !recorded.counted;

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
